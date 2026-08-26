import type { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente } from "@/lib/persona";
import { getTecnicoEsternoCorrente } from "@/lib/tecnico-esterno";

// ★ NUOVA (2026-08-26) — "chi sta operando ora" può essere uno staff
// interno (persona.ts) o un tecnico esterno (tecnico-esterno.ts, sistema
// pose.donewifi.it) — la firma cliente (OTP/link email) in
// calendario/actions.ts è la stessa identica azione fisica per entrambi
// ("il tecnico presente chiede conferma al cliente"), non ha senso
// restringerla al solo staff interno. Questo accessor prova prima persona
// (più comune, un solo giro DB in più solo quando serve) poi tecnico
// esterno, così le funzioni condivise chiedono "c'è un operatore?" invece
// di "c'è una persona?" senza duplicare la logica di firma cliente.
export type Operatore =
  | { tipo: "persona"; id: string; nome: string }
  | { tipo: "tecnico_esterno"; id: string; nome: string };

export async function getOperatoreCorrente(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Operatore | null> {
  const persona = await getPersonaCorrente(supabase);
  if (persona) return { tipo: "persona", id: persona.id, nome: persona.nome };

  const tecnico = await getTecnicoEsternoCorrente();
  if (tecnico) return { tipo: "tecnico_esterno", id: tecnico.id, nome: [tecnico.nome, tecnico.cognome].filter(Boolean).join(" ") };

  return null;
}
