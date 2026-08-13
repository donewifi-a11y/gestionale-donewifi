"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, personaHaAccessoAdmin } from "@/lib/persona";
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

// ★ NUOVA — richiesta esplicita: un amministratore deve poter cancellare
// una Richiesta Cliente (dati/documenti inviati dal cliente per Cambio
// IBAN/Anagrafica/Trasferimento/Subentro/Richiesta Dati) — es. un test,
// un doppione, o un invio per errore. Stesso schema già usato per
// eliminaSegnalazione(): "richieste_clienti" non ha policy RLS di delete
// (solo select/insert/update, vedi 0001_init.sql/0010), quindi la
// cancellazione vera passa dalla service role, dopo aver verificato qui
// che chi chiama sia admin. I file nello storage (documenti caricati dal
// cliente) restano — stessa scelta già fatta per Segnalazioni: la pulizia
// vera passa dal cron pulizia-documenti, non da qui.
export async function eliminaRichiestaCliente(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona)) return { errore: "Solo un amministratore può eliminare una Richiesta Cliente." };
  const personaId = await getPersonaCorrenteId();

  const { data: richiesta, error: erroreLettura } = await supabase
    .from("richieste_clienti")
    .select("tipo_richiesta, cliente")
    .eq("id", id)
    .single();
  if (erroreLettura || !richiesta) return { errore: erroreLettura?.message || "Richiesta non trovata." };

  const service = createServiceClient();
  const { error } = await service.from("richieste_clienti").delete().eq("id", id);
  if (error) return { errore: error.message };

  await service.from("storico").insert({
    origine: "richiesta_cliente",
    riferimento_id: id,
    operazione: "Richiesta Cliente eliminata",
    valore_prima: `${richiesta.tipo_richiesta} — ${richiesta.cliente ?? "cliente"}`,
    operatore_id: personaId,
  });

  revalidatePath("/richieste-clienti");
  return { errore: null };
}
