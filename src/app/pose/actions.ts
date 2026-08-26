"use server";

import { createServiceClient } from "@/lib/supabase/server";
import {
  getTecnicoEsternoCorrente,
  impostaCookieTecnicoEsterno,
  rimuoviCookieTecnicoEsterno,
} from "@/lib/tecnico-esterno";
import { urlFirmataDocumento } from "@/lib/documenti";
import { inviaEmail, emailChiusuraTicket } from "@/lib/email";
import { aggiornaEventoCalendario } from "@/lib/google-calendar";
import { scaricaGiacenzaMateriali, riconciliaAntennaInstallata } from "@/app/(app)/materiali/actions";
import { revalidatePath } from "next/cache";
import type { DatiSchedaLavoro, FirmaClienteApprovata } from "@/app/(app)/calendario/actions";
import type { Appuntamento, MaterialeMagazzino, StatoTicket, Ticket, TipoServizioAppuntamento } from "@/lib/types";

// ============================================================
// pose.donewifi.it — sistema separato per i tecnici esterni
// (2026-08-26, richiesta esplicita: "semplificare la procedura per i
// tecnici esterni, non passare dal gestionale"). Nessuna dipendenza da
// persona.ts/Supabase Auth: solo il cookie firmato di tecnico-esterno.ts
// e la service role (bypassa RLS, stesso principio già usato da tutte le
// route pubbliche del gestionale — Portale, Richiesta Dati, ecc.).
// ============================================================

export async function loginTecnicoEsterno(email: string, password: string): Promise<{ errore: string | null }> {
  const emailPulita = email.trim();
  if (!emailPulita || !password) return { errore: "Inserisci email e password." };

  const service = createServiceClient();
  const { data: id, error } = await service.rpc("verifica_login_tecnico_esterno", {
    p_email: emailPulita,
    p_password: password,
  });
  if (error) return { errore: error.message };
  if (!id) return { errore: "Email o password errati." };

  await impostaCookieTecnicoEsterno(id);
  return { errore: null };
}

export async function logoutTecnicoEsterno() {
  await rimuoviCookieTecnicoEsterno();
}

export interface InterventiTecnicoEsterno {
  tecnico: { id: string; nome: string; cognome: string | null };
  tickets: Ticket[];
  appuntamenti: Appuntamento[];
}

/** Tutto ciò che è assegnato al tecnico esterno collegato — o `null` se
 * nessuna sessione valida (la pagina reindirizza al login in quel caso). */
export async function getInterventiTecnicoEsterno(): Promise<InterventiTecnicoEsterno | null> {
  const tecnico = await getTecnicoEsternoCorrente();
  if (!tecnico) return null;

  const service = createServiceClient();
  const oraInizio = new Date();
  oraInizio.setHours(0, 0, 0, 0);

  const [{ data: tickets }, { data: appuntamenti }] = await Promise.all([
    service
      .from("tickets")
      .select("*")
      .eq("tecnico_esterno_id", tecnico.id)
      .not("stato", "in", "(Completato,Annullato)")
      .order("data_creazione", { ascending: false }),
    service
      .from("appuntamenti")
      .select("*")
      .eq("tecnico_esterno_id", tecnico.id)
      .eq("stato", "Programmato")
      .gte("data_ora", oraInizio.toISOString())
      .order("data_ora", { ascending: true }),
  ]);

  return { tecnico, tickets: (tickets as Ticket[]) ?? [], appuntamenti: (appuntamenti as Appuntamento[]) ?? [] };
}

/** Il Ticket, solo se assegnato al tecnico esterno collegato — mai un altro. */
export async function getTicketTecnicoEsterno(ticketId: string): Promise<Ticket | null> {
  const tecnico = await getTecnicoEsternoCorrente();
  if (!tecnico) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("tickets")
    .select("*")
    .eq("id", ticketId)
    .eq("tecnico_esterno_id", tecnico.id)
    .maybeSingle();
  return (data as Ticket | null) ?? null;
}

export async function urlDocumentoRapportinoEsterno(percorso: string): Promise<{ errore: string | null; url: string | null }> {
  const tecnico = await getTecnicoEsternoCorrente();
  if (!tecnico) return { errore: "Sessione scaduta — accedi di nuovo.", url: null };
  return urlFirmataDocumento(percorso);
}

/**
 * ★ Equivalente di `completaTicketConRapportino()` (tickets/actions.ts) ma
 * per un tecnico esterno: stessa logica di business (rapportino + chiusura
 * Ticket + storico + email cliente), gate e scrittura diversi — nessuna
 * sessione Supabase Auth qui, solo service role, e `creato_da_tecnico_esterno_id`
 * al posto di `creato_da` (FK diverse, vedi migrazione 0061). Tenuta
 * volutamente separata invece di generalizzare l'originale: i due percorsi
 * di autenticazione sono troppo diversi per un parametro opzionale senza
 * confondere chi legge quale delle due può scrivere cosa.
 */
export async function completaTicketConRapportinoEsterno(
  ticketId: string,
  statoVecchio: StatoTicket,
  dati: { esito: string; lavoriSvolti: string; materiali: string; firmaCliente: FirmaClienteApprovata; importoFatturato: string },
  foto: File[]
): Promise<{ errore: string | null }> {
  const tecnico = await getTecnicoEsternoCorrente();
  if (!tecnico) return { errore: "Sessione scaduta — accedi di nuovo." };
  if (!dati.esito.trim()) return { errore: "L'esito dell'intervento è obbligatorio." };
  if (!dati.firmaCliente?.email || !dati.firmaCliente?.metodo) {
    return { errore: "Manca la conferma del cliente (codice email o link di approvazione)." };
  }
  if (dati.firmaCliente.metodo === "otp_email" && !dati.firmaCliente.verificatoIl) {
    return { errore: "Il codice inviato al cliente non risulta verificato." };
  }

  const service = createServiceClient();

  const { data: ticketRiga } = await service
    .from("tickets")
    .select("cliente, numero, email, reparto, tecnico_esterno_id")
    .eq("id", ticketId)
    .single();
  if (!ticketRiga || ticketRiga.tecnico_esterno_id !== tecnico.id) {
    return { errore: "Questo intervento non risulta assegnato a te." };
  }

  const fotoSalvate: { nome: string; percorso: string }[] = [];
  for (const file of foto) {
    if (file.size === 0) continue;
    const percorso = `rapportini/${ticketId}/${Date.now()}-${file.name}`;
    const { error: erroreFoto } = await service.storage.from("documenti").upload(percorso, file, {
      contentType: file.type || "application/octet-stream",
    });
    if (erroreFoto) return { errore: `Errore caricamento "${file.name}": ${erroreFoto.message}` };
    fotoSalvate.push({ nome: file.name, percorso });
  }

  const { error: erroreRapportino } = await service.from("rapportini_intervento").insert({
    ticket_id: ticketId,
    esito: dati.esito.trim(),
    lavori_svolti: dati.lavoriSvolti.trim() || null,
    materiali: dati.materiali.trim() || null,
    firma_url: null,
    firma_metodo: dati.firmaCliente.metodo,
    firma_email: dati.firmaCliente.email,
    firma_verificato_il: dati.firmaCliente.verificatoIl,
    foto: fotoSalvate,
    creato_da: null,
    creato_da_tecnico_esterno_id: tecnico.id,
  });
  if (erroreRapportino) return { errore: erroreRapportino.message };

  const importo = dati.importoFatturato.trim() ? Number(dati.importoFatturato) : null;
  const { error: erroreStato } = await service
    .from("tickets")
    .update({ stato: "Completato", aggiornato_il: new Date().toISOString(), importo_fatturato: importo })
    .eq("id", ticketId);
  if (erroreStato) return { errore: erroreStato.message };

  // ★ `storico.operatore_id` è `references persone(id)` — un tecnico
  // esterno non può comparire lì (violerebbe la FK): resta null, il nome
  // va nel testo dell'operazione invece che in una colonna che non può
  // ospitarlo, stesso compromesso di rapportini_intervento sopra.
  await service.from("storico").insert({
    origine: "ticket",
    riferimento_id: ticketId,
    operazione: "Cambio Stato",
    valore_prima: statoVecchio,
    valore_dopo: `Completato (tecnico esterno: ${tecnico.nome}${tecnico.cognome ? ` ${tecnico.cognome}` : ""})`,
    operatore_id: null,
  });

  if (ticketRiga.email) {
    const { oggetto, corpoHtml, corpoTesto } = emailChiusuraTicket(ticketRiga.cliente, ticketRiga.numero);
    await inviaEmail({ a: ticketRiga.email, oggetto, corpoHtml, corpoTesto, reparto: ticketRiga.reparto });
  }

  revalidatePath("/pose");
  return { errore: null };
}

/** Catalogo materiali attivi — serve al selettore dentro Scheda
 * Installazione/Lavorazione, stessa fonte già usata internamente. */
export async function getCatalogoMaterialiEsterno(): Promise<MaterialeMagazzino[]> {
  const tecnico = await getTecnicoEsternoCorrente();
  if (!tecnico) return [];
  const service = createServiceClient();
  const { data } = await service.from("materiali_magazzino").select("*").eq("attivo", true).order("ordine", { ascending: true });
  return (data as MaterialeMagazzino[]) ?? [];
}

/** L'appuntamento, solo se assegnato al tecnico esterno collegato. */
export async function getAppuntamentoTecnicoEsterno(appuntamentoId: string): Promise<Appuntamento | null> {
  const tecnico = await getTecnicoEsternoCorrente();
  if (!tecnico) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("appuntamenti")
    .select("*")
    .eq("id", appuntamentoId)
    .eq("tecnico_esterno_id", tecnico.id)
    .maybeSingle();
  return (data as Appuntamento | null) ?? null;
}

/**
 * ★ Equivalente di getTipologiaClientePerAppuntamento() (calendario/actions.ts)
 * — stessa firma, per essere intercambiabile come prop di
 * SchedaInstallazioneForm/SchedaLavorazioneForm (vedi commento lì). Service
 * role invece del client legato ai cookie: nessuna sessione Supabase Auth.
 */
export async function getTipologiaClientePerAppuntamentoEsterno(appuntamentoId: string): Promise<"Privato" | "Business"> {
  const tecnico = await getTecnicoEsternoCorrente();
  if (!tecnico) return "Privato";
  const service = createServiceClient();
  const { data } = await service
    .from("appuntamenti")
    .select("tickets(tipologia_cliente)")
    .eq("id", appuntamentoId)
    .maybeSingle();
  const righe = (data?.tickets ?? []) as unknown as { tipologia_cliente: string | null }[];
  const tipologia = righe[0]?.tipologia_cliente;
  return tipologia === "Azienda" || tipologia === "Business" ? "Business" : "Privato";
}

/**
 * ★ Equivalente di salvaSchedaLavoro() (calendario/actions.ts) per un
 * tecnico esterno — stessa logica di business (Scheda Installazione/
 * Lavorazione + completa appuntamento/Ticket + storico + email cliente),
 * gate e scrittura diversi, stesso principio di
 * completaTicketConRapportinoEsterno() sopra: azione a sé invece di
 * generalizzare l'originale, con `creato_da_tecnico_esterno_id` al posto
 * di `creato_da` (FK diverse, vedi migrazione 0062).
 */
export async function salvaSchedaLavoroEsterno(
  appuntamentoId: string,
  tipo: TipoServizioAppuntamento,
  dati: DatiSchedaLavoro,
  foto: File[]
): Promise<{ errore: string | null }> {
  const tecnico = await getTecnicoEsternoCorrente();
  if (!tecnico) return { errore: "Sessione scaduta — accedi di nuovo." };

  const service = createServiceClient();

  const { data: appuntamento } = await service
    .from("appuntamenti")
    .select("id, ticket_id, titolo, google_event_id, tecnico_esterno_id")
    .eq("id", appuntamentoId)
    .single();
  if (!appuntamento) return { errore: "Appuntamento non trovato." };
  if (appuntamento.tecnico_esterno_id !== tecnico.id) return { errore: "Questo appuntamento non risulta assegnato a te." };

  if (!dati.firmaCliente?.email || !dati.firmaCliente?.metodo) {
    return { errore: "Manca la conferma del cliente (codice email o link di approvazione)." };
  }
  if (dati.firmaCliente.metodo === "otp_email" && !dati.firmaCliente.verificatoIl) {
    return { errore: "Il codice inviato al cliente non risulta verificato." };
  }

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
  const firmaTecnico = await salvaFirma(dati.firmaTecnicoDataUrl, "firma-tecnico");
  if (firmaTecnico.errore) return { errore: firmaTecnico.errore };

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
      firma_cliente_email: dati.firmaCliente.email,
      firma_cliente_verificato_il: dati.firmaCliente.verificatoIl,
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
      creato_da: null,
      creato_da_tecnico_esterno_id: tecnico.id,
    })
    .select("id")
    .single();
  if (erroreScheda) return { errore: erroreScheda.message };

  await scaricaGiacenzaMateriali(dati.materiali.map((m) => ({ materiale_id: m.materiale_id, quantita: m.quantita })));
  if (dati.mac?.trim()) {
    await riconciliaAntennaInstallata(dati.mac.trim().toUpperCase(), appuntamento.ticket_id, schedaCreata?.id ?? null);
  }

  const { error: erroreApp } = await service.from("appuntamenti").update({ stato: "Completato" }).eq("id", appuntamentoId);
  if (erroreApp) return { errore: erroreApp.message };
  if (appuntamento.google_event_id) {
    await aggiornaEventoCalendario(appuntamento.google_event_id, { summary: `✅ ${appuntamento.titolo}` });
  }

  if (appuntamento.ticket_id) {
    const { data: ticket } = await service
      .from("tickets")
      .select("cliente, numero, email, reparto, stato")
      .eq("id", appuntamento.ticket_id)
      .single();
    if (ticket) {
      const { error: erroreTicket } = await service
        .from("tickets")
        .update({ stato: "Completato", aggiornato_il: new Date().toISOString(), importo_fatturato: importo })
        .eq("id", appuntamento.ticket_id);
      if (erroreTicket) return { errore: erroreTicket.message };
      await service.from("storico").insert({
        origine: "ticket",
        riferimento_id: appuntamento.ticket_id,
        operazione: tipo === "Nuova installazione" ? "Certificato Installazione" : "Rapporto Intervento in Loco",
        valore_prima: ticket.stato,
        valore_dopo: `Completato (tecnico esterno: ${tecnico.nome}${tecnico.cognome ? ` ${tecnico.cognome}` : ""})`,
        operatore_id: null,
      });
      if (ticket.email) {
        const { oggetto, corpoHtml, corpoTesto } = emailChiusuraTicket(ticket.cliente, ticket.numero);
        await inviaEmail({ a: ticket.email, oggetto, corpoHtml, corpoTesto, reparto: ticket.reparto });
      }
    }
  }

  revalidatePath("/pose");
  return { errore: null };
}
