"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { MaterialeMagazzino } from "@/lib/types";

type DatiMateriale = Pick<
  MaterialeMagazzino,
  "nome" | "categoria" | "descrizione" | "prezzo_unitario" | "unita_misura" | "comodato_uso" | "attivo" | "ordine"
>;

// ★ FIX — nessun controllo lato server sul prezzo, solo `min="0"`
// sull'input HTML (aggirabile). Un prezzo negativo si propagherebbe in
// silenzio nei rapportini e nei totali Dashboard.
function erroreValidazioneMateriale(dati: DatiMateriale): string | null {
  if (!Number.isFinite(dati.prezzo_unitario) || dati.prezzo_unitario < 0) return "Il prezzo non può essere negativo.";
  return null;
}

export async function creaMateriale(dati: DatiMateriale) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const erroreValidazione = erroreValidazioneMateriale(dati);
  if (erroreValidazione) return { errore: erroreValidazione };

  const { error } = await supabase.from("materiali_magazzino").insert(dati);
  if (error) return { errore: error.message };

  revalidatePath("/materiali");
  return { errore: null };
}

export async function aggiornaMateriale(id: string, dati: DatiMateriale) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const erroreValidazione = erroreValidazioneMateriale(dati);
  if (erroreValidazione) return { errore: erroreValidazione };

  const { error } = await supabase.from("materiali_magazzino").update(dati).eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/materiali");
  return { errore: null };
}

// ★ NUOVA — toggle rapido per la schermata "In Scheda di lavoro"
// (selettore-visibilita-schede.tsx): non tocca prezzo/categoria/altro, solo
// se il materiale compare o meno nel selettore delle Schede di
// Installazione/Lavorazione Tecnica — indipendente da "attivo".
export async function impostaVisibilitaSchedaMateriale(id: string, visibile: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { error } = await supabase.from("materiali_magazzino").update({ mostra_in_schede_lavoro: visibile }).eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/materiali");
  return { errore: null };
}

export async function eliminaMateriale(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { error } = await supabase.from("materiali_magazzino").delete().eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/materiali");
  return { errore: null };
}
