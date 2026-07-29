import { cookies } from "next/headers";

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

/** Da usare nelle Server Action che devono registrare "chi" ha fatto un'azione. */
export async function richiediPersonaId(): Promise<string> {
  const id = await getPersonaCorrenteId();
  if (!id) throw new Error("Seleziona prima chi sei, dal menu in basso a sinistra.");
  return id;
}
