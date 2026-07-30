"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Tariffa } from "@/lib/types";

type DatiTariffa = Pick<Tariffa, "nome" | "tipologia_cliente" | "velocita" | "prezzo_mensile" | "descrizione" | "attivo" | "ordine">;

export async function creaTariffa(dati: DatiTariffa) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { error } = await supabase.from("tariffe").insert(dati);
  if (error) return { errore: error.message };

  revalidatePath("/tariffe");
  revalidatePath("/richiesta-dati", "layout");
  return { errore: null };
}

export async function aggiornaTariffa(id: string, dati: DatiTariffa) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { error } = await supabase.from("tariffe").update(dati).eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/tariffe");
  revalidatePath("/richiesta-dati", "layout");
  return { errore: null };
}

export async function eliminaTariffa(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { error } = await supabase.from("tariffe").delete().eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/tariffe");
  revalidatePath("/richiesta-dati", "layout");
  return { errore: null };
}
