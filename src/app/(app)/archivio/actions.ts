"use server";

import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrenteId, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import { revalidatePath } from "next/cache";
import type { StatoTicket } from "@/lib/types";

// ★ ex riaprTicketDaArchivio() del vecchio gestionale — un Ticket chiuso
// per errore, o riaperto perché il cliente ha richiamato, torna attivo
// senza doverlo ricreare da zero.
export async function riapriTicket(id: string, statoVecchio: StatoTicket) {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

  const { error } = await supabase
    .from("tickets")
    .update({ stato: "Da gestire", aggiornato_il: new Date().toISOString() })
    .eq("id", id);
  if (error) return { errore: error.message };

  await supabase.from("storico").insert({
    origine: "ticket",
    riferimento_id: id,
    operazione: "Riaperto dall'Archivio",
    valore_prima: statoVecchio,
    valore_dopo: "Da gestire",
    operatore_id: personaId,
  });

  revalidatePath("/archivio");
  revalidatePath("/tickets");
  return { errore: null };
}
