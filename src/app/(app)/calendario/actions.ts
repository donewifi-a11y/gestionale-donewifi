"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, personaHaAccessoAdmin, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import { getOperatoreCorrente } from "@/lib/operatore";
import { creaEventoCalendario, aggiornaEventoCalendario } from "@/lib/google-calendar";
import { inviaEmail, emailChiusuraTicket, emailOtpFirmaScheda, emailLinkFirmaScheda } from "@/lib/email";
import { inviaMessaggioChatSistemaDiretto } from "@/lib/chat";
import { urlFirmataDocumento } from "@/lib/documenti";
import { generaTestoScheda } from "@/lib/testo-rapporto";
import { schedaRiguardaGestionaleAntenne, notificaGestionaleAntenne } from "@/lib/notifiche-antenne";
import { scaricaGiacenzaMateriali, riconciliaAntennaInstallata } from "@/app/(app)/materiali/actions";
import { revalidatePath } from "next/cache";
import { createHash, randomInt } from "crypto";
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

/**
 * ★ NUOVA (2026-08-28, richiesta esplicita: "dammi la possibilità come
 * amministratore di eliminare i lavori" — chiarito con l'utente: gli
 * appuntamenti sul Calendario, non le Schede/Ticket) — finora l'unica
 * opzione era `cambiaStatoAppuntamento(id, "Annullato")`: la riga restava
 * comunque nel database. Utile ad esempio per un doppione reale trovato di
 * recente ("Lorenzo Moja", lo stesso appuntamento inserito due volte a
 * pochi minuti di distanza) — "Annulla" non lo avrebbe tolto di mezzo,
 * solo rietichettato.
 *
 * Solo un amministratore. Bloccata se esiste già una Scheda di Lavoro
 * compilata per questo appuntamento: `schede_lavoro.appuntamento_id` è
 * `on delete cascade` (migrazione 0038) — eliminare l'appuntamento
 * cancellerebbe in silenzio anche il lavoro già registrato (materiali,
 * foto, importo fatturato). In quel caso resta solo "Annulla".
 *
 * ★ FIX (2026-08-28, bug reale trovato in produzione: "non si cancella" —
 * nessun errore mostrato, ma la riga restava) — `appuntamenti` ha RLS
 * attiva con policy solo per select/insert/update (migrazione 0004): non
 * è mai esistita una policy `for delete`. Un `.delete()` con il client
 * legato ai cookie (soggetto a RLS) su una tabella senza policy di
 * cancellazione non dà errore — cancella semplicemente ZERO righe, in
 * silenzio, e il codice proseguiva come se fosse andato tutto bene.
 * Stesso principio già usato altrove per le scritture da amministratore
 * (persone/tecnici_esterni/materiali): il controllo "sei admin?" resta sul
 * client legato ai cookie, la scrittura vera passa dalla service role
 * (bypassa RLS) invece di aggiungere una nuova policy.
 */
export async function eliminaAppuntamento(id: string): Promise<{ errore: string | null }> {
  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: ERRORE_PERSONA_MANCANTE };
  if (!personaHaAccessoAdmin(persona)) return { errore: "Solo un amministratore può eliminare un appuntamento." };

  const service = createServiceClient();

  const { data: appuntamento } = await service
    .from("appuntamenti")
    .select("titolo, google_event_id")
    .eq("id", id)
    .maybeSingle();
  if (!appuntamento) return { errore: "Appuntamento non trovato." };

  const { data: scheda } = await service.from("schede_lavoro").select("id").eq("appuntamento_id", id).maybeSingle();
  if (scheda) {
    return {
      errore: "Questo appuntamento ha già una Scheda di Lavoro compilata: eliminarlo cancellerebbe anche quella. Usa \"Annulla\" invece.",
    };
  }

  const { error, count } = await service.from("appuntamenti").delete({ count: "exact" }).eq("id", id);
  if (error) return { errore: error.message };
  if (!count) return { errore: "Appuntamento non trovato (forse già eliminato da qualcun altro)." };

  if (appuntamento.google_event_id) {
    await aggiornaEventoCalendario(appuntamento.google_event_id, { status: "cancelled" });
  }

  await service.from("storico").insert({
    origine: "appuntamento",
    riferimento_id: id,
    operazione: "Eliminazione",
    valore_prima: appuntamento.titolo,
    valore_dopo: null,
    operatore_id: persona.id,
  });

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

/** ★ NUOVA — sostituisce firmaClienteDataUrl (disegno su schermo): il
 * cliente approva via OTP email o, solo se autorizzato dal tecnico, via
 * link email — mai più un'immagine caricata. Vedi migrazione
 * 0050_firma_cliente_scheda.sql e inviaOtpFirmaCliente()/
 * inviaLinkFirmaCliente()/verificaOtpFirmaCliente() più sotto.
 *
 * ★ ESTESA (2026-08-28, richiesta esplicita: "bypassare nel rapporto di
 * lavoro otp del cliente facendo richiedere con otp agli amministratori")
 * — terzo metodo "otp_admin": quando il cliente non può confermare di
 * persona, un amministratore autorizza al suo posto. `email` resta vuota
 * per questo metodo (non è il cliente); `adminId`/`adminNome` indicano chi
 * ha autorizzato — vedi migrazione 0068_otp_admin_firma.sql. */
export interface FirmaClienteApprovata {
  metodo: "otp_email" | "link_email" | "otp_admin";
  email: string;
  /** null per "link_email" finché il cliente non ha ancora cliccato —
   * la scheda si salva comunque, il campo si valorizza dopo (vedi
   * /api/approva/[token]). */
  verificatoIl: string | null;
  /** Solo per metodo "otp_admin" — l'amministratore che ha fornito il
   * codice al tecnico. */
  adminId?: string;
  adminNome?: string;
}

export interface DatiSchedaLavoro {
  esito: string;
  note: string;
  /** ★ NUOVA (2026-08) — niente più campo scritto a mano: l'importo si
   * calcola da solo lato server come somma di `materiali` (vedi
   * salvaSchedaLavoro). */
  metodoPagamentoPosa: "Contanti" | "POS" | "In Fattura" | null;
  materiali: MaterialeUsato[];
  firmaCliente: FirmaClienteApprovata;
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

/** ★ NUOVA — il passo Materiali della Scheda deve sapere se il cliente è
 * Privato o Business per proporre il costo di attivazione giusto (vedi
 * SelettoreMateriali), ma né Appuntamento né SchedaInstallazioneForm/
 * SchedaLavorazioneForm hanno già a disposizione il Ticket collegato —
 * si fa qui un fetch dedicato invece di far passare il dato attraverso
 * i 3 punti da cui la Scheda si apre (Calendario/Vista Tecnico/Ticket).
 * "Azienda"/"Business" (il Ticket usa entrambe le parole a seconda di
 * come è nato) contano come Business, tutto il resto (incluso null) come
 * Privato — di sicuro modificabile a mano dal tecnico se sbagliato.
 *
 * ★ ESTESA (2026-08-28, richiesta esplicita: "il trasferimento si procede
 * come nuova installazione, però il costo è di 60€ e non il costo di
 * privato o business") — porta anche `sottocategoria`: SelettoreMateriali
 * ne ha bisogno per riconoscere un Ticket "Trasferimento" e aggiungere da
 * sola la riga di catalogo giusta (60€ fisso) al posto di Privato/Business.
 * Un solo giro invece di un secondo fetch dedicato. */
export interface ContestoClienteTicket {
  tipoCliente: "Privato" | "Business";
  sottocategoria: string | null;
}

export async function getTipologiaClientePerAppuntamento(appuntamentoId: string): Promise<ContestoClienteTicket> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("appuntamenti")
    .select("tickets(tipologia_cliente, sottocategoria)")
    .eq("id", appuntamentoId)
    .maybeSingle();
  // ★ PostgREST tipizza l'embed come array anche per una relazione
  // many-to-one nota (FK singola) — a runtime è sempre 0 o 1 elemento.
  const righe = (data?.tickets ?? []) as unknown as { tipologia_cliente: string | null; sottocategoria: string | null }[];
  const tipologia = righe[0]?.tipologia_cliente;
  return {
    tipoCliente: tipologia === "Azienda" || tipologia === "Business" ? "Business" : "Privato",
    sottocategoria: righe[0]?.sottocategoria ?? null,
  };
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

  // ★ FIX — la conferma del cliente (OTP verificato, o link autorizzato dal
  // tecnico) era controllata solo lato client (bottone "Salva" disabilitato
  // finché mancante): ripetuto qui, unica fonte di verità, come già per
  // trasmettiPerInstallazione()/i controlli mancanti-per-Trasmetti.
  // ★ ESTESO (2026-08-28, "bypassare... con otp agli amministratori") —
  // per "otp_admin" non c'è un'email del cliente da controllare (`email`
  // resta sempre vuota per questo metodo, vedi FirmaClienteApprovata):
  // serve invece `adminId` valorizzato, e la verifica vale anche qui, non
  // solo per "otp_email".
  if (!dati.firmaCliente?.metodo) {
    return { errore: "Manca la conferma del cliente (codice email, link di approvazione, o autorizzazione admin)." };
  }
  if (dati.firmaCliente.metodo !== "otp_admin" && !dati.firmaCliente.email) {
    return { errore: "Manca la conferma del cliente (codice email o link di approvazione)." };
  }
  if (dati.firmaCliente.metodo === "otp_admin" && !dati.firmaCliente.adminId) {
    return { errore: "Manca l'amministratore che ha autorizzato." };
  }
  if ((dati.firmaCliente.metodo === "otp_email" || dati.firmaCliente.metodo === "otp_admin") && !dati.firmaCliente.verificatoIl) {
    return { errore: "Il codice non risulta verificato." };
  }

  const firmaTecnico = await salvaFirma(dati.firmaTecnicoDataUrl, "firma-tecnico");
  if (firmaTecnico.errore) return { errore: firmaTecnico.errore };

  // ★ NUOVA (2026-08) — non più un numero scritto a mano dal tecnico
  // (scollegato dall'elenco materiali, fonte di errori): l'importo
  // fatturato è sempre la somma delle righe materiali/prodotti/servizi
  // già mostrata al tecnico nel passo Materiali. Le righe in comodato
  // d'uso hanno prezzo_unitario 0 e contribuiscono da sole per 0, non
  // serve escluderle a parte. Ricalcolato qui (non ricevuto dal client)
  // per la stessa ragione di firmaCliente sopra: unica fonte di verità.
  const importo = dati.materiali.reduce((s, m) => s + m.prezzo_unitario * m.quantita, 0);

  const { data: schedaCreata, error: erroreScheda } = await service
    .from("schede_lavoro")
    .insert({
      appuntamento_id: appuntamentoId,
      ticket_id: appuntamento.ticket_id,
      tipo,
      esito: dati.esito.trim() || null,
      note: dati.note.trim() || null,
      importo_fatturato: importo,
      metodo_pagamento_posa: dati.metodoPagamentoPosa,
      materiali: dati.materiali,
      foto: fotoSalvate,
      firma_cliente_url: null,
      firma_cliente_metodo: dati.firmaCliente.metodo,
      firma_cliente_email: dati.firmaCliente.email || null,
      firma_cliente_verificato_il: dati.firmaCliente.verificatoIl,
      firma_cliente_admin_id: dati.firmaCliente.adminId ?? null,
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
    })
    .select("id")
    .single();
  if (erroreScheda) return { errore: erroreScheda.message };

  // ★ NUOVA — scarico automatico magazzino + riconciliazione inventario
  // antenne (vedi materiali/actions.ts): entrambe best-effort, non
  // bloccano mai il salvataggio della scheda già avvenuto sopra.
  await scaricaGiacenzaMateriali(dati.materiali.map((m) => ({ materiale_id: m.materiale_id, quantita: m.quantita })));
  if (dati.mac?.trim()) {
    await riconciliaAntennaInstallata(dati.mac.trim().toUpperCase(), appuntamento.ticket_id, schedaCreata?.id ?? null);
  }

  // ★ NUOVA (2026-08-27, richiesta esplicita: "il rapporto di lavoro deve
  // andare sul gestionale principale... in modo che poi venga inserito
  // dall'operatore nel gestionale esterno delle antenne") — avviso in Chat
  // interna con i dati già pronti da copiare, non bloccante (vedi
  // lib/notifiche-antenne.ts). La coda di riserva in Materiali → Antenne
  // resta comunque disponibile per chi si perde l'avviso.
  if (schedaRiguardaGestionaleAntenne(tipo, dati.mac)) {
    let clienteAntenna = appuntamento.titolo;
    let numeroAntenna: number | null = null;
    if (appuntamento.ticket_id) {
      const { data: ticketAntenna } = await service.from("tickets").select("cliente, numero").eq("id", appuntamento.ticket_id).maybeSingle();
      if (ticketAntenna) {
        clienteAntenna = ticketAntenna.cliente;
        numeroAntenna = ticketAntenna.numero;
      }
    }
    await notificaGestionaleAntenne({
      cliente: clienteAntenna,
      ticketNumero: numeroAntenna,
      tipo,
      mac: dati.mac || null,
      bts: dati.bts || null,
      modelloCpe: dati.modelloCpe || null,
      gpsLat: dati.gpsLat ?? null,
      gpsLng: dati.gpsLng ?? null,
    });
  }

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
        const { oggetto, corpoHtml, corpoTesto } = emailChiusuraTicket(
          ticket.cliente,
          ticket.numero,
          generaTestoScheda({
            tipo,
            esito: dati.esito.trim() || null,
            note: dati.note.trim() || null,
            supporto: dati.supporto || null,
            posizione: dati.posizione || null,
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
            materiali: dati.materiali,
            metodo_pagamento_posa: dati.metodoPagamentoPosa,
            interventi_eseguiti: dati.interventiEseguiti ?? [],
          })
        );
        await inviaEmail({ a: ticket.email, oggetto, corpoHtml, corpoTesto, reparto: ticket.reparto });
      }
    }
  }

  revalidatePath("/calendario");
  revalidatePath("/vista-tecnico");
  revalidatePath("/tickets");
  revalidatePath("/");
  return { errore: null };
}

/** ★ NUOVA — generalizza la firma cliente via email a due punti d'origine:
 * la Scheda di Installazione/Lavorazione (legata a un appuntamento) e il
 * Rapportino di chiusura Ticket (nessun appuntamento coinvolto — si
 * completa il Ticket direttamente, vedi migrazione
 * 0051_firma_cliente_rapportino.sql). Stesse 4 funzioni sotto, un solo
 * parametro che dice a quale dei due si riferiscono, invece di duplicarle. */
export type RiferimentoFirmaCliente = { tipo: "appuntamento"; id: string } | { tipo: "ticket"; id: string };

/** ★ NUOVA — email/nome cliente e numero Ticket per l'ultimo passo della
 * Scheda/Rapportino (Firme): letti al volo invece di doverli far arrivare
 * come prop da più punti d'accesso diversi. */
export async function getContattoPerFirmaCliente(rif: RiferimentoFirmaCliente) {
  const supabase = await createClient();
  const operatore = await getOperatoreCorrente(supabase);
  if (!operatore) return { errore: ERRORE_PERSONA_MANCANTE, email: null, nomeCliente: null, ticketNumero: null };

  // ★ service role: un tecnico esterno (pose.donewifi.it) non ha una
  // sessione Supabase Auth, quindi nessuna riga passerebbe l'RLS con il
  // client legato ai cookie — stesso client già usato più sotto in questa
  // funzione per otp_firma_cliente/token_approvazione.
  const service = createServiceClient();

  if (rif.tipo === "ticket") {
    const { data } = await service.from("tickets").select("numero, cliente, email").eq("id", rif.id).single();
    return { errore: null, email: data?.email ?? null, nomeCliente: data?.cliente ?? "", ticketNumero: data?.numero ?? null };
  }

  const { data } = await service
    .from("appuntamenti")
    .select("titolo, tickets(numero, cliente, email)")
    .eq("id", rif.id)
    .single();
  // ★ la FK appuntamenti→tickets è sempre un oggetto singolo o null, mai un
  // array (stesso ragionamento già applicato altrove per gli embed 1:1).
  const ticket = data?.tickets as unknown as { numero: number; cliente: string; email: string | null } | null;

  return {
    errore: null,
    email: ticket?.email ?? null,
    nomeCliente: ticket?.cliente ?? data?.titolo ?? "",
    ticketNumero: ticket?.numero ?? null,
  };
}

const SCADENZA_OTP_MINUTI = 10;
const TENTATIVI_MASSIMI_OTP = 5;

function hashCodiceOtp(codice: string) {
  return createHash("sha256").update(codice).digest("hex");
}

/** una sola colonna valorizzata alla volta, mai entrambe — vedi il check
 * constraint otp_firma_cliente_un_riferimento nella migrazione 0051. */
function colonnaRiferimento(rif: RiferimentoFirmaCliente) {
  return rif.tipo === "appuntamento" ? { appuntamento_id: rif.id, ticket_id: null } : { appuntamento_id: null, ticket_id: rif.id };
}

/** ★ NUOVA — invia un codice a 6 cifre via email, che il cliente legge e
 * conferma di persona al tecnico presente sul posto: sostituisce la firma
 * disegnata su schermo con una prova più solida (vedi migrazioni 0050 e
 * 0051). Non serve essere il tecnico assegnato per usarla, solo staff
 * attivo — stesso controllo di sempre. */
export async function inviaOtpFirmaCliente(rif: RiferimentoFirmaCliente, email: string, nomeCliente: string, ticketNumero: number) {
  const supabase = await createClient();
  const operatore = await getOperatoreCorrente(supabase);
  if (!operatore) return { errore: ERRORE_PERSONA_MANCANTE };
  if (!email.trim()) return { errore: "Serve un'email per inviare il codice." };

  const codice = String(randomInt(0, 1000000)).padStart(6, "0");
  const service = createServiceClient();
  const { error } = await service.from("otp_firma_cliente").insert({
    ...colonnaRiferimento(rif),
    email: email.trim(),
    codice_hash: hashCodiceOtp(codice),
    scaduto_il: new Date(Date.now() + SCADENZA_OTP_MINUTI * 60 * 1000).toISOString(),
  });
  if (error) return { errore: error.message };

  const { oggetto, corpoHtml, corpoTesto } = emailOtpFirmaScheda(nomeCliente, codice, ticketNumero);
  const risultato = await inviaEmail({ a: email.trim(), oggetto, corpoHtml, corpoTesto, reparto: "Analisi Rete" });
  if (risultato.errore) return { errore: risultato.errore };
  return { errore: null };
}

/** ★ NUOVA — verifica il codice inserito dal tecnico (dettato dal
 * cliente): tentativi limitati e scadenza breve, stesso principio di
 * qualunque OTP — non riusa un vecchio codice già consumato o scaduto. */
export async function verificaOtpFirmaCliente(rif: RiferimentoFirmaCliente, email: string, codice: string) {
  const supabase = await createClient();
  const operatore = await getOperatoreCorrente(supabase);
  if (!operatore) return { errore: ERRORE_PERSONA_MANCANTE, verificatoIl: null };

  const service = createServiceClient();
  const colonna = rif.tipo === "appuntamento" ? "appuntamento_id" : "ticket_id";
  const { data: riga } = await service
    .from("otp_firma_cliente")
    .select("id, codice_hash, tentativi, scaduto_il, verificato_il")
    .eq(colonna, rif.id)
    .eq("email", email.trim())
    .is("verificato_il", null)
    .order("creato_il", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!riga) return { errore: "Nessun codice in attesa — invialo di nuovo.", verificatoIl: null };
  if (new Date(riga.scaduto_il).getTime() < Date.now()) return { errore: "Il codice è scaduto — invialo di nuovo.", verificatoIl: null };
  if (riga.tentativi >= TENTATIVI_MASSIMI_OTP) return { errore: "Troppi tentativi sbagliati — invia un nuovo codice.", verificatoIl: null };

  if (hashCodiceOtp(codice.trim()) !== riga.codice_hash) {
    await service.from("otp_firma_cliente").update({ tentativi: riga.tentativi + 1 }).eq("id", riga.id);
    return { errore: "Codice errato.", verificatoIl: null };
  }

  const adesso = new Date().toISOString();
  const { error } = await service.from("otp_firma_cliente").update({ verificato_il: adesso }).eq("id", riga.id);
  if (error) return { errore: error.message, verificatoIl: null };
  return { errore: null, verificatoIl: adesso };
}

/**
 * ★ NUOVA (2026-08-28, richiesta esplicita: "bypassare nel rapporto di
 * lavoro otp del cliente facendo richiedere con otp agli amministratori")
 * — gli amministratori attivi da mostrare nel selettore "chi ti ha dato il
 * codice" di FirmaClienteScheda, popolato al volo invece che passato come
 * prop da ogni chiamante (stesso principio di getContattoPerFirmaCliente).
 */
export async function getAmministratoriAttiviPerFirma(): Promise<{ id: string; nome: string }[]> {
  const service = createServiceClient();
  const { data } = await service.from("persone").select("id, nome").eq("attivo", true).eq("amministratore", true).order("nome", { ascending: true });
  return data ?? [];
}

/**
 * ★ NUOVA — quando il cliente non può confermare di persona
 * (irraggiungibile, assente...), un amministratore autorizza al suo
 * posto: stesso principio dell'OTP cliente, ma il codice arriva in Chat
 * interna a TUTTI gli amministratori attivi insieme (richiesta esplicita:
 * "arriva su chat... all'amministratore") — chiunque di loro lo veda per
 * primo può darlo al tecnico, non serve sceglierne uno in anticipo.
 */
export async function richiediOtpAmministratore(rif: RiferimentoFirmaCliente, nomeCliente: string, ticketNumero: number) {
  const supabase = await createClient();
  const operatore = await getOperatoreCorrente(supabase);
  if (!operatore) return { errore: ERRORE_PERSONA_MANCANTE };

  const service = createServiceClient();
  const { data: admin } = await service.from("persone").select("id").eq("attivo", true).eq("amministratore", true);
  if (!admin || admin.length === 0) return { errore: "Nessun amministratore attivo a cui chiedere il codice." };

  const codice = String(randomInt(0, 1000000)).padStart(6, "0");
  const { error } = await service.from("otp_admin_firma").insert({
    ...colonnaRiferimentoAdmin(rif),
    codice_hash: hashCodiceOtp(codice),
    scaduto_il: new Date(Date.now() + SCADENZA_OTP_MINUTI * 60 * 1000).toISOString(),
  });
  if (error) return { errore: error.message };

  const riferimentoTesto = ticketNumero > 0 ? `Ticket #${ticketNumero} ${nomeCliente}` : nomeCliente;
  const testo = `🔐 Codice ${codice} per confermare senza il cliente presente — ${riferimentoTesto} (valido ${SCADENZA_OTP_MINUTI} minuti). Dallo al tecnico solo se sei sicuro che serva davvero.`;
  await Promise.all(admin.map((a) => inviaMessaggioChatSistemaDiretto(a.id, testo)));

  return { errore: null };
}

/** una sola colonna valorizzata alla volta — stesso principio di
 * colonnaRiferimento(), tabella diversa (otp_admin_firma). */
function colonnaRiferimentoAdmin(rif: RiferimentoFirmaCliente) {
  return rif.tipo === "appuntamento" ? { appuntamento_id: rif.id, ticket_id: null } : { appuntamento_id: null, ticket_id: rif.id };
}

/**
 * ★ NUOVA — verifica il codice ricevuto dall'amministratore e registra,
 * nella stessa scrittura, quale amministratore lo ha dato al tecnico
 * (`adminId`, raccolto lato client con un selettore prima di verificare —
 * il codice arriva a tutti insieme, non c'è modo di dedurlo dal codice
 * stesso). Stessi limiti dell'OTP cliente: tentativi limitati, scadenza
 * breve, codice monouso.
 */
export async function verificaOtpAmministratore(rif: RiferimentoFirmaCliente, codice: string, adminId: string) {
  const supabase = await createClient();
  const operatore = await getOperatoreCorrente(supabase);
  if (!operatore) return { errore: ERRORE_PERSONA_MANCANTE, verificatoIl: null };
  if (!adminId) return { errore: "Indica quale amministratore ti ha dato il codice.", verificatoIl: null };

  const service = createServiceClient();
  const colonna = rif.tipo === "appuntamento" ? "appuntamento_id" : "ticket_id";
  const { data: riga } = await service
    .from("otp_admin_firma")
    .select("id, codice_hash, tentativi, scaduto_il, verificato_il")
    .eq(colonna, rif.id)
    .is("verificato_il", null)
    .order("creato_il", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!riga) return { errore: "Nessun codice in attesa — richiedilo di nuovo.", verificatoIl: null };
  if (new Date(riga.scaduto_il).getTime() < Date.now()) return { errore: "Il codice è scaduto — richiedilo di nuovo.", verificatoIl: null };
  if (riga.tentativi >= TENTATIVI_MASSIMI_OTP) return { errore: "Troppi tentativi sbagliati — richiedi un nuovo codice.", verificatoIl: null };

  if (hashCodiceOtp(codice.trim()) !== riga.codice_hash) {
    await service.from("otp_admin_firma").update({ tentativi: riga.tentativi + 1 }).eq("id", riga.id);
    return { errore: "Codice errato.", verificatoIl: null };
  }

  const adesso = new Date().toISOString();
  const { error } = await service.from("otp_admin_firma").update({ verificato_il: adesso, admin_id: adminId }).eq("id", riga.id);
  if (error) return { errore: error.message, verificatoIl: null };
  return { errore: null, verificatoIl: adesso };
}

/** ★ NUOVA — fallback al link di approvazione via email (stesso schema già
 * usato per contratto/intervento/preventivo, vedi token_approvazione):
 * SOLO quando il tecnico lo autorizza esplicitamente (conferma richiesta
 * lato client prima di chiamare questa action), mai una scelta lasciata al
 * cliente. Per la Scheda (legata a un appuntamento) il token referenzia
 * l'appuntamento perché la scheda potrebbe non esistere ancora quando il
 * cliente clicca (si salva solo al submit finale del wizard); per il
 * Rapportino referenzia direttamente il ticket_id già esistente su
 * token_approvazione (finora usato solo per origine "intervento" — vedi
 * /api/approva/[token]/route.ts). */
export async function inviaLinkFirmaCliente(rif: RiferimentoFirmaCliente, origineUrl: string, email: string, nomeCliente: string, ticketNumero: number) {
  const supabase = await createClient();
  const operatore = await getOperatoreCorrente(supabase);
  if (!operatore) return { errore: ERRORE_PERSONA_MANCANTE };
  if (!email.trim()) return { errore: "Serve un'email per inviare il link." };

  const service = createServiceClient();
  const { data: creato, error } = await service
    .from("token_approvazione")
    .insert(
      rif.tipo === "appuntamento"
        ? { appuntamento_id: rif.id, origine: "firma_scheda" }
        : { ticket_id: rif.id, origine: "firma_rapportino" }
    )
    .select("token")
    .single();
  if (error) return { errore: error.message };

  const link = `${origineUrl}/approva/${creato.token}`;
  const { oggetto, corpoHtml, corpoTesto } = emailLinkFirmaScheda(nomeCliente, ticketNumero, link);
  const risultato = await inviaEmail({ a: email.trim(), oggetto, corpoHtml, corpoTesto, reparto: "Analisi Rete" });
  if (risultato.errore) return { errore: risultato.errore };
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
