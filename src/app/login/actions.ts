"use server";

import { createClient } from "@/lib/supabase/server";
import { impostaCookiePersona, rimuoviCookiePersona } from "@/lib/persona";

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

  if (!persona) {
    // ★ FIX (2026-09-10, bug reale: "non è possibile aprire i ticket per i
    // diversi reparti da alcuni account" — trovato con "Antonietta" ma non
    // specifico a lei) — se questo login non è collegato a nessuna Persona
    // attiva (un vecchio accesso condiviso, es. "fornitori@donewifi.it",
    // nato prima del login individuale) e nel browser resta un cookie "Tu
    // sei" da una sessione precedente, prima restava lì intatto: l'app
    // sembrava sapere "chi sei" (una Persona vera, magari tutt'altra
    // persona) mentre l'accesso Supabase Auth reale non è nessuno di
    // attivo — ogni scrittura protetta da RLS (creare/chiudere un Ticket,
    // ecc.) falliva con un errore che sembrava un bug casuale invece che
    // una conseguenza diretta di questo. Ripulito qui alla radice.
    await rimuoviCookiePersona();
    return { selezionata: false };
  }

  await impostaCookiePersona(persona.id);
  return { selezionata: true };
}
