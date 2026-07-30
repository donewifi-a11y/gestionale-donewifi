"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrenteId, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import { revalidatePath } from "next/cache";
import { inviaEmail, emailChiusuraTicket } from "@/lib/email";
import type { AreaAccesso, PrioritaTicket, StatoTicket } from "@/lib/types";

// ★ le Server Action, in produzione, nascondono al client il messaggio di
// un errore lanciato con "throw" — per mostrare messaggi utili bisogna
// restituirli come dato ({ errore }), non lanciarli.

export async function creaTicket(dati: {
  cliente: string;
  telefono: string;
  email: string;
  indirizzo: string;
  categoria: string;
  problema: string;
  priorita: PrioritaTicket;
  reparto: AreaAccesso;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

  const { data, error } = await supabase
    .from("tickets")
    .insert({
      cliente: dati.cliente,
      telefono: dati.telefono || null,
      email: dati.email || null,
      indirizzo: dati.indirizzo || null,
      categoria: dati.categoria,
      problema: dati.problema || null,
      priorita: dati.priorita,
      reparto: dati.reparto,
      creato_da: personaId,
    })
    .select("id, numero")
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
  return { errore: null, id: data.id, numero: data.numero };
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
  const { error } = await supabase.from("tickets").update({ tecnico_assegnato: personaId }).eq("id", id);
  if (error) return { errore: error.message };
  revalidatePath("/tickets");
  return { errore: null };
}

export interface ClienteEsistente {
  cliente: string;
  telefono: string | null;
  email: string | null;
  indirizzo: string | null;
}

// ★ ex cercaAnagraficaSuFoglio() del vecchio gestionale — qui semplificato:
// cerca tra i Ticket già esistenti (stessa fonte usata dalla pagina
// Clienti) invece di un foglio anagrafica separato, e precompila i campi
// di contatto quando si apre un nuovo Ticket per un cliente già noto.
export async function cercaClientiEsistenti(query: string): Promise<ClienteEsistente[]> {
  const testo = query.trim();
  if (testo.length < 2) return [];
  const supabase = await createClient();

  const { data } = await supabase
    .from("tickets")
    .select("cliente, telefono, email, indirizzo, data_creazione")
    .or(`cliente.ilike.%${testo}%,telefono.ilike.%${testo}%`)
    .order("data_creazione", { ascending: false })
    .limit(30);

  const visti = new Set<string>();
  const risultati: ClienteEsistente[] = [];
  for (const t of data ?? []) {
    const chiave = t.cliente.toLowerCase();
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    risultati.push({ cliente: t.cliente, telefono: t.telefono, email: t.email, indirizzo: t.indirizzo });
    if (risultati.length >= 6) break;
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

export async function getRapportinoTicket(ticketId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("rapportini_intervento").select("*").eq("ticket_id", ticketId).maybeSingle();
  return data;
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
  dati: { esito: string; lavoriSvolti: string; materiali: string; firmaDataUrl: string },
  foto: File[]
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };
  if (!dati.esito.trim()) return { errore: "L'esito dell'intervento è obbligatorio." };

  const service = createServiceClient();

  const { data: ticketRiga } = await supabase.from("tickets").select("cliente, numero, email").eq("id", ticketId).single();

  let firmaUrl: string | null = null;
  if (dati.firmaDataUrl) {
    const risposta = await fetch(dati.firmaDataUrl);
    const blob = await risposta.blob();
    const percorso = `rapportini/${ticketId}/firma-${Date.now()}.png`;
    const { error: erroreFirma } = await service.storage.from("documenti").upload(percorso, blob, { contentType: "image/png" });
    if (erroreFirma) return { errore: `Errore salvataggio firma: ${erroreFirma.message}` };
    firmaUrl = percorso;
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
    firma_url: firmaUrl,
    foto: fotoSalvate,
    creato_da: personaId,
  });
  if (erroreRapportino) return { errore: erroreRapportino.message };

  const { error: erroreStato } = await supabase
    .from("tickets")
    .update({ stato: "Completato", aggiornato_il: new Date().toISOString() })
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
    const { oggetto, corpoHtml } = emailChiusuraTicket(ticketRiga.cliente, ticketRiga.numero);
    await inviaEmail({ a: ticketRiga.email, oggetto, corpoHtml });
  }

  revalidatePath("/tickets");
  return { errore: null };
}

export async function urlDocumentoRapportino(percorso: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato.", url: null };

  const service = createServiceClient();
  const { data, error } = await service.storage.from("documenti").createSignedUrl(percorso, 3600);
  if (error) return { errore: error.message, url: null };
  return { errore: null, url: data.signedUrl };
}
