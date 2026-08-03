"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { MaterialeMagazzino } from "@/lib/types";

type DatiMateriale = Pick<
  MaterialeMagazzino,
  "nome" | "prezzo_unitario" | "unita_misura" | "comodato_uso" | "attivo" | "ordine"
>;

export async function creaMateriale(dati: DatiMateriale) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

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

  const { error } = await supabase.from("materiali_magazzino").update(dati).eq("id", id);
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
