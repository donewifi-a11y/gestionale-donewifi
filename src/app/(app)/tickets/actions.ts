"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, personaHaAccessoAdmin, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import { revalidatePath } from "next/cache";
import { inviaEmail, emailChiusuraTicket, emailApprovazioneIntervento, emailPraticaCliente } from "@/lib/email";
import { urlFirmataDocumento } from "@/lib/documenti";
import { generaTestoRapportino } from "@/lib/testo-rapporto";
import { RICHIESTE_CLIENTE_CONFIG, type SlugRichiestaCliente } from "@/lib/richieste-cliente-config";
import { REPARTO_PER_TIPO_RICHIESTA, type AreaAccesso, type PrioritaTicket, type RapportinoIntervento, type StatoTicket, type Ticket } from "@/lib/types";

// ★ le Server Action, in produzione, nascondono al client il messaggio di
// un errore lanciato con "throw" — per mostrare messaggi utili bisogna
// restituirli come dato ({ errore }), non lanciarli.

async function verificaAdmin(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Non autenticato.";
  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona)) return "Solo un amministratore può eliminare un Ticket.";
  return null;
}

// ★ NUOVA — richiesta esplicita: un amministratore deve poter eliminare un
// Ticket creato per errore/duplicato, non solo Annullarlo (che resta
// comunque visibile in Archivio). "tickets" non ha policy RLS di delete
// (solo select/insert/update, vedi 0001_init.sql), quindi la cancellazione
// vera passa dalla service role, dopo aver verificato qui che chi chiama
// sia admin — stesso principio già usato per le Persone.
// Alcune tabelle collegate non hanno ON DELETE CASCADE/SET NULL sul
// ticket_id (note_calendario, richieste_clienti): senza scioglierle prima,
// la FK bloccherebbe la cancellazione. Le altre (note_ticket, rapportini,
// approvazioni: CASCADE; appuntamenti, schede_lavoro: SET NULL) si
// sistemano da sole.
export async function eliminaTicket(id: string) {
  const supabase = await createClient();
  const erroreAccesso = await verificaAdmin(supabase);
  if (erroreAccesso) return { errore: erroreAccesso };
  const personaId = await getPersonaCorrenteId();

  const { data: ticket, error: erroreLettura } = await supabase
    .from("tickets")
    .select("numero, cliente, segnalazione_id")
    .eq("id", id)
    .single();
  if (erroreLettura || !ticket) return { errore: erroreLettura?.message || "Ticket non trovato." };

  const service = createServiceClient();
  await service.from("note_calendario").update({ ticket_id: null }).eq("ticket_id", id);
  await service.from("richieste_clienti").update({ ticket_id: null }).eq("ticket_id", id);

  // ★ se il Ticket veniva da una Segnalazione "Trasmessa", la si riporta a
  // "Gestione Cliente" invece di lasciarla bloccata su uno stato finale
  // che punta a un Ticket ormai sparito — dati cliente e contratto restano,
  // pronta per essere ritrasmessa subito.
  if (ticket.segnalazione_id) {
    await service
      .from("segnalazioni")
      .update({ stato: "Gestione Cliente", aggiornato_il: new Date().toISOString() })
      .eq("id", ticket.segnalazione_id);
  }

  const { error } = await service.from("tickets").delete().eq("id", id);
  if (error) return { errore: error.message };

  await service.from("storico").insert({
    origine: "ticket",
    riferimento_id: id,
    operazione: "Ticket eliminato",
    valore_prima: `#${ticket.numero} — ${ticket.cliente}`,
    operatore_id: personaId,
  });

  revalidatePath("/tickets");
  revalidatePath("/segnalazioni");
  return { errore: null };
}

export async function creaTicket(
  dati: {
    cliente: string;
    telefono: string;
    email: string;
    indirizzo: string;
    categoria: string;
    sottocategoria: string;
    problema: string;
    priorita: PrioritaTicket;
    reparto: AreaAccesso;
    dettagliExtra: Record<string, string>;
    tecnicoAssegnato?: string;
  },
  // ★ FIX (2026-09, audit generale) — prima era `fileExtra?: File | null`,
  // il file intero dentro il corpo della Server Action: stessa classe di
  // bug già corretta 4 volte in questo gestionale (limite di 1MB di
  // default sul corpo di una Server Action). Il file va caricato prima,
  // dal browser, tramite api/tickets/upload-url/route.ts — qui arriva solo
  // il percorso già scritto nello storage.
  allegatoExtra?: { percorso: string; nome: string } | null
) {
  const supabase = await createClient();
  // ★ FIX SICUREZZA — controllava solo getPersonaCorrenteId() (il cookie
  // firmato, valido fino a 1 anno), non se la Persona fosse ancora
  // attivo, prima di usare sotto la service role per l'upload
  // dell'allegato (bypassa la RLS). Stesso identico bug già corretto per
  // completaTicketConRapportino() e caricaContrattoSegnalazione() —
  // rimasto scoperto qui. Un dipendente disattivato con cookie ancora
  // valido poteva continuare a creare Ticket e scrivere nello storage
  // privato.
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: ERRORE_PERSONA_MANCANTE };
  const personaId = persona.id;

  // ★ i campi extra per sottocategoria (ex CONFIG_CATEGORIE) possono
  // includere un allegato (foto apparati, allegato contabile) — già
  // caricato nello storage dal browser (vedi sopra), solo registrato qui.
  const dettagliExtra = { ...dati.dettagliExtra };
  if (allegatoExtra) {
    dettagliExtra._allegato = allegatoExtra.percorso;
    dettagliExtra._allegatoNome = allegatoExtra.nome;
  }

  const { data, error } = await supabase
    .from("tickets")
    .insert({
      cliente: dati.cliente,
      telefono: dati.telefono || null,
      email: dati.email || null,
      indirizzo: dati.indirizzo || null,
      categoria: dati.categoria,
      sottocategoria: dati.sottocategoria || null,
      dettagli_extra: dettagliExtra,
      problema: dati.problema || null,
      priorita: dati.priorita,
      reparto: dati.reparto,
      creato_da: personaId,
      tecnico_assegnato: dati.tecnicoAssegnato || null,
    })
    .select("*")
    .single();

  if (error) return { errore: error.message };

  await supabase.from("storico").insert({
    origine: "ticket",
    riferimento_id: data.id,
    operazione: "Creazione Ticket",
    valore_dopo: "Da gestire",
    operatore_id: personaId,
  });

  revalidatePath("/tickets");
  revalidatePath("/vista-tecnico");
  return { errore: null, id: data.id, numero: data.numero, ticket: data as Ticket };
}

// ★ ex cambiaRepartoTicketWeb() del vecchio gestionale — un Ticket
// assegnato al reparto sbagliato in apertura si può correggere qui,
// invece di doverlo ricreare.
export async function cambiaRepartoTicket(id: string, repartoNuovo: AreaAccesso, repartoVecchio: AreaAccesso) {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };
  if (repartoNuovo === repartoVecchio) return { errore: null };

  const { error } = await supabase
    .from("tickets")
    .update({ reparto: repartoNuovo, aggiornato_il: new Date().toISOString() })
    .eq("id", id);
  if (error) return { errore: error.message };

  await supabase.from("storico").insert({
    origine: "ticket",
    riferimento_id: id,
    operazione: "Cambio Reparto",
    valore_prima: repartoVecchio,
    valore_dopo: repartoNuovo,
    operatore_id: personaId,
  });

  revalidatePath("/tickets");
  return { errore: null };
}

export async function aggiornaStatoTicket(id: string, statoNuovo: StatoTicket, statoVecchio: StatoTicket) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

  const { error } = await supabase
    .from("tickets")
    .update({ stato: statoNuovo, aggiornato_il: new Date().toISOString() })
    .eq("id", id);
  if (error) return { errore: error.message };

  await supabase.from("storico").insert({
    origine: "ticket",
    riferimento_id: id,
    operazione: "Cambio Stato",
    valore_prima: statoVecchio,
    valore_dopo: statoNuovo,
    operatore_id: personaId,
  });

  revalidatePath("/tickets");
  return { errore: null };
}

export async function assegnaTicket(id: string, personaId: string | null) {
  const supabase = await createClient();
  // ★ `tecnico_assegnato` (interno) e `tecnico_esterno_id` (pose.donewifi.it,
  // migrazione 0061) sono alternativi: assegnare a uno staff interno azzera
  // sempre un eventuale tecnico esterno già assegnato, mai entrambi insieme.
  const { error } = await supabase.from("tickets").update({ tecnico_assegnato: personaId, tecnico_esterno_id: null }).eq("id", id);
  if (error) return { errore: error.message };
  revalidatePath("/tickets");
  return { errore: null };
}

/** ★ NUOVA (2026-08-26) — gemella di assegnaTicket() ma per un tecnico
 * esterno (sistema pose.donewifi.it) — vedi il commento lì sopra. */
export async function assegnaTicketTecnicoEsterno(id: string, tecnicoEsternoId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("tickets").update({ tecnico_esterno_id: tecnicoEsternoId, tecnico_assegnato: null }).eq("id", id);
  if (error) return { errore: error.message };
  revalidatePath("/tickets");
  return { errore: null };
}

/** Lista tecnici esterni attivi, per il selettore di assegnazione sul Ticket. */
export async function listaTecniciEsterniAttivi() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tecnici_esterni")
    .select("id, nome, cognome")
    .eq("attivo", true)
    .order("nome", { ascending: true });
  if (error) console.error("listaTecniciEsterniAttivi:", error.message);
  return data ?? [];
}

// ★ per il campo "Nuovo profilo desiderato" di Upgrade/Downgrade
// (campi-ticket.ts) — prima erano 6 nomi scritti a mano, scollegati dal
// vero catalogo Tariffe (164 voci, vedi migrazione 0028). Nomi distinti e
// ordinati, non l'intera riga: qui basta cosa scegliere, non prezzo/IVA.
export async function listaNomiTariffeAttive(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tariffe").select("nome").eq("attivo", true).order("nome");
  if (error) console.error("listaNomiTariffeAttive:", error.message);
  if (!data) return [];
  return Array.from(new Set(data.map((t) => t.nome))).sort((a, b) => a.localeCompare(b, "it"));
}

export interface ClienteEsistente {
  cliente: string;
  telefono: string | null;
  email: string | null;
  indirizzo: string | null;
}

// ★ ex cercaAnagraficaSuFoglio() del vecchio gestionale — di nuovo vero
// dopo l'importazione dell'anagrafica Aruba: cerca prima lì (dati più
// affidabili, aggiornati centralmente) e completa con i Ticket già
// esistenti nel gestionale, per non perdere clienti visti solo qui.
export async function cercaClientiEsistenti(query: string): Promise<ClienteEsistente[]> {
  const testo = query.trim();
  if (testo.length < 2) return [];
  const supabase = await createClient();

  // ★ FIX — vedi ricercaGlobale(): virgole/parentesi non escapate nel
  // testo di ricerca hanno significato speciale nella sintassi filtro di
  // `.or()` di PostgREST.
  const testoSicuro = testo.replace(/[,()]/g, " ").trim();
  if (testoSicuro.length < 2) return [];

  const [{ data: esterni }, { data: daTicket }] = await Promise.all([
    supabase
      .from("clienti_esterni")
      .select("nome, cognome, ragionesociale, telefono, email, indirizzo, numero_civico, comune")
      .or(
        `nome.ilike.%${testoSicuro}%,cognome.ilike.%${testoSicuro}%,ragionesociale.ilike.%${testoSicuro}%,telefono.ilike.%${testoSicuro}%,codice_fiscale.ilike.%${testoSicuro}%`
      )
      .eq("attivo", true)
      .limit(6),
    supabase
      .from("tickets")
      .select("cliente, telefono, email, indirizzo, data_creazione")
      .or(`cliente.ilike.%${testoSicuro}%,telefono.ilike.%${testoSicuro}%`)
      .order("data_creazione", { ascending: false })
      .limit(30),
  ]);

  const visti = new Set<string>();
  const risultati: ClienteEsistente[] = [];

  for (const c of esterni ?? []) {
    const nomeCompleto = c.ragionesociale || [c.nome, c.cognome].filter(Boolean).join(" ");
    if (!nomeCompleto) continue;
    const chiave = nomeCompleto.toLowerCase();
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    risultati.push({
      cliente: nomeCompleto,
      telefono: c.telefono,
      email: c.email,
      indirizzo: [c.indirizzo, c.numero_civico].filter(Boolean).join(" ") + (c.comune ? `, ${c.comune}` : ""),
    });
  }

  for (const t of daTicket ?? []) {
    const chiave = t.cliente.toLowerCase();
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    risultati.push({ cliente: t.cliente, telefono: t.telefono, email: t.email, indirizzo: t.indirizzo });
    if (risultati.length >= 8) break;
  }
  return risultati;
}

export async function getNoteTicket(ticketId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("note_ticket")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("creato_il", { ascending: true });
  if (error) return [];
  return data;
}

export async function aggiungiNotaTicket(ticketId: string, testo: string) {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

  const { data, error } = await supabase
    .from("note_ticket")
    .insert({ ticket_id: ticketId, autore_id: personaId, testo })
    .select("*")
    .single();
  if (error) return { errore: error.message };
  return { errore: null, nota: data };
}

export async function getRapportinoTicket(ticketId: string): Promise<RapportinoIntervento | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("rapportini_intervento").select("*").eq("ticket_id", ticketId).maybeSingle();
  if (error) console.error("getRapportinoTicket:", error.message);
  return (data as RapportinoIntervento | null) ?? null;
}

// ★ Rapportino di chiusura intervento (ex Installazione/Lavorazione/
// InterventoLoco.html) — esito, materiali, foto e firma cliente, poi
// il Ticket passa a Completato in un solo passaggio. Semplificato: niente
// generazione PDF lato server, il rapportino resta un record leggibile a
// schermo con una vista stampabile (il browser genera il PDF con
// "Stampa" → "Salva come PDF").
export async function completaTicketConRapportino(
  ticketId: string,
  statoVecchio: StatoTicket,
  dati: { esito: string; lavoriSvolti: string; materiali: string; importoFatturato: string },
  // ★ FIX (2026-09-02, bug reale trovato prima su pose — stesso limite qui:
  // le foto grezze da fotocamera nel corpo della Server Action superavano
  // il limite di default di 1MB di Next.js) — non più `File[]`: il file
  // vero è già caricato dal browser allo storage prima di questa chiamata.
  foto: { nome: string; percorso: string }[]
) {
  const supabase = await createClient();
  // ★ FIX SICUREZZA — controllava solo un cookie persona valido, non che
  // lo staff fosse ancora attivo: sotto si passa alla service role per
  // caricare foto/firma e scrivere il rapportino, che bypassa la RLS.
  // Stesso pattern già corretto per le funzioni "URL firmata documento" e
  // per caricaContrattoSegnalazione().
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: ERRORE_PERSONA_MANCANTE };
  const personaId = persona.id;
  if (!dati.esito.trim()) return { errore: "L'esito dell'intervento è obbligatorio." };
  // ★ SEMPLIFICATA (2026-08-27, richiesta esplicita — revisione Ticket via
  // artifact: "deve solo inviare il rapportino al cliente") — prima qui si
  // bloccava la chiusura senza una conferma del cliente (OTP verificato, o
  // link inviato) — vedi il commento nel form (rapportino.tsx). Il
  // riepilogo continua ad arrivare via email più sotto, solo non più come
  // requisito per chiudere.

  const service = createServiceClient();

  const { data: ticketRiga } = await supabase.from("tickets").select("cliente, numero, email, reparto").eq("id", ticketId).single();

  const { error: erroreRapportino } = await service.from("rapportini_intervento").insert({
    ticket_id: ticketId,
    esito: dati.esito.trim(),
    lavori_svolti: dati.lavoriSvolti.trim() || null,
    materiali: dati.materiali.trim() || null,
    firma_url: null,
    firma_metodo: null,
    firma_email: null,
    firma_verificato_il: null,
    foto,
    creato_da: personaId,
  });
  if (erroreRapportino) return { errore: erroreRapportino.message };

  const importo = dati.importoFatturato.trim() ? Number(dati.importoFatturato) : null;
  const { error: erroreStato } = await supabase
    .from("tickets")
    .update({ stato: "Completato", aggiornato_il: new Date().toISOString(), importo_fatturato: importo })
    .eq("id", ticketId);
  if (erroreStato) return { errore: erroreStato.message };

  await supabase.from("storico").insert({
    origine: "ticket",
    riferimento_id: ticketId,
    operazione: "Cambio Stato",
    valore_prima: statoVecchio,
    valore_dopo: "Completato",
    operatore_id: personaId,
  });

  if (ticketRiga?.email) {
    const { oggetto, corpoHtml, corpoTesto } = emailChiusuraTicket(
      ticketRiga.cliente,
      ticketRiga.numero,
      generaTestoRapportino({ esito: dati.esito.trim(), lavori_svolti: dati.lavoriSvolti.trim() || null, materiali: dati.materiali.trim() || null })
    );
    await inviaEmail({ a: ticketRiga.email, oggetto, corpoHtml, corpoTesto, reparto: ticketRiga.reparto });
  }

  revalidatePath("/tickets");
  return { errore: null };
}

// ★ ex inviaEmailApprovazione()/_gestisciApprovazioneEmail() del vecchio
// gestionale — quando il tecnico risolve da remoto (non di persona, quindi
// niente firma su rapportino), il cliente conferma via un link monouso
// inviato per email, invece di un PropertiesService key/value: qui una
// vera tabella (token_approvazione, migrazione 0013).
export async function inviaEmailApprovazioneTicket(ticketId: string, origine: string) {
  const supabase = await createClient();
  // ★ FIX SICUREZZA (2026-09, audit generale) — controllava solo
  // auth.getUser() (una sessione Supabase Auth valida), non se la Persona
  // collegata fosse ancora attivo, prima di usare sotto la service role.
  // Stesso identico bug già corretto altrove in questo gestionale.
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: "Non autenticato." };

  const { data: ticket } = await supabase.from("tickets").select("numero, cliente, email, reparto").eq("id", ticketId).single();
  if (!ticket) return { errore: "Ticket non trovato." };
  if (!ticket.email) return { errore: "Il cliente non ha un'email registrata su questo ticket." };

  const service = createServiceClient();
  const { data: creato, error } = await service
    .from("token_approvazione")
    .insert({ ticket_id: ticketId })
    .select("token")
    .single();
  if (error) return { errore: error.message };

  const link = `${origine}/approva/${creato.token}`;
  const { oggetto, corpoHtml, corpoTesto } = emailApprovazioneIntervento(ticket.cliente, ticket.numero, link);
  await inviaEmail({ a: ticket.email, oggetto, corpoHtml, corpoTesto, reparto: ticket.reparto });

  return { errore: null, link };
}

// ★ NUOVA — FIX: il pulsante "Email" per le pratiche pubbliche
// (Trasferimento/Subentro/Cambio IBAN/Cambio Anagrafica/Disdetta) apriva
// solo un mailto: (client di posta locale dell'operatore) invece di
// inviare davvero dalla casella del reparto competente — a differenza di
// Richiesta Dati, che invia per davvero da commerciale@donewifi.it. Il
// reparto si deduce dalla pratica (REPARTO_PER_TIPO_RICHIESTA, già in uso
// per le notifiche Telegram/Chat sulla route pubblica): Cambio IBAN/Cambio
// Anagrafica → Fatturazione, Trasferimento/Subentro → Commerciale;
// Disdetta non è tra le 4 "Richieste Cliente" (ha un flusso pubblico
// proprio, /disdetta) ma è la stessa casistica di competenza Fatturazione.
export async function inviaEmailPraticaCliente(ticketId: string, slug: string, url: string) {
  const supabase = await createClient();
  // ★ FIX SICUREZZA (2026-09, audit generale) — controllava solo
  // auth.getUser(), non se la Persona collegata fosse ancora attivo. Non
  // usa la service role qui, ma stesso principio di consistenza già
  // applicato ai vicini urlDocumentoRapportino()/inviaEmailApprovazioneTicket().
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: "Non autenticato." };

  const { data: ticket } = await supabase.from("tickets").select("cliente, email").eq("id", ticketId).single();
  if (!ticket) return { errore: "Ticket non trovato." };
  if (!ticket.email) return { errore: "Il cliente non ha un'email registrata su questo ticket." };

  const config = RICHIESTE_CLIENTE_CONFIG[slug as SlugRichiestaCliente];
  const titolo = slug === "disdetta" ? "Disdetta contratto" : config?.titolo;
  const reparto: AreaAccesso = slug === "disdetta" ? "Fatturazione" : REPARTO_PER_TIPO_RICHIESTA[config.tipo];
  if (!titolo || !reparto) return { errore: "Pratica non riconosciuta." };

  const { oggetto, corpoHtml, corpoTesto } = emailPraticaCliente(ticket.cliente, titolo, url);
  const risultato = await inviaEmail({ a: ticket.email, oggetto, corpoHtml, corpoTesto, reparto });
  return risultato;
}

// ★ NUOVA (2026-08) — Subentro, traccia del NUOVO cliente (Opzione B): a
// differenza di inviaEmailPraticaCliente() sopra, qui il destinatario non
// è quello registrato sul Ticket (quella è l'email del vecchio titolare) —
// il nuovo titolare non è ancora un contatto noto al sistema, l'operatore
// la digita a mano nel pannello di invio.
export async function inviaEmailPraticaGenerica(destinatarioEmail: string, nomeDestinatario: string, titolo: string, url: string, reparto: AreaAccesso) {
  const supabase = await createClient();
  // ★ FIX SICUREZZA (2026-09, audit generale) — vedi inviaEmailPraticaCliente()
  // sopra: stesso controllo debole, stessa correzione.
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: "Non autenticato." };
  if (!destinatarioEmail?.trim()) return { errore: "Email non specificata." };

  const { oggetto, corpoHtml, corpoTesto } = emailPraticaCliente(nomeDestinatario || "Cliente", titolo, url);
  return inviaEmail({ a: destinatarioEmail.trim(), oggetto, corpoHtml, corpoTesto, reparto });
}

export async function urlDocumentoRapportino(percorso: string) {
  const supabase = await createClient();
  // ★ FIX SICUREZZA — vedi urlDocumentoRichiesta(): controllava solo la
  // sessione Auth, non `persone.attivo`, mentre sotto la service role
  // bypassa la RLS per generare l'URL firmata.
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: "Non autenticato.", url: null };

  return urlFirmataDocumento(percorso);
}
