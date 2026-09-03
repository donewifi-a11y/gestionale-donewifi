"use server";

import { createClient } from "@/lib/supabase/server";
import type { SchedaLavoro, RapportinoIntervento } from "@/lib/types";

/** ★ NUOVA (2026-09-03, richiesta esplicita: "una volta salvato il rapporto
 * di lavoro ho bisogno di poterci accedere per visionare tutti i dati fatti
 * e anche ufficio fatturazione per fatturare" — precisata poi: "deve
 * esserci un tab con i rapporti di lavoro divisi per tipologia") — prima
 * l'unico modo di rivedere una Scheda/Rapportino era riaprire il Ticket
 * collegato (e solo se ancora a portata di mano/ricordato); l'Archivio
 * mostrava il Rapportino ma MAI la Scheda di Installazione (materiali,
 * CPE, importo — proprio i dati che servono per fatturare). Qui un elenco
 * completo, senza dover ricordare/ritrovare il Ticket di partenza.
 *
 * Stesso principio di paginazione già in uso per le tabelle grandi del
 * gestionale (vedi fetchTuttiClientiEsterni) — qui probabilmente non serve
 * mai (i lavori completati sono ordini di grandezza meno dei clienti Aruba),
 * ma è comunque sbagliato assumere "meno di 1000 righe per sempre" quando
 * costa lo stesso scriverlo giusto da subito. */

export interface RigaTicketMinimo {
  numero: number;
  cliente: string;
  reparto: string;
  importoFatturato: number | null;
}

export interface RigaScheda extends SchedaLavoro {
  ticket: RigaTicketMinimo | null;
}

export interface RigaRapportino extends RapportinoIntervento {
  ticket: RigaTicketMinimo | null;
}

/** ★ ordina sempre anche per "id" come spareggio: senza un ordine
 * totalmente deterministico `.range()` può saltare o ripetere righe con lo
 * stesso istante di creazione — stesso principio di
 * fetchTuttiClientiEsterni(). `colonnaData` è facoltativa (es. i `tickets`
 * usati qui solo come lookup non hanno bisogno di un ordine preciso). */
async function fetchTutte<T>(supabase: Awaited<ReturnType<typeof createClient>>, tabella: string, selectClause: string, colonnaData?: string): Promise<T[]> {
  const PAGINA = 1000;
  let offset = 0;
  const tutte: T[] = [];
  for (;;) {
    let query = supabase.from(tabella).select(selectClause);
    if (colonnaData) query = query.order(colonnaData, { ascending: false });
    query = query.order("id", { ascending: true });
    const { data, error } = await query.range(offset, offset + PAGINA - 1);
    if (error) {
      console.error(`fetchTutte(${tabella}):`, error.message);
      break;
    }
    const righe = (data ?? []) as T[];
    tutte.push(...righe);
    if (righe.length < PAGINA) break;
    offset += PAGINA;
  }
  return tutte;
}

export async function getRapportiLavoro(): Promise<{ schede: RigaScheda[]; rapportini: RigaRapportino[] }> {
  const supabase = await createClient();

  const [schede, rapportini, tickets] = await Promise.all([
    fetchTutte<SchedaLavoro>(supabase, "schede_lavoro", "*", "creato_il"),
    fetchTutte<RapportinoIntervento>(supabase, "rapportini_intervento", "*", "creato_il"),
    fetchTutte<{ id: string; numero: number; cliente: string; reparto: string; importo_fatturato: number | null }>(
      supabase,
      "tickets",
      "id, numero, cliente, reparto, importo_fatturato"
    ),
  ]);

  const ticketPerId = new Map(tickets.map((t) => [t.id, { numero: t.numero, cliente: t.cliente, reparto: t.reparto, importoFatturato: t.importo_fatturato }]));

  return {
    schede: schede.map((s) => ({ ...s, ticket: s.ticket_id ? (ticketPerId.get(s.ticket_id) ?? null) : null })),
    rapportini: rapportini.map((r) => ({ ...r, ticket: ticketPerId.get(r.ticket_id) ?? null })),
  };
}
