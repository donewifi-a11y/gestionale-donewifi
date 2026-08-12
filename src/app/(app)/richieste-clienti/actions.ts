"use server";

import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente } from "@/lib/persona";
import { urlFirmataDocumento } from "@/lib/documenti";
import { revalidatePath } from "next/cache";
import type { RichiestaCliente } from "@/lib/types";

// ★ NUOVA — richiesta esplicita: i moduli inviati dal cliente (Cambio
// IBAN/Anagrafica/Trasferimento/Subentro) collegati a un Ticket non
// comparivano da nessuna parte nel Ticket stesso — bisognava saperlo e
// andare a cercarli a parte in "Richieste Clienti". Usata dalla tab
// "Documenti" del dettaglio Ticket (tickets-board.tsx).
export async function getRichiesteClientiPerTicket(ticketId: string): Promise<RichiestaCliente[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("richieste_clienti")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("data", { ascending: false });
  if (error) console.error("getRichiesteClientiPerTicket:", error.message);
  return (data as RichiestaCliente[] | null) ?? [];
}

export async function urlDocumentoRichiesta(percorso: string) {
  const supabase = await createClient();
  // ★ FIX SICUREZZA — controllava solo `!!user` (sessione Supabase Auth
  // valida), non che lo staff fosse ancora attivo: `persone.attivo = false`
  // non revoca la sessione, e sotto si passa alla service role (bypassa
  // la RLS) per generare l'URL firmata del documento.
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: "Non autenticato.", url: null };

  return urlFirmataDocumento(percorso);
}

export async function aggiornaStatoRichiestaCliente(id: string, nuovoStato: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { error } = await supabase.from("richieste_clienti").update({ stato: nuovoStato }).eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/richieste-clienti");
  return { errore: null };
}
