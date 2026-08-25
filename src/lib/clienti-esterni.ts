import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** ★ Supabase limita ogni risposta a 1000 righe di default — con 3908
 * clienti importati un solo `.select()` ne perderebbe silenziosamente
 * più della metà. Pagina con `.range()` finché non finiscono le righe
 * (ordinate per id, altrimenti la paginazione non è stabile). */
export async function fetchTuttiClientiEsterni<T>(supabase: Supabase, selectClause: string): Promise<T[]> {
  const PAGINA = 1000;
  let offset = 0;
  const tutte: T[] = [];
  for (;;) {
    const { data } = await supabase
      .from("clienti_esterni")
      .select(selectClause)
      .order("id", { ascending: true })
      .range(offset, offset + PAGINA - 1);
    const righe = (data ?? []) as T[];
    tutte.push(...righe);
    if (righe.length < PAGINA) break;
    offset += PAGINA;
  }
  return tutte;
}

/**
 * ★ NUOVA (2026-08) — bug reale segnalato dall'utente: "clienti duplicati
 * risultano attivi, altri non attivi in verità lo sono". Causa trovata sui
 * dati reali: ogni rinnovo/adeguamento di un contratto su Aruba scrive una
 * riga NUOVA in `clienti_esterni` invece di aggiornare quella esistente —
 * stesso `codice_gestionale`, `id` diverso. 696 righe su 3914 erano di
 * questo tipo (stesso contratto, versione superata). Un CF/PIVA con più
 * `codice_gestionale` resta invece legittimo (più punti installati dalla
 * stessa persona) — per questo il dedup raggruppa per `codice_gestionale`,
 * non per CF/PIVA. Tra le righe gemelle si tiene quella con `id` più alto
 * (l'ultimo import Aruba per quel contratto). Righe senza `codice_gestionale`
 * passano invariate (troppo poche, e non c'è una chiave affidabile per
 * raggrupparle). Va applicato ovunque si mostri/conti "i clienti" — liste,
 * ricerca, Buy&Go, analytics — altrimenti ogni rinnovo pesa come un cliente
 * a sé.
 */
export function dedupClientiPerContratto<T extends { id: number; codice_gestionale: string | null }>(clienti: T[]): T[] {
  const migliorePerContratto = new Map<string, T>();
  const senzaContratto: T[] = [];
  for (const c of clienti) {
    if (!c.codice_gestionale) {
      senzaContratto.push(c);
      continue;
    }
    const attuale = migliorePerContratto.get(c.codice_gestionale);
    if (!attuale || c.id > attuale.id) migliorePerContratto.set(c.codice_gestionale, c);
  }
  return [...migliorePerContratto.values(), ...senzaContratto];
}
