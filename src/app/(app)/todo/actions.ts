"use server";

import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrenteId, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import type { TodoPersonale } from "@/lib/types";

// ★ NUOVO — "angolo" personale per i to-do di ciascuna Persona, stesso
// pattern della chat interna (migrazione 0043): dati privati, la RLS
// applica davvero il controllo (persona_corrente_id()), non solo l'app —
// anche una query diretta via REST non potrebbe mai vedere i to-do di
// qualcun altro. Nessun Realtime qui: un solo utente per lista, un
// semplice refresh dopo ogni azione basta.

export async function getTodoPersonali(): Promise<TodoPersonale[]> {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return [];

  const { data } = await supabase
    .from("todo_personali")
    .select("*")
    .eq("persona_id", personaId)
    .order("fatto", { ascending: true })
    .order("creato_il", { ascending: true });
  return (data as TodoPersonale[]) ?? [];
}

export async function creaTodoPersonale(testo: string): Promise<{ errore: string | null; todo: TodoPersonale | null }> {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE, todo: null };
  const testoPulito = testo.trim();
  if (!testoPulito) return { errore: "Scrivi qualcosa da fare.", todo: null };

  const { data, error } = await supabase
    .from("todo_personali")
    .insert({ persona_id: personaId, testo: testoPulito })
    .select("*")
    .single();
  if (error) return { errore: error.message, todo: null };
  return { errore: null, todo: data as TodoPersonale };
}

export async function completaTodoPersonale(id: string, fatto: boolean): Promise<{ errore: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("todo_personali")
    .update({ fatto, completato_il: fatto ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return { errore: error.message };
  return { errore: null };
}

export async function eliminaTodoPersonale(id: string): Promise<{ errore: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("todo_personali").delete().eq("id", id);
  if (error) return { errore: error.message };
  return { errore: null };
}

// ★ FIX — non si poteva correggere il testo di un to-do già creato, solo
// completarlo o eliminarlo: un refuso costringeva a cancellare e riscrivere.
export async function modificaTodoPersonale(id: string, testo: string): Promise<{ errore: string | null }> {
  const supabase = await createClient();
  const testoPulito = testo.trim();
  if (!testoPulito) return { errore: "Il testo non può essere vuoto." };

  const { error } = await supabase.from("todo_personali").update({ testo: testoPulito }).eq("id", id);
  if (error) return { errore: error.message };
  return { errore: null };
}
