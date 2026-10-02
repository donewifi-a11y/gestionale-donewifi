"use server";

import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import { messaggioErroreRls } from "@/lib/errori-rls";
import { revalidatePath } from "next/cache";
import type { StatoTicket } from "@/lib/types";

// ★ ex riaprTicketDaArchivio() del vecchio gestionale — un Ticket chiuso
// per errore, o riaperto perché il cliente ha richiamato, torna attivo
// senza doverlo ricreare da zero.
export async function riapriTicket(id: string, statoVecchio: StatoTicket) {
  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: ERRORE_PERSONA_MANCANTE };

  const { error } = await supabase
    .from("tickets")
    .update({ stato: "Da gestire", aggiornato_il: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    // ★ FIX (2026-10-02, audit d'oro — regressione) — messaggio Postgres
    // grezzo mostrato as-is in archivio-board.tsx (nessuna traduzione come
    // altrove nel gestionale per lo stesso tipo di errore RLS).
    const messaggioRls = await messaggioErroreRls(supabase, "riaprire il Ticket", error.message, persona);
    return { errore: messaggioRls ?? error.message };
  }

  await supabase.from("storico").insert({
    origine: "ticket",
    riferimento_id: id,
    operazione: "Riaperto dall'Archivio",
    valore_prima: statoVecchio,
    valore_dopo: "Da gestire",
    operatore_id: persona.id,
  });

  revalidatePath("/archivio");
  revalidatePath("/tickets");
  return { errore: null };
}
