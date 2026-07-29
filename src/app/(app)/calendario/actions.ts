"use server";

import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrenteId, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
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
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

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
  if (error) return { errore: error.message };

  revalidatePath("/calendario");
  return { errore: null };
}

export async function cambiaStatoAppuntamento(id: string, stato: StatoAppuntamento) {
  const supabase = await createClient();
  const { error } = await supabase.from("appuntamenti").update({ stato }).eq("id", id);
  if (error) return { errore: error.message };
  revalidatePath("/calendario");
  return { errore: null };
}
