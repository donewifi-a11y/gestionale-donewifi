import { cookies } from "next/headers";
import type { createClient } from "@/lib/supabase/server";
import type { AreaAccesso } from "@/lib/types";

// ★ NUOVA — quando un login (staff) è condiviso da più persone reali, la
// sessione Supabase da sola non basta più a sapere "chi è" davvero
// l'operatore: questo cookie porta la persona scelta dopo l'accesso,
// letta sia dai Server Component (liste/filtri) sia dalle Server
// Action (per registrare chi ha fatto cosa).
const COOKIE_PERSONA = "persona_id";

export async function getPersonaCorrenteId(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_PERSONA)?.value ?? null;
}

export async function impostaCookiePersona(personaId: string) {
  const store = await cookies();
  store.set(COOKIE_PERSONA, personaId, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
}

export const ERRORE_PERSONA_MANCANTE = "Seleziona prima chi sei, dal menu in basso a sinistra.";

export interface PersonaSessione {
  id: string;
  nome: string;
  area_accesso: AreaAccesso;
}

/** La persona scelta (cookie) con il suo livello di accesso — o null se non attiva/non scelta. */
export async function getPersonaCorrente(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<PersonaSessione | null> {
  const id = await getPersonaCorrenteId();
  if (!id) return null;
  const { data } = await supabase
    .from("persone")
    .select("id, nome, area_accesso")
    .eq("id", id)
    .eq("attivo", true)
    .single();
  return data ?? null;
}

export function personaHaAccessoAdmin(persona: PersonaSessione | null): boolean {
  return !!persona && (persona.area_accesso === "Tutto" || persona.area_accesso === "Admin");
}
