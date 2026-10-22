import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin, personaVedeReparto, type PersonaSessione } from "@/lib/persona";

/**
 * ★ NUOVA — chi può cosa in Fortuna:
 *  - "operatore": amministratori e reparto Commerciale — cercano i coupon e confermano i contratti firmati;
 *  - "admin": solo amministratori — creano campagne, prodotti e percentuali.
 * Da chiamare in OGNI pagina e Server Action del modulo (come per Tariffe: la sola sessione non basta,
 * serve una Persona attiva con il permesso giusto).
 */
export async function richiediFortuna(livello: "operatore" | "admin"): Promise<{ persona: PersonaSessione; isAdmin: boolean }> {
  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!persona) redirect("/login");
  const isAdmin = personaHaAccessoAdmin(persona);
  const ammesso = livello === "admin" ? isAdmin : personaVedeReparto(persona, "Commerciale");
  if (!ammesso) redirect("/");
  return { persona, isAdmin };
}

/** Per le route API: stesso controllo ma senza redirect. */
export async function personaFortuna(livello: "operatore" | "admin"): Promise<PersonaSessione | null> {
  const persona = await getPersonaCorrente(await createClient());
  if (!persona) return null;
  const ammesso = livello === "admin" ? personaHaAccessoAdmin(persona) : personaVedeReparto(persona, "Commerciale");
  return ammesso ? persona : null;
}
