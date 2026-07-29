"use server";

import { createClient } from "@/lib/supabase/server";
import { impostaCookiePersona } from "@/lib/persona";
import { revalidatePath } from "next/cache";

async function verificaAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autenticato.");

  const { data: staff } = await supabase.from("staff").select("area_accesso").eq("id", user.id).single();
  if (!staff || (staff.area_accesso !== "Tutto" && staff.area_accesso !== "Admin")) {
    throw new Error("Non hai i permessi per gestire le persone.");
  }
}

export async function creaPersona(nome: string) {
  await verificaAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("persone").insert({ nome });
  if (error) throw new Error(error.message);
  revalidatePath("/persone");
}

export async function aggiornaPersona(id: string, dati: { nome: string; attivo: boolean }) {
  await verificaAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("persone").update(dati).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/persone");
}

/** Chiunque sia autenticato può scegliere "chi è" tra le persone attive. */
export async function scegliPersonaCorrente(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autenticato.");

  const { data: persona } = await supabase.from("persone").select("id").eq("id", id).eq("attivo", true).single();
  if (!persona) throw new Error("Persona non valida.");

  await impostaCookiePersona(id);
}
