"use server";

import { createClient } from "@/lib/supabase/server";
import { impostaCookiePersona } from "@/lib/persona";

// ★ login individuale — quando l'account appena autenticato è collegato
// a una Persona (persone.auth_user_id), la scelta "Tu sei" non serve
// più: la password è già stata verificata da Supabase Auth al login,
// quindi si seleziona automaticamente quella Persona.
export async function selezionaPersonaDopoLogin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { selezionata: false };

  const { data: persona } = await supabase
    .from("persone")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("attivo", true)
    .maybeSingle();

  if (!persona) return { selezionata: false };

  await impostaCookiePersona(persona.id);
  return { selezionata: true };
}
