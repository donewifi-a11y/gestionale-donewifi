"use server";

import { createClient } from "@/lib/supabase/server";
import { richiediPersonaId } from "@/lib/persona";
import { revalidatePath } from "next/cache";
import type { StatoAppuntamento } from "@/lib/types";

export async function creaAppuntamento(dati: {
  titolo: string;
  indirizzo: string;
  dataOra: string;
  durataMinuti: number;
  tecnicoId: string;
  ticketId: string;
  note: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autenticato.");
  const personaId = await richiediPersonaId();

  const { error } = await supabase.from("appuntamenti").insert({
    titolo: dati.titolo,
    indirizzo: dati.indirizzo || null,
    data_ora: dati.dataOra,
    durata_minuti: dati.durataMinuti,
    tecnico_id: dati.tecnicoId || null,
    ticket_id: dati.ticketId || null,
    note: dati.note || null,
    creato_da: personaId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/calendario");
}

export async function cambiaStatoAppuntamento(id: string, stato: StatoAppuntamento) {
  const supabase = await createClient();
  const { error } = await supabase.from("appuntamenti").update({ stato }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/calendario");
}
