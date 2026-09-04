"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, personaHaAccessoAdmin, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import { revalidatePath } from "next/cache";
import { inviaEmail, emailRichiestaDatiSegnalazione, emailApprovazioneContratto } from "@/lib/email";
import { urlFirmataDocumento } from "@/lib/documenti";
import { notificaSuTuttiICanali } from "@/lib/notifiche-interne";
import type { AreaAccesso, Copertura, StatoSegnalazione } from "@/lib/types";

async function verificaAdmin(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Non autenticato.";
  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona)) return "Solo un amministratore può eliminare una Segnalazione.";
  return null;
}

// ★ NUOVA — richiesta esplicita: un amministratore deve poter eliminare una
// Segnalazione creata per errore/duplicata. "segnalazioni" non ha policy
// RLS di delete (solo select/insert/update, vedi 0001_init.sql), quindi la
// cancellazione vera passa dalla service role, dopo aver verificato qui
// che chi chiama sia admin. Bloccata se esiste già un Ticket collegato
// (tickets.segnalazione_id non ha ON DELETE CASCADE: la FK bloccherebbe
// comunque la query, ma un errore Postgres grezzo non spiega cosa fare —
// meglio dirlo subito e chiaro).
export async function eliminaSegnalazione(id: string) {
  const supabase = await createClient();
  const erroreAccesso = await verificaAdmin(supabase);
  if (erroreAccesso) return { errore: erroreAccesso };
  const personaId = await getPersonaCorrenteId();

  const { data: segnalazione, error: erroreLettura } = await supabase
    .from("segnalazioni")
    .select("numero, nome")
    .eq("id", id)
    .single();
  if (erroreLettura || !segnalazione) return { errore: erroreLettura?.message || "Segnalazione non trovata." };

  const service = createServiceClient();

  const { data: ticketCollegato } = await service.from("tickets").select("numero").eq("segnalazione_id", id).maybeSingle();
  if (ticketCollegato) return { errore: `Elimina prima il Ticket collegato (#${ticketCollegato.numero}).` };

  // ★ i dati/documenti inviati dal cliente per questa Segnalazione non
  // hanno senso senza di essa (nessun Ticket a cui restano comunque
  // agganciati, appena verificato sopra) — vengono rimossi insieme.
  await service.from("richieste_clienti").delete().eq("segnalazione_id", id);

  const { error } = await service.from("segnalazioni").delete().eq("id", id);
  if (error) return { errore: error.message };

  await service.from("storico").insert({
    origine: "segnalazione",
    riferimento_id: id,
    operazione: "Segnalazione eliminata",
    valore_prima: `#${segnalazione.numero} — ${segnalazione.nome}`,
    operatore_id: personaId,
  });

  revalidatePath("/segnalazioni");
  return { errore: null };
}

// ★ invia davvero l'email (Resend) dall'indirizzo del reparto Commerciale
// invece del mailto: che apriva il client di posta personale dell'operatore
// — il cliente riceve sempre da commerciale@donewifi.it, non da un
// indirizzo diverso a seconda di chi ha in mano la pratica in quel momento.
export async function inviaEmailRichiestaDatiSegnalazione(segnalazioneId: string, origine: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { data: segnalazione } = await supabase.from("segnalazioni").select("nome, email").eq("id", segnalazioneId).single();
  if (!segnalazione) return { errore: "Segnalazione non trovata." };
  if (!segnalazione.email) return { errore: "Il cliente non ha un'email registrata su questa segnalazione." };

  const link = `${origine}/richiesta-dati/${segnalazioneId}`;
  const { oggetto, corpoHtml, corpoTesto } = emailRichiestaDatiSegnalazione(segnalazione.nome, link);
  const risultato = await inviaEmail({
    a: segnalazione.email,
    oggetto,
    corpoHtml,
    corpoTesto,
    reparto: "Commerciale",
  });
  return risultato;
}

// ★ le Server Action, in produzione, nascondono al client il messaggio di
// un errore lanciato con "throw" — per mostrare messaggi utili bisogna
// restituirli come dato ({ errore }), non lanciarli.

// ★ NUOVA — i contratti oggi si generano su un altro gestionale: qui non
// li si genera, li si carica come PDF già pronto sulla Segnalazione,
// prima di trasmettere per l'installazione. Il bucket è privato: upload
// e lettura passano dalla service role (stesso pattern del modulo
// pubblico Richiesta Dati), l'URL restituito al browser è sempre firmato
// e a scadenza breve.
export async function caricaContrattoSegnalazione(segnalazioneId: string, formData: FormData) {
  const supabase = await createClient();
  // ★ FIX SICUREZZA — controllava solo che ci fosse un cookie persona
  // valido (getPersonaCorrenteId), non che lo staff fosse ancora attivo:
  // sotto si passa alla service role per l'upload, che bypassa la RLS.
  // Stesso pattern già corretto per le funzioni "URL firmata documento".
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: ERRORE_PERSONA_MANCANTE };
  const personaId = persona.id;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { errore: "Nessun file selezionato." };
  if (file.type !== "application/pdf") return { errore: "Il contratto deve essere un file PDF." };

  const service = createServiceClient();
  const percorso = `contratti/${segnalazioneId}-${Date.now()}-${file.name}`;
  const { error: erroreUpload } = await service.storage
    .from("documenti")
    .upload(percorso, file, { contentType: "application/pdf" });
  if (erroreUpload) return { errore: erroreUpload.message };

  // ★ FIX — sostituire il PDF (es. errore nel primo caricamento) lasciava
  // intatta un'eventuale approvazione già data dal cliente: l'interfaccia
  // continuava a mostrare "Contratto approvato" riferendosi in realtà al
  // file vecchio, e "Trasmetti" restava sbloccato per un contratto che il
  // cliente non ha mai visto. Ogni nuovo caricamento azzera l'approvazione
  // (e l'invio), costringendo a rimandarla per il file nuovo.
  const { error } = await supabase
    .from("segnalazioni")
    .update({
      contratto_pdf_url: percorso,
      contratto_inviato_approvazione_il: null,
      contratto_approvato_cliente_il: null,
      aggiornato_il: new Date().toISOString(),
    })
    .eq("id", segnalazioneId);
  if (error) return { errore: error.message };

  await supabase.from("storico").insert({
    origine: "segnalazione",
    riferimento_id: segnalazioneId,
    operazione: "Contratto caricato",
    valore_dopo: file.name,
    operatore_id: personaId,
  });

  revalidatePath("/segnalazioni");
  return { errore: null, percorso };
}

// ★ FIX — "chi/quando ha caricato il contratto" era già tracciato (voce
// storico "Contratto caricato" con operatore_id), semplicemente mai
// mostrato: bisognava aprire lo Storico Modifiche a parte per saperlo.
// Non è una firma elettronica (nessuna verifica legale dell'identità di
// chi firma il PDF fuori dal gestionale) — solo la tracciabilità di chi,
// nel nostro staff, ha caricato quale file e quando, resa visibile nella
// stessa scheda della Segnalazione.
// ★ FIX — forma del join dichiarata esplicitamente invece di un doppio
// cast `as unknown as` che si limitava a "fidati": l'unica FK tra storico
// e persone è storico_operatore_id_fkey (verificato nelle migrazioni), la
// relazione è sempre a un solo oggetto, mai un array — questa interfaccia
// lo rende esplicito invece di aggirare il controllo dei tipi.
interface RigaStoricoContratto {
  data: string;
  operatore_id: string | null;
  persone: { nome: string } | null;
}

export async function getUltimoCaricamentoContratto(segnalazioneId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("storico")
    .select("data, operatore_id, persone:operatore_id (nome)")
    .eq("origine", "segnalazione")
    .eq("riferimento_id", segnalazioneId)
    .eq("operazione", "Contratto caricato")
    .order("data", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error("getUltimoCaricamentoContratto:", error.message);
  if (!data) return null;
  const riga = data as unknown as RigaStoricoContratto;
  return { data: riga.data, nome: riga.persone?.nome ?? "utente non più attivo" };
}

export async function urlContratto(percorso: string) {
  const supabase = await createClient();
  // ★ FIX SICUREZZA — vedi urlDocumentoRichiesta(): controllava solo la
  // sessione Auth, non `persone.attivo`, mentre sotto la service role
  // bypassa la RLS per generare l'URL firmata.
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: "Non autenticato.", url: null };

  return urlFirmataDocumento(percorso);
}

// ★ NUOVA — richiesta esplicita: "Trasmetti per l'installazione" deve poter
// uscire solo dopo che il cliente ha davvero approvato il contratto, non
// solo perché è stato caricato un PDF. Stesso principio già usato per
// l'approvazione dell'intervento su Ticket (inviaEmailApprovazioneTicket()):
// un link monouso inviato all'email del cliente, che una volta cliccato è
// la prova che l'approvazione viene proprio da quella casella — niente di
// più (non è una firma elettronica qualificata), ma già a norma per come
// veniva gestito anche nel vecchio gestionale per gli interventi.
export async function inviaEmailApprovazioneContratto(segnalazioneId: string, origine: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();

  const { data: segnalazione } = await supabase
    .from("segnalazioni")
    .select("numero, nome, email, contratto_pdf_url")
    .eq("id", segnalazioneId)
    .single();
  if (!segnalazione) return { errore: "Segnalazione non trovata." };
  if (!segnalazione.email) return { errore: "Il cliente non ha un'email registrata su questa segnalazione." };
  if (!segnalazione.contratto_pdf_url) return { errore: "Carica prima il contratto firmato." };

  const service = createServiceClient();
  const { data: creato, error } = await service
    .from("token_approvazione")
    .insert({ segnalazione_id: segnalazioneId, origine: "contratto" })
    .select("token")
    .single();
  if (error) return { errore: error.message };

  const link = `${origine}/approva/${creato.token}`;
  const { oggetto, corpoHtml, corpoTesto } = emailApprovazioneContratto(segnalazione.nome, segnalazione.numero, link);
  const risultato = await inviaEmail({ a: segnalazione.email, oggetto, corpoHtml, corpoTesto, reparto: "Commerciale" });
  if (risultato.errore) return { errore: risultato.errore };

  await supabase
    .from("segnalazioni")
    .update({ contratto_inviato_approvazione_il: new Date().toISOString() })
    .eq("id", segnalazioneId);

  await supabase.from("storico").insert({
    origine: "segnalazione",
    riferimento_id: segnalazioneId,
    operazione: "Contratto inviato per approvazione",
    valore_dopo: segnalazione.email,
    operatore_id: personaId,
  });

  // ★ NUOVA — richiesta esplicita: chi pianifica le installazioni (Analisi
  // Rete) deve saperlo appena il contratto parte per l'approvazione, non
  // solo quando arriva "Trasmetti" — così può iniziare a organizzarsi in
  // parallelo all'attesa della conferma del cliente, invece di scoprire la
  // pratica solo a cose fatte.
  // ★ ESTESA (2026-08-27, "fai la A" — Proposta A dell'artifact
  // "Estensione Notifiche") — prima solo Chat interna, ora anche
  // Telegram ed email verso attivazioni@donewifi.it.
  const linkSegnalazione = `${origine}/segnalazioni?aperto=${segnalazioneId}`;
  await notificaSuTuttiICanali({
    reparto: "Analisi Rete",
    telegramHtml: `📄 <b>Contratto inviato per approvazione</b>\n\n${segnalazione.nome} (Segnalazione #${segnalazione.numero})\n\nPuoi iniziare a organizzare l'installazione — sarà trasmesso ufficialmente appena il cliente approva.`,
    chatTesto: `📄 Contratto inviato per approvazione a ${segnalazione.nome} (Segnalazione #${segnalazione.numero}). Puoi iniziare a organizzare l'installazione — sarà trasmesso ufficialmente appena il cliente approva.`,
    emailTitolo: `Contratto inviato per approvazione — Segnalazione #${segnalazione.numero}`,
    emailCorpoHtml: `<p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Cliente: <b>${segnalazione.nome}</b><br>Puoi iniziare a organizzare l'installazione — sarà trasmesso ufficialmente appena il cliente approva.</p>`,
    emailCorpoTesto: `Cliente: ${segnalazione.nome}\nPuoi iniziare a organizzare l'installazione — sarà trasmesso ufficialmente appena il cliente approva.`,
    emailLink: linkSegnalazione,
  });

  revalidatePath("/segnalazioni");
  return { errore: null };
}

export async function creaSegnalazione(dati: {
  nome: string;
  telefono: string;
  email: string;
  via: string;
  civico: string;
  comune: string;
  cap: string;
  copertura: Copertura;
  note: string;
  /** ★ NUOVA — richiesta esplicita: sapere già da qui se è un privato o
   * un'azienda, invece di scoprirlo solo quando arriva la Richiesta Dati
   * (a quel punto lo sceglie di nuovo il cliente stesso nel configuratore
   * piano, e quel valore prevale se diverso — qui è solo la prima stima
   * di chi prende la chiamata). */
  tipologiaCliente: "Privato" | "Azienda";
  /** ★ NUOVA — messo a true dal form solo dopo che l'operatore ha visto
   * l'avviso di possibile duplicato e ha confermato di voler procedere lo
   * stesso (es. è davvero un cliente diverso con lo stesso numero di
   * famiglia). Senza conferma, in presenza di un duplicato la Segnalazione
   * NON viene creata — vedi sotto. */
  forza?: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };
  // ★ NUOVA — richiesta esplicita: senza email non si può mandare la
  // Richiesta Dati (né le comunicazioni successive: approvazione contratto,
  // ecc.), ripetuto qui perché il controllo lato client non basta da solo.
  if (!dati.email.trim()) return { errore: "L'email è obbligatoria." };

  // ★ NUOVA — nessun controllo esisteva su telefono/email già usati da
  // un'altra Segnalazione: un cliente che richiama, o due operatori che
  // prendono la stessa chiamata, creavano un doppione invisibile (si
  // scopriva solo aprendo per caso entrambe le pratiche). Un avviso soft
  // invece di un blocco vero: può darsi che sia davvero un'altra persona
  // con lo stesso numero (es. numero di casa condiviso).
  if (!dati.forza) {
    const { data: duplicati } = await supabase
      .from("segnalazioni")
      .select("numero, nome, stato")
      .or(`telefono.eq.${dati.telefono},email.eq.${dati.email}`)
      .limit(5);
    if (duplicati && duplicati.length > 0) {
      return {
        errore: null,
        duplicati: duplicati.map((d) => `#${d.numero} — ${d.nome} (${d.stato})`),
      };
    }
  }

  const { data, error } = await supabase
    .from("segnalazioni")
    .insert({
      nome: dati.nome,
      telefono: dati.telefono,
      email: dati.email || null,
      via: dati.via,
      civico: dati.civico,
      comune: dati.comune,
      cap: dati.cap,
      copertura: dati.copertura,
      note: dati.note || null,
      tipologia_cliente: dati.tipologiaCliente,
      operatore_id: personaId,
    })
    .select("id, numero")
    .single();

  if (error) return { errore: error.message };

  await supabase.from("storico").insert({
    origine: "segnalazione",
    riferimento_id: data.id,
    operazione: "Creazione Segnalazione",
    valore_dopo: "Da Contattare",
    operatore_id: personaId,
  });

  // ★ NUOVA (2026-08) — richiesta esplicita: promemoria via email verso
  // attivazioni@donewifi.it ad ogni nuova Segnalazione — non blocca la
  // creazione se l'invio fallisce (stesso principio delle notifiche
  // Telegram/Chat già in uso altrove).
  // ★ ESTESA (2026-08-27, "fai la A" — Proposta A dell'artifact
  // "Estensione Notifiche") — prima solo Email, ora anche Telegram e
  // Chat interna, stesso trattamento di ogni altro evento.
  await notificaSuTuttiICanali({
    reparto: "Commerciale",
    telegramHtml: `📞 <b>Nuova segnalazione #${data.numero}</b>\n\nCliente: ${dati.nome}\nComune: ${dati.comune}\nTelefono: ${dati.telefono}`,
    chatTesto: `📞 Nuova segnalazione #${data.numero} — ${dati.nome} (${dati.comune}).`,
    emailTitolo: `Nuova segnalazione #${data.numero}`,
    emailCorpoHtml: `<p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Cliente: <b>${dati.nome}</b><br>Comune: ${dati.comune}<br>Telefono: ${dati.telefono}${dati.email ? `<br>Email: ${dati.email}` : ""}${dati.tipologiaCliente ? `<br>Tipologia: ${dati.tipologiaCliente}` : ""}</p>`,
    emailCorpoTesto: `Cliente: ${dati.nome}\nComune: ${dati.comune}\nTelefono: ${dati.telefono}${dati.email ? `\nEmail: ${dati.email}` : ""}${dati.tipologiaCliente ? `\nTipologia: ${dati.tipologiaCliente}` : ""}`,
    emailLink: "https://gestione.donewifi.it/segnalazioni",
  });

  revalidatePath("/segnalazioni");
  return { errore: null, id: data.id, numero: data.numero };
}

export async function cambiaStatoSegnalazione(id: string, statoNuovo: StatoSegnalazione, statoVecchio: StatoSegnalazione) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

  const aggiornamento: Record<string, unknown> = { stato: statoNuovo, aggiornato_il: new Date().toISOString() };
  if (statoNuovo === "Gestione Cliente") {
    aggiornamento.documenti_richiesti_at = new Date().toISOString();
  }

  const { error } = await supabase.from("segnalazioni").update(aggiornamento).eq("id", id);
  if (error) return { errore: error.message };

  await supabase.from("storico").insert({
    origine: "segnalazione",
    riferimento_id: id,
    operazione: "Cambio Stato",
    valore_prima: statoVecchio,
    valore_dopo: statoNuovo,
    operatore_id: personaId,
  });

  revalidatePath("/segnalazioni");
  return { errore: null };
}

// ★ NUOVA (2026-08) — richiesta esplicita: "i dati inseriti devono essere
// tutti editabili e modificabili perché possono nascere errori quando
// l'operatore prende i dati" — prima, una volta creata, una Segnalazione
// non aveva NESSUN modo di correggere un refuso su nome/telefono/email/
// indirizzo/copertura/tipologia/note: bisognava eliminarla e ricrearla da
// capo. Un solo campo alla volta non serviva (l'errore più comune è un
// numero o un indirizzo scritto male mentre si è al telefono) — un unico
// modulo con tutti i campi, come già in creaSegnalazione().
export async function aggiornaDatiSegnalazione(
  id: string,
  dati: {
    nome: string;
    telefono: string;
    email: string;
    via: string;
    civico: string;
    comune: string;
    cap: string;
    copertura: Copertura;
    tipologiaCliente: "Privato" | "Azienda";
    note: string;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

  if (!dati.nome.trim()) return { errore: "Il nome è obbligatorio." };
  if (!dati.telefono.trim()) return { errore: "Il telefono è obbligatorio." };

  const { error } = await supabase
    .from("segnalazioni")
    .update({
      nome: dati.nome.trim(),
      telefono: dati.telefono.trim(),
      email: dati.email.trim() || null,
      via: dati.via.trim(),
      civico: dati.civico.trim(),
      comune: dati.comune.trim(),
      cap: dati.cap.trim(),
      copertura: dati.copertura,
      tipologia_cliente: dati.tipologiaCliente,
      note: dati.note.trim() || null,
      aggiornato_il: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { errore: error.message };

  await supabase.from("storico").insert({
    origine: "segnalazione",
    riferimento_id: id,
    operazione: "Dati modificati",
    operatore_id: personaId,
  });

  revalidatePath("/segnalazioni");
  return { errore: null };
}

// ★ NUOVA (2026-08) — richiesta esplicita: "parcheggio" per un cliente già
// contattato ma ancora indeciso, senza forzarlo avanti a "Gestione Cliente"
// (che avvierebbe subito la richiesta dati) né lasciarlo invisibile in
// mezzo ai lead appena arrivati — Opzione C della proposta con artifact,
// un'etichetta trasversale (motivo + data di richiamo) invece di un nuovo
// valore di `stato`, vedi segnalazioni-board.tsx per il raggruppamento
// visivo "In attesa di decisione" dentro la colonna "In Contatto".
export async function impostaDubbioso(id: string, motivo: string, richiamareIl: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

  const { error } = await supabase
    .from("segnalazioni")
    .update({ dubbioso_dal: new Date().toISOString(), motivo_dubbio: motivo || null, richiamare_il: richiamareIl || null })
    .eq("id", id);
  if (error) return { errore: error.message };

  await supabase.from("storico").insert({
    origine: "segnalazione",
    riferimento_id: id,
    operazione: "Segnata come dubbiosa",
    valore_dopo: motivo || "(nessun motivo indicato)",
    operatore_id: personaId,
  });

  revalidatePath("/segnalazioni");
  return { errore: null };
}

export async function rimuoviDubbioso(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

  const { error } = await supabase
    .from("segnalazioni")
    .update({ dubbioso_dal: null, motivo_dubbio: null, richiamare_il: null })
    .eq("id", id);
  if (error) return { errore: error.message };

  await supabase.from("storico").insert({
    origine: "segnalazione",
    riferimento_id: id,
    operazione: "Non più dubbiosa",
    operatore_id: personaId,
  });

  revalidatePath("/segnalazioni");
  return { errore: null };
}

// ★ NUOVA — a differenza del gestionale precedente (dove "Trasmetti per
// l'installazione" creava il Ticket in un foglio separato senza un
// collegamento affidabile alla Segnalazione d'origine, vedi bug risolto
// in Codice.js/_trovaRigaSegnalazionePerIdTicket), qui il ticket porta
// segnalazione_id come FK reale fin dalla creazione.
// ★ FIX — il reparto del Ticket creato era fisso su "Analisi Rete" nel
// codice, corretto per la stragrande maggioranza dei casi reali (fa
// sempre l'installazione) ma senza modo di derogare per un'eccezione.
// Ora è un parametro con quello stesso default, scelto da chi trasmette
// invece che cablato.
/** Riga di segnalazione minima necessaria per trasmettere — sia dal
 * pulsante manuale (client con sessione) sia dal trigger automatico
 * (service role, senza sessione) leggono/passano lo stesso shape. */
type SegnalazioneDaTrasmettere = {
  id: string;
  numero: number;
  nome: string;
  telefono: string;
  email: string;
  via: string;
  civico: string;
  comune: string;
  cap: string;
  note: string | null;
  stato: StatoSegnalazione;
  tipologia_cliente: string | null;
  profilo_internet: string | null;
  contratto_pdf_url: string | null;
  contratto_approvato_cliente_il: string | null;
};

/** Stessa validazione ("unica fonte di verità") usata sia dal pulsante
 * manuale sia dal trigger automatico all'approvazione del cliente — vedi
 * eseguiTrasmissione() più sotto. */
function mancantiPerTrasmissione(segnalazione: SegnalazioneDaTrasmettere): string[] {
  const mancanti: string[] = [];
  if (!segnalazione.tipologia_cliente || !segnalazione.profilo_internet) mancanti.push("dati del cliente (Richiesta Dati)");
  if (!segnalazione.contratto_pdf_url) mancanti.push("contratto firmato");
  else if (!segnalazione.contratto_approvato_cliente_il) mancanti.push("approvazione del contratto da parte del cliente");
  return mancanti;
}

/** ★ NUOVA — crea il Ticket di installazione e passa la Segnalazione a
 * "Trasmessa". Un client Supabase già passato (service role per il
 * trigger automatico, quello con sessione per il pulsante manuale) e un
 * `personaId` nullable (null = trasmissione automatica, nessun operatore
 * umano coinvolto — storico/creato_da restano null, stesso principio già
 * in uso per i cron: un'azione di sistema, non di una persona). */
async function eseguiTrasmissione(
  supabase: ReturnType<typeof createServiceClient> | Awaited<ReturnType<typeof createClient>>,
  segnalazione: SegnalazioneDaTrasmettere,
  reparto: AreaAccesso,
  personaId: string | null
): Promise<{ errore: string; id?: undefined; numero?: undefined } | { errore: null; id: string; numero: number }> {
  const { data: ticket, error: erroreTicket } = await supabase
    .from("tickets")
    .insert({
      cliente: segnalazione.nome,
      telefono: segnalazione.telefono,
      email: segnalazione.email,
      indirizzo: `${segnalazione.via} ${segnalazione.civico}, ${segnalazione.comune} (${segnalazione.cap})`,
      categoria: "Commerciale",
      problema: `Installazione da segnalazione #${segnalazione.numero}.${segnalazione.note ? " Note: " + segnalazione.note : ""}`,
      priorita: "Normale",
      reparto,
      tipologia_cliente: segnalazione.tipologia_cliente,
      profilo_internet: segnalazione.profilo_internet,
      contratto_pdf_url: segnalazione.contratto_pdf_url,
      segnalazione_id: segnalazione.id,
      creato_da: personaId,
    })
    .select("id, numero")
    .single();
  if (erroreTicket || !ticket) return { errore: erroreTicket?.message || "Creazione del Ticket non riuscita." };

  const { error: erroreStato } = await supabase
    .from("segnalazioni")
    .update({ stato: "Trasmessa", aggiornato_il: new Date().toISOString() })
    .eq("id", segnalazione.id);
  if (erroreStato) return { errore: erroreStato.message };

  await supabase.from("storico").insert([
    {
      origine: "segnalazione",
      riferimento_id: segnalazione.id,
      operazione: personaId ? "Trasmessa per installazione" : "Trasmessa per installazione (automatico, all'approvazione del cliente)",
      valore_prima: segnalazione.stato,
      valore_dopo: "Trasmessa",
      operatore_id: personaId,
    },
    {
      origine: "ticket",
      riferimento_id: ticket.id,
      operazione: "Creato da Segnalazione",
      valore_dopo: `Segnalazione #${segnalazione.numero}`,
      operatore_id: personaId,
    },
  ]);

  if (!personaId) {
    // ★ ESTESA (2026-08-27, "fai la A" — Proposta A dell'artifact
    // "Estensione Notifiche") — prima solo Chat interna, ora anche
    // Telegram ed email: è il cliente ad approvare da solo, senza che
    // nessun operatore sia coinvolto — lo stesso motivo per cui è uno dei
    // "buchi" trovati nell'audit, va notificato con la stessa forza di
    // "documentazione ricevuta".
    await notificaSuTuttiICanali({
      reparto,
      telegramHtml: `📄 <b>Ticket #${ticket.numero} creato automaticamente</b>\n\nContratto approvato dal cliente (Segnalazione #${segnalazione.numero}: ${segnalazione.nome}).`,
      chatTesto: `📄 Ticket #${ticket.numero} creato automaticamente — contratto approvato dal cliente (Segnalazione #${segnalazione.numero}).`,
      emailTitolo: `Contratto approvato — Ticket #${ticket.numero} creato`,
      emailCorpoHtml: `<p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Il cliente <b>${segnalazione.nome}</b> ha approvato il contratto (Segnalazione #${segnalazione.numero}): il Ticket #${ticket.numero} è stato creato in automatico, pronto per essere pianificato.</p>`,
      emailCorpoTesto: `Il cliente ${segnalazione.nome} ha approvato il contratto (Segnalazione #${segnalazione.numero}): il Ticket #${ticket.numero} è stato creato in automatico, pronto per essere pianificato.`,
      emailLink: `https://gestione.donewifi.it/tickets?aperto=${ticket.id}`,
    });
  }

  revalidatePath("/segnalazioni");
  revalidatePath("/tickets");
  return { errore: null, id: ticket.id, numero: ticket.numero };
}

/**
 * ★ NUOVA (2026-09-04, richiesta esplicita: "quando è trasmesso deve
 * indicare che il cliente ha approvato ed è in attesa di installazione.
 * infine deve essere notificato che è stato installato e mettere il link
 * al suo rapporto di lavoro dell'installazione" — chiarito con l'utente:
 * nessuna notifica vera e propria, solo visibile aprendo la Segnalazione/
 * il Ticket) — prima, una volta "Trasmessa", la Segnalazione mostrava solo
 * il testo fisso "l'installazione è in carico ad Analisi Rete", punto e
 * fine: nessun modo di sapere se poi fosse stata davvero installata, né un
 * link al Ticket o al rapporto di lavoro. Un solo giro leggero (3 colonne)
 * invece di un fetch pesante — usata solo quando la Segnalazione è già
 * "Trasmessa", non per ogni riga della bacheca.
 */
export async function getTicketPerSegnalazione(segnalazioneId: string): Promise<{ id: string; numero: number; stato: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tickets").select("id, numero, stato").eq("segnalazione_id", segnalazioneId).maybeSingle();
  if (error) console.error("getTicketPerSegnalazione:", error.message);
  return data ?? null;
}

export async function trasmettiPerInstallazione(
  segnalazioneId: string,
  reparto: AreaAccesso = "Analisi Rete"
): Promise<{ errore: string; id?: undefined; numero?: undefined } | { errore: null; id: string; numero: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

  const { data: segnalazione, error: erroreLettura } = await supabase
    .from("segnalazioni")
    .select("*")
    .eq("id", segnalazioneId)
    .single();
  if (erroreLettura || !segnalazione) return { errore: erroreLettura?.message || "Segnalazione non trovata." };

  // ★ FIX — questo controllo esisteva solo nel componente React
  // (pulsante disabilitato finché mancano dati/contratto): chi chiamasse
  // l'azione direttamente (o un pulsante aggiunto altrove in futuro)
  // poteva trasmettere una pratica incompleta senza che nulla lo
  // impedisse davvero. Ripetuto qui, unica fonte di verità.
  const mancanti = mancantiPerTrasmissione(segnalazione);
  if (mancanti.length > 0) return { errore: `Mancano ancora: ${mancanti.join(", ")}.` };

  return eseguiTrasmissione(supabase, segnalazione, reparto, personaId);
}

/** ★ NUOVA — richiesta esplicita: "una volta approvato dal cliente, la
 * segnalazione deve andare nella scheda trasmessa e non rimanere in
 * gestione cliente" — prima l'approvazione del contratto (via link email,
 * vedi /api/approva/[token]) si fermava lì, e la trasmissione vera e
 * propria (creazione del Ticket, stato "Trasmessa") restava un secondo
 * passo manuale che un operatore doveva ricordarsi di fare. Chiamata
 * subito dopo aver registrato l'approvazione, con service role (nessuna
 * sessione: è il cliente che ha cliccato il link, non uno staff). Se
 * mancano ancora dati (caso raro: dati/contratto incompleti nonostante
 * l'approvazione) non blocca né segnala errore al cliente — resta in
 * "Gestione Cliente" e il pulsante "Trasmetti per l'installazione" resta
 * disponibile in Segnalazioni come rete di sicurezza manuale. */
export async function trasmettiPerInstallazioneAutomatico(segnalazioneId: string, reparto: AreaAccesso = "Analisi Rete") {
  try {
    const service = createServiceClient();
    const { data: segnalazione } = await service.from("segnalazioni").select("*").eq("id", segnalazioneId).maybeSingle();
    if (!segnalazione) return;
    if (segnalazione.stato === "Trasmessa") return; // già trasmessa (es. manualmente, prima di questo trigger)
    if (mancantiPerTrasmissione(segnalazione).length > 0) return;

    await eseguiTrasmissione(service, segnalazione, reparto, null);
  } catch (errore) {
    console.error("trasmettiPerInstallazioneAutomatico:", errore);
  }
}
