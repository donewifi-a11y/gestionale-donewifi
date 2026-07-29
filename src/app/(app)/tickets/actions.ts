"use server";

import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrenteId, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import { revalidatePath } from "next/cache";
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
