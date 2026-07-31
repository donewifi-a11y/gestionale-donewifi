"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Promozione, Tariffa } from "@/lib/types";

type DatiTariffa = Pick<Tariffa, "nome" | "tipologia_cliente" | "velocita" | "prezzo_mensile" | "iva_inclusa" | "descrizione" | "attivo" | "ordine">;

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

/** ★ toggle rapido dalla lista, senza aprire il form: una tariffa non più
 * vendibile non va cancellata (resta nello storico/nei contratti già
 * firmati) — si smette solo di proporla ai nuovi clienti. */
export async function impostaSottoscrivibileTariffa(id: string, attivo: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { error } = await supabase.from("tariffe").update({ attivo }).eq("id", id);
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

/** ★ NUOVA — clona un piano esistente per una variante (es. stagionale), invece di ricompilare tutto da zero. */
export async function duplicaTariffa(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { data: originale, error: erroreLettura } = await supabase.from("tariffe").select("*").eq("id", id).single();
  if (erroreLettura || !originale) return { errore: erroreLettura?.message || "Tariffa non trovata." };

  const { error } = await supabase.from("tariffe").insert({
    nome: `${originale.nome} (copia)`,
    tipologia_cliente: originale.tipologia_cliente,
    velocita: originale.velocita,
    prezzo_mensile: originale.prezzo_mensile,
    iva_inclusa: originale.iva_inclusa,
    descrizione: originale.descrizione,
    attivo: false,
    ordine: originale.ordine,
  });
  if (error) return { errore: error.message };

  revalidatePath("/tariffe");
  return { errore: null };
}

type DatiPromozione = Pick<Promozione, "nome" | "tipo" | "valore" | "tariffe_ids" | "da" | "a" | "codice">;

export async function creaPromozione(dati: DatiPromozione) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  if (dati.tariffe_ids.length === 0) return { errore: "Seleziona almeno un piano applicabile." };

  const { error } = await supabase.from("promozioni").insert(dati);
  if (error) return { errore: error.message };

  revalidatePath("/tariffe");
  return { errore: null };
}

export async function aggiornaPromozione(id: string, dati: DatiPromozione) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  if (dati.tariffe_ids.length === 0) return { errore: "Seleziona almeno un piano applicabile." };

  const { error } = await supabase.from("promozioni").update(dati).eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/tariffe");
  return { errore: null };
}

export async function eliminaPromozione(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { error } = await supabase.from("promozioni").delete().eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/tariffe");
  return { errore: null };
}
