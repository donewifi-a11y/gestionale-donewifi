"use server";

import { createClient } from "@/lib/supabase/server";
import { impostaCookiePersona } from "@/lib/persona";
import { revalidatePath } from "next/cache";

// ★ le Server Action, in produzione, nascondono al client il messaggio di
// un errore lanciato con "throw" — per mostrare messaggi utili bisogna
// restituirli come dato, non lanciarli.
async function verificaAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Non autenticato.";

  const { data: staff } = await supabase.from("staff").select("area_accesso").eq("id", user.id).single();
  if (!staff || (staff.area_accesso !== "Tutto" && staff.area_accesso !== "Admin")) {
    return "Non hai i permessi per gestire le persone.";
  }
  return null;
}

export async function creaPersona(nome: string) {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso };

  const supabase = await createClient();
  const { error } = await supabase.from("persone").insert({ nome });
  if (error) return { errore: error.message };

  revalidatePath("/persone");
  return { errore: null };
}

export async function aggiornaPersona(id: string, dati: { nome: string; attivo: boolean }) {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso };

  const supabase = await createClient();
  const { error } = await supabase.from("persone").update(dati).eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/persone");
  return { errore: null };
}

/** Chiunque sia autenticato può scegliere "chi è" tra le persone attive. */
export async function scegliPersonaCorrente(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { data: persona } = await supabase.from("persone").select("id").eq("id", id).eq("attivo", true).single();
  if (!persona) return { errore: "Persona non valida." };

  await impostaCookiePersona(id);
  return { errore: null };
}
