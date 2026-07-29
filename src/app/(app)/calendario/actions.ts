"use server";

import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrenteId, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import { creaEventoCalendario, aggiornaEventoCalendario } from "@/lib/google-calendar";
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
    creato_da: personaId,
    google_event_id: googleEventId,
  });
  if (error) return { errore: error.message };

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
