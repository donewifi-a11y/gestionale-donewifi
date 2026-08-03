"use server";

import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrenteId, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import { creaEventoCalendario, aggiornaEventoCalendario } from "@/lib/google-calendar";
import { revalidatePath } from "next/cache";
import type { StatoAppuntamento, TipoServizioAppuntamento } from "@/lib/types";

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

  const { data } = await supabase
    .from("appuntamenti")
    .select("id, titolo, data_ora, durata_minuti, tecnico_id")
    .eq("stato", "Programmato")
    .gte("data_ora", oggi.toISOString())
    .lte("data_ora", tra14gg.toISOString())
    .order("data_ora", { ascending: true });

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
