"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, personaHaAccessoAdmin, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import { revalidatePath } from "next/cache";
import { inviaEmail, emailRichiestaDatiSegnalazione, emailApprovazioneContratto } from "@/lib/email";
import { urlFirmataDocumento } from "@/lib/documenti";
import { inviaMessaggioChatSistema } from "@/lib/chat";
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
  const { oggetto, corpoHtml } = emailRichiestaDatiSegnalazione(segnalazione.nome, link);
  const risultato = await inviaEmail({
    a: segnalazione.email,
    oggetto,
    corpoHtml,
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

  const { error } = await supabase
    .from("segnalazioni")
    .update({ contratto_pdf_url: percorso, aggiornato_il: new Date().toISOString() })
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
  const { oggetto, corpoHtml } = emailApprovazioneContratto(segnalazione.nome, segnalazione.numero, link);
  const risultato = await inviaEmail({ a: segnalazione.email, oggetto, corpoHtml, reparto: "Commerciale" });
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
  await inviaMessaggioChatSistema(
    "Analisi Rete",
    `📄 Contratto inviato per approvazione a ${segnalazione.nome} (Segnalazione #${segnalazione.numero}). Puoi iniziare a organizzare l'installazione — sarà trasmesso ufficialmente appena il cliente approva.`
  );

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
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

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
export async function trasmettiPerInstallazione(segnalazioneId: string, reparto: AreaAccesso = "Analisi Rete") {
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
  const mancanti: string[] = [];
  if (!segnalazione.tipologia_cliente || !segnalazione.profilo_internet) mancanti.push("dati del cliente (Richiesta Dati)");
  if (!segnalazione.contratto_pdf_url) mancanti.push("contratto firmato");
  if (mancanti.length > 0) return { errore: `Mancano ancora: ${mancanti.join(", ")}.` };

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
    .eq("id", segnalazioneId);
  if (erroreStato) return { errore: erroreStato.message };

  await supabase.from("storico").insert([
    {
      origine: "segnalazione",
      riferimento_id: segnalazioneId,
      operazione: "Trasmessa per installazione",
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

  revalidatePath("/segnalazioni");
  revalidatePath("/tickets");
  return { errore: null, id: ticket.id, numero: ticket.numero };
}
