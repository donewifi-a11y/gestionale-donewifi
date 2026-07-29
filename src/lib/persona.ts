import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import type { createClient } from "@/lib/supabase/server";
import type { AreaAccesso } from "@/lib/types";

// ★ NUOVA — quando un login (staff) è condiviso da più persone reali, la
// sessione Supabase da sola non basta più a sapere "chi è" davvero
// l'operatore: questo cookie porta la persona scelta dopo l'accesso,
// letta sia dai Server Component (liste/filtri) sia dalle Server
// Action (per registrare chi ha fatto cosa).
//
// ★ FIX SICUREZZA — il cookie è firmato (HMAC) con un segreto noto solo
// al server: senza la firma, il valore non passa la verifica, quindi non
// basta più aprire i DevTools e scrivere `document.cookie = "persona_id=..."`
// per "diventare" un'altra persona (anche admin) senza conoscerne la
// password — il server rifiuta qualunque id che non sia stato firmato da
// scegliPersonaCorrente() dopo un controllo password riuscito.
const COOKIE_PERSONA = "persona_id";

function segreto(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("SUPABASE_SERVICE_ROLE_KEY mancante: impossibile firmare il cookie persona.");
  return s;
}

function firma(personaId: string): string {
  return createHmac("sha256", segreto()).update(personaId).digest("hex");
}

function verificaFirma(personaId: string, firmaRicevuta: string): boolean {
  const attesa = Buffer.from(firma(personaId));
  const ricevuta = Buffer.from(firmaRicevuta);
  return attesa.length === ricevuta.length && timingSafeEqual(attesa, ricevuta);
}

export async function getPersonaCorrenteId(): Promise<string | null> {
  const store = await cookies();
  const valore = store.get(COOKIE_PERSONA)?.value;
  if (!valore) return null;

  const separatore = valore.lastIndexOf(".");
  if (separatore === -1) return null;
  const id = valore.slice(0, separatore);
  const firmaRicevuta = valore.slice(separatore + 1);
  if (!verificaFirma(id, firmaRicevuta)) return null;
  return id;
}

export async function impostaCookiePersona(personaId: string) {
  const store = await cookies();
  store.set(COOKIE_PERSONA, `${personaId}.${firma(personaId)}`, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });
}

export const ERRORE_PERSONA_MANCANTE = "Seleziona prima chi sei, dal menu in basso a sinistra.";

export interface PersonaSessione {
  id: string;
  nome: string;
  area_accesso: AreaAccesso;
}

/** La persona scelta (cookie firmato) con il suo livello di accesso — o null se non attiva/non scelta/non valida. */
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
