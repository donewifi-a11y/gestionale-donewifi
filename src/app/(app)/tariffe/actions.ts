"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { revalidatePath } from "next/cache";
import type { Promozione, Tariffa } from "@/lib/types";

type DatiTariffa = Pick<
  Tariffa,
  "nome" | "tipologia_cliente" | "velocita" | "prezzo_mensile" | "iva_inclusa" | "prezzo_attivazione" | "descrizione" | "attivo" | "pubblica" | "ordine"
>;

// ★ FIX — stesso controllo mancante di Materiali: nessuna validazione
// server-side sui prezzi, solo `min="0"` sull'input HTML.
function erroreValidazioneTariffa(dati: DatiTariffa): string | null {
  if (dati.prezzo_mensile != null && (!Number.isFinite(dati.prezzo_mensile) || dati.prezzo_mensile < 0)) return "Il canone mensile non può essere negativo.";
  if (dati.prezzo_attivazione != null && (!Number.isFinite(dati.prezzo_attivazione) || dati.prezzo_attivazione < 0)) return "Il costo di attivazione non può essere negativo.";
  return null;
}

export async function creaTariffa(dati: DatiTariffa) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const erroreValidazione = erroreValidazioneTariffa(dati);
  if (erroreValidazione) return { errore: erroreValidazione };

  const { error } = await supabase.from("tariffe").insert(dati);
  if (error) return { errore: error.message };

  revalidatePath("/tariffe");
  revalidatePath("/tariffe/non-sottoscrivibili");
  revalidatePath("/richiesta-dati", "layout");
  return { errore: null };
}

export async function aggiornaTariffa(id: string, dati: DatiTariffa) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const erroreValidazione = erroreValidazioneTariffa(dati);
  if (erroreValidazione) return { errore: erroreValidazione };

  const { error } = await supabase.from("tariffe").update(dati).eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/tariffe");
  revalidatePath("/tariffe/non-sottoscrivibili");
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
  revalidatePath("/tariffe/non-sottoscrivibili");
  revalidatePath("/richiesta-dati", "layout");
  return { errore: null };
}

/** ★ toggle rapido per "compare nella documentazione inviata al cliente" —
 * indipendente da `attivo`: una tariffa può restare sottoscrivibile ma
 * fuori dal form pubblico (venduta solo su trattativa diretta). */
export async function impostaPubblicaTariffa(id: string, pubblica: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { error } = await supabase.from("tariffe").update({ pubblica }).eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/tariffe");
  revalidatePath("/tariffe/non-sottoscrivibili");
  revalidatePath("/richiesta-dati", "layout");
  return { errore: null };
}

// ★ eliminare una Tariffa è un'azione da Admin, non da qualsiasi membro
// dello staff — riguarda i prezzi venduti ai clienti. La RLS (migrazione
// 0035) non concede più DELETE al client normale: passa dalla service
// role, con il controllo admin fatto qui.
export async function eliminaTariffa(id: string) {
  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona)) return { errore: "Solo un amministratore può eliminare una tariffa." };

  const service = createServiceClient();
  const { error } = await service.from("tariffe").delete().eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/tariffe");
  revalidatePath("/tariffe/non-sottoscrivibili");
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
    prezzo_attivazione: originale.prezzo_attivazione,
    descrizione: originale.descrizione,
    attivo: false,
    pubblica: originale.pubblica,
    ordine: originale.ordine,
  });
  if (error) return { errore: error.message };

  revalidatePath("/tariffe");
  revalidatePath("/tariffe/non-sottoscrivibili");
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

// ★ stesso discorso di eliminaTariffa(): solo Admin, passa dalla service role.
export async function eliminaPromozione(id: string) {
  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona)) return { errore: "Solo un amministratore può eliminare una promozione." };

  const service = createServiceClient();
  const { error } = await service.from("promozioni").delete().eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/tariffe");
  return { errore: null };
}
