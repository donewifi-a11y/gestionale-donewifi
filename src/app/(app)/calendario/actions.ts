"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import { creaEventoCalendario, aggiornaEventoCalendario } from "@/lib/google-calendar";
import { inviaEmail, emailChiusuraTicket } from "@/lib/email";
import { urlFirmataDocumento } from "@/lib/documenti";
import { revalidatePath } from "next/cache";
import type { Appuntamento, MaterialeUsato, SchedaLavoro, StatoAppuntamento, TipoServizioAppuntamento } from "@/lib/types";

export interface SlotOccupato {
  id: string;
  titolo: string;
  data_ora: string;
  durata_minuti: number;
  tecnico_id: string | null;
}

/** ★ NUOVA — slot già occupati nei prossimi 14 giorni, per pianificare un
 * appuntamento dalla lavorazione del Ticket senza dover prima aprire il
 * Calendario per controllare la disponibilità del tecnico. */
export async function getSlotOccupatiProssimi(): Promise<SlotOccupato[]> {
  const supabase = await createClient();
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const tra14gg = new Date(oggi);
  tra14gg.setDate(tra14gg.getDate() + 14);

  const { data, error } = await supabase
    .from("appuntamenti")
    .select("id, titolo, data_ora, durata_minuti, tecnico_id")
    .eq("stato", "Programmato")
    .gte("data_ora", oggi.toISOString())
    .lte("data_ora", tra14gg.toISOString())
    .order("data_ora", { ascending: true });
  if (error) console.error("getSlotOccupatiProssimi:", error.message);

  return data ?? [];
}

export async function creaAppuntamento(dati: {
  titolo: string;
  indirizzo: string;
  dataOra: string;
  durataMinuti: number;
  tecnicoId: string;
  ticketId: string;
  note: string;
  tipoServizio: TipoServizioAppuntamento;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

  // ★ l'evento Google si crea prima del salvataggio in database così, se
  // Google non è configurato o la chiamata fallisce, l'appuntamento viene
  // comunque salvato — il collegamento a Google è un valore aggiunto, mai
  // un blocco.
  const googleEventId = await creaEventoCalendario({
    titolo: dati.titolo,
    indirizzo: dati.indirizzo || null,
    note: dati.note || null,
    dataOraInizio: dati.dataOra,
    durataMinuti: dati.durataMinuti,
  });

  const { error } = await supabase.from("appuntamenti").insert({
    titolo: dati.titolo,
    indirizzo: dati.indirizzo || null,
    data_ora: dati.dataOra,
    durata_minuti: dati.durataMinuti,
    tecnico_id: dati.tecnicoId || null,
    ticket_id: dati.ticketId || null,
    note: dati.note || null,
    tipo_servizio: dati.tipoServizio,
    creato_da: personaId,
    google_event_id: googleEventId,
  });
  if (error) return { errore: error.message };

  revalidatePath("/calendario");
  return { errore: null };
}

// ★ ex SelettoreData.html/impostaDataPosa() del vecchio gestionale —
// modifica un appuntamento già creato invece di doverlo annullare e
// ricreare da zero per cambiare data/ora/tecnico.
export async function modificaAppuntamento(
  id: string,
  dati: {
    titolo: string;
    indirizzo: string;
    dataOra: string;
    durataMinuti: number;
    tecnicoId: string;
    note: string;
    tipoServizio: TipoServizioAppuntamento;
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { data: esistente } = await supabase.from("appuntamenti").select("google_event_id").eq("id", id).single();

  const { error } = await supabase
    .from("appuntamenti")
    .update({
      titolo: dati.titolo,
      indirizzo: dati.indirizzo || null,
      data_ora: dati.dataOra,
      durata_minuti: dati.durataMinuti,
      tecnico_id: dati.tecnicoId || null,
      note: dati.note || null,
      tipo_servizio: dati.tipoServizio,
    })
    .eq("id", id);
  if (error) return { errore: error.message };

  if (esistente?.google_event_id) {
    await aggiornaEventoCalendario(esistente.google_event_id, {
      summary: dati.titolo,
      location: dati.indirizzo,
      note: dati.note,
      dataOraInizio: dati.dataOra,
      durataMinuti: dati.durataMinuti,
    });
  }

  revalidatePath("/calendario");
  return { errore: null };
}

export async function cambiaStatoAppuntamento(id: string, stato: StatoAppuntamento) {
  const supabase = await createClient();
  const { data: appuntamento } = await supabase
    .from("appuntamenti")
    .select("google_event_id, titolo")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("appuntamenti").update({ stato }).eq("id", id);
  if (error) return { errore: error.message };

  if (appuntamento?.google_event_id) {
    if (stato === "Annullato") {
      await aggiornaEventoCalendario(appuntamento.google_event_id, { status: "cancelled" });
    } else if (stato === "Completato") {
      await aggiornaEventoCalendario(appuntamento.google_event_id, { summary: `✅ ${appuntamento.titolo}` });
    }
  }

  revalidatePath("/calendario");
  return { errore: null };
}

// ★ NUOVA — promemoria liberi nel Calendario ("richiamare il cliente X",
// "ordinare materiale per Y"), non legati per forza a un Ticket, ripresi
// anche in Mondo Ticket quando sono del giorno o scaduti.
export async function creaNotaCalendario(dati: { testo: string; dataPromemoria: string; ticketId: string }) {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };
  if (!dati.testo.trim()) return { errore: "Il testo del promemoria è obbligatorio." };

  const { error } = await supabase.from("note_calendario").insert({
    testo: dati.testo.trim(),
    data_promemoria: dati.dataPromemoria,
    ticket_id: dati.ticketId || null,
    creato_da: personaId,
  });
  if (error) return { errore: error.message };

  revalidatePath("/calendario");
  revalidatePath("/");
  return { errore: null };
}

export async function completaNotaCalendario(id: string, completata: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("note_calendario").update({ completata }).eq("id", id);
  if (error) return { errore: error.message };
  revalidatePath("/calendario");
  revalidatePath("/");
  return { errore: null };
}

export async function eliminaNotaCalendario(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("note_calendario").delete().eq("id", id);
  if (error) return { errore: error.message };
  revalidatePath("/calendario");
  revalidatePath("/");
  return { errore: null };
}

export interface DatiSchedaLavoro {
  esito: string;
  note: string;
  importoFatturato: string;
  materiali: MaterialeUsato[];
  firmaClienteDataUrl: string;
  firmaTecnicoDataUrl?: string;
  // solo "Nuova installazione"
  supporto?: string;
  posizione?: string;
  gpsLat?: number;
  gpsLng?: number;
  tipoCavo?: string;
  metriCavo?: string;
  bts?: string;
  modelloCpe?: string;
  mac?: string;
  vlan?: string;
  rssi?: string;
  snr?: string;
  router?: string;
  pingMs?: string;
  downloadMbps?: string;
  uploadMbps?: string;
  // solo "Lavorazione tecnica"
  interventiEseguiti?: string[];
}

// ★ ex riceviCertificatoInstallazione()/riceviRapportoIntervento() del
// vecchio gestionale — quale scheda compilare l'ha già deciso il
// tipo_servizio scelto in fase di pianificazione (migrazione 0037), qui
// si salva e si completa in un solo passaggio sia l'appuntamento sia,
// se collegato, il Ticket (stesso comportamento del vecchio sistema:
// certificare l'installazione o chiudere il rapporto intervento chiude
// anche il Ticket). Stesso pattern di completaTicketConRapportino()
// (tickets/actions.ts): client normale per le tabelle già scrivibili
// dallo staff via RLS, service role solo per lo storage privato e per
// schede_lavoro (nessuna policy insert/update pensata per lo scriverla a
// mano fuori da questo flusso).
export async function salvaSchedaLavoro(
  appuntamentoId: string,
  tipo: TipoServizioAppuntamento,
  dati: DatiSchedaLavoro,
  foto: File[]
) {
  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: ERRORE_PERSONA_MANCANTE };

  const { data: appuntamento } = await supabase
    .from("appuntamenti")
    .select("id, ticket_id, titolo, google_event_id")
    .eq("id", appuntamentoId)
    .single();
  if (!appuntamento) return { errore: "Appuntamento non trovato." };

  const service = createServiceClient();

  const fotoSalvate: { nome: string; percorso: string }[] = [];
  for (const file of foto) {
    if (file.size === 0) continue;
    const percorso = `schede/${appuntamentoId}/${Date.now()}-${file.name}`;
    const { error } = await service.storage.from("documenti").upload(percorso, file, { contentType: file.type || "application/octet-stream" });
    if (error) return { errore: `Errore caricamento "${file.name}": ${error.message}` };
    fotoSalvate.push({ nome: file.name, percorso });
  }

  async function salvaFirma(dataUrl: string | undefined, suffisso: string): Promise<{ percorso: string | null; errore: string | null }> {
    if (!dataUrl) return { percorso: null, errore: null };
    const risposta = await fetch(dataUrl);
    const blob = await risposta.blob();
    const percorso = `schede/${appuntamentoId}/${suffisso}-${Date.now()}.png`;
    const { error } = await service.storage.from("documenti").upload(percorso, blob, { contentType: "image/png" });
    if (error) return { percorso: null, errore: `Errore salvataggio firma: ${error.message}` };
    return { percorso, errore: null };
  }

  const firmaCliente = await salvaFirma(dati.firmaClienteDataUrl, "firma-cliente");
  if (firmaCliente.errore) return { errore: firmaCliente.errore };
  const firmaTecnico = await salvaFirma(dati.firmaTecnicoDataUrl, "firma-tecnico");
  if (firmaTecnico.errore) return { errore: firmaTecnico.errore };

  const importo = dati.importoFatturato.trim() ? Number(dati.importoFatturato) : null;

  const { error: erroreScheda } = await service.from("schede_lavoro").insert({
    appuntamento_id: appuntamentoId,
    ticket_id: appuntamento.ticket_id,
    tipo,
    esito: dati.esito.trim() || null,
    note: dati.note.trim() || null,
    importo_fatturato: importo,
    materiali: dati.materiali,
    foto: fotoSalvate,
    firma_cliente_url: firmaCliente.percorso,
    firma_tecnico_url: firmaTecnico.percorso,
    supporto: dati.supporto || null,
    posizione: dati.posizione || null,
    gps_lat: dati.gpsLat ?? null,
    gps_lng: dati.gpsLng ?? null,
    tipo_cavo: dati.tipoCavo || null,
    metri_cavo: dati.metriCavo ? Number(dati.metriCavo) : null,
    bts: dati.bts || null,
    modello_cpe: dati.modelloCpe || null,
    mac: dati.mac || null,
    vlan: dati.vlan || null,
    rssi: dati.rssi ? Number(dati.rssi) : null,
    snr: dati.snr ? Number(dati.snr) : null,
    router: dati.router || null,
    ping_ms: dati.pingMs ? Number(dati.pingMs) : null,
    download_mbps: dati.downloadMbps ? Number(dati.downloadMbps) : null,
    upload_mbps: dati.uploadMbps ? Number(dati.uploadMbps) : null,
    interventi_eseguiti: dati.interventiEseguiti ?? [],
    creato_da: persona.id,
  });
  if (erroreScheda) return { errore: erroreScheda.message };

  const { error: erroreApp } = await supabase.from("appuntamenti").update({ stato: "Completato" }).eq("id", appuntamentoId);
  if (erroreApp) return { errore: erroreApp.message };
  if (appuntamento.google_event_id) {
    await aggiornaEventoCalendario(appuntamento.google_event_id, { summary: `✅ ${appuntamento.titolo}` });
  }

  if (appuntamento.ticket_id) {
    const { data: ticket } = await supabase
      .from("tickets")
      .select("cliente, numero, email, reparto, stato")
      .eq("id", appuntamento.ticket_id)
      .single();
    if (ticket) {
      // ★ FIX — questo update non controllava l'errore prima di scrivere lo
      // storico e mandare l'email di chiusura al cliente: se falliva (RLS,
      // vincolo, rete), il cliente riceveva comunque "il tuo intervento è
      // concluso" e lo storico diceva "Completato", mentre il Ticket
      // restava al vecchio stato senza importo_fatturato (usato dai ricavi
      // per reparto in Dashboard) — un disallineamento silenzioso tra
      // quello detto al cliente e lo stato reale del Ticket.
      const { error: erroreTicket } = await supabase
        .from("tickets")
        .update({ stato: "Completato", aggiornato_il: new Date().toISOString(), importo_fatturato: importo })
        .eq("id", appuntamento.ticket_id);
      if (erroreTicket) return { errore: erroreTicket.message };
      await supabase.from("storico").insert({
        origine: "ticket",
        riferimento_id: appuntamento.ticket_id,
        operazione: tipo === "Nuova installazione" ? "Certificato Installazione" : "Rapporto Intervento in Loco",
        valore_prima: ticket.stato,
        valore_dopo: "Completato",
        operatore_id: persona.id,
      });
      if (ticket.email) {
        const { oggetto, corpoHtml } = emailChiusuraTicket(ticket.cliente, ticket.numero);
        await inviaEmail({ a: ticket.email, oggetto, corpoHtml, reparto: ticket.reparto });
      }
    }
  }

  revalidatePath("/calendario");
  revalidatePath("/vista-tecnico");
  revalidatePath("/tickets");
  revalidatePath("/");
  return { errore: null };
}

/** Legge una scheda già salvata (per la vista di sola lettura). */
export async function getSchedaLavoro(appuntamentoId: string): Promise<SchedaLavoro | null> {
  const supabase = await createClient();
  // ★ FIX — tipo di ritorno dichiarato esplicitamente invece di lasciare
  // che i chiamanti compensassero con un `as SchedaLavoro` (tickets-board.tsx):
  // se lo schema si disallinea dall'interfaccia, ora è qui che si vede,
  // non in un cast a valle che finge di sapere già la forma giusta.
  const { data, error } = await supabase.from("schede_lavoro").select("*").eq("appuntamento_id", appuntamentoId).maybeSingle();
  if (error) console.error("getSchedaLavoro:", error.message);
  return (data as SchedaLavoro | null) ?? null;
}

/** Come getSchedaLavoro(), ma dal Ticket collegato invece che
 * dall'appuntamento — usata nella scheda cliente/dettaglio Ticket. */
export async function getSchedaLavoroPerTicket(ticketId: string): Promise<SchedaLavoro | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("schede_lavoro").select("*").eq("ticket_id", ticketId).maybeSingle();
  if (error) console.error("getSchedaLavoroPerTicket:", error.message);
  return (data as SchedaLavoro | null) ?? null;
}

// ★ NUOVA — richiesta esplicita: una volta pianificato l'appuntamento
// (Trasmetti → Ticket → Pianifica), non c'era alcun modo di aprire/vedere
// la Scheda di lavoro dal Ticket o dal Calendario: solo il tecnico
// assegnato, da Vista Tecnico, poteva farlo — e solo il giorno stesso
// dell'appuntamento (query "Appuntamenti di oggi"). Un admin/commerciale
// che vuole controllare lo stato della pianificazione, o compilare la
// scheda al posto del tecnico, non trovava nulla. Restituisce
// l'appuntamento "Programmato" più vicino nel tempo per quel Ticket (ce
// n'è di norma uno solo alla volta), per offrire da lì lo stesso form
// (SchedaInstallazioneForm/SchedaLavorazioneForm) già usato in Vista
// Tecnico — non serve essere il tecnico assegnato per aprirlo.
export async function getAppuntamentoAttivoPerTicket(ticketId: string): Promise<Appuntamento | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appuntamenti")
    .select("*")
    .eq("ticket_id", ticketId)
    .eq("stato", "Programmato")
    .order("data_ora", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) console.error("getAppuntamentoAttivoPerTicket:", error.message);
  return (data as Appuntamento | null) ?? null;
}

/** URL firmata per una foto/firma di una scheda di lavoro (bucket privato). */
export async function urlDocumentoScheda(percorso: string) {
  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: "Non autenticato.", url: null };

  return urlFirmataDocumento(percorso);
}
