"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { AreaAccesso, PrioritaTicket, StatoTicket } from "@/lib/types";

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
  if (!user) throw new Error("Non autenticato.");

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
      creato_da: user.id,
    })
    .select("id, numero")
    .single();

  if (error) throw new Error(error.message);

  await supabase.from("storico").insert({
    origine: "ticket",
    riferimento_id: data.id,
    operazione: "Creazione Ticket",
    valore_dopo: "Da gestire",
    operatore_id: user.id,
  });

  revalidatePath("/tickets");
  return data;
}

export async function aggiornaStatoTicket(id: string, statoNuovo: StatoTicket, statoVecchio: StatoTicket) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autenticato.");

  const { error } = await supabase
    .from("tickets")
    .update({ stato: statoNuovo, aggiornato_il: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("storico").insert({
    origine: "ticket",
    riferimento_id: id,
    operazione: "Cambio Stato",
    valore_prima: statoVecchio,
    valore_dopo: statoNuovo,
    operatore_id: user.id,
  });

  revalidatePath("/tickets");
}

export async function assegnaTicket(id: string, tecnicoId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase.from("tickets").update({ tecnico_assegnato: tecnicoId }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/tickets");
}

export async function getNoteTicket(ticketId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("note_ticket")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("creato_il", { ascending: true });
  if (error) throw new Error(error.message);
  return data;
}

export async function aggiungiNotaTicket(ticketId: string, testo: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autenticato.");

  const { data, error } = await supabase
    .from("note_ticket")
    .insert({ ticket_id: ticketId, autore_id: user.id, testo })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
