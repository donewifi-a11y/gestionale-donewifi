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
