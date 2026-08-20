"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, personaHaAccessoAdmin } from "@/lib/persona";
import { urlFirmataDocumento } from "@/lib/documenti";
import { inviaEmail, emailPraticaCliente } from "@/lib/email";
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

// ★ NUOVA (2026-08) — Subentro, doppio consenso in parallelo (Opzione B
// della proposta): a differenza delle altre 3 pratiche (create solo al
// momento in cui il cliente compila il modulo pubblico), qui la riga
// richieste_clienti nasce PRIMA, quando l'operatore avvia la pratica dal
// Ticket — serve un posto dove agganciare la conferma del vecchio cliente
// anche se il nuovo cliente non ha ancora compilato nulla. "richieste_clienti"
// non ha policy RLS di insert per lo staff (solo select/update, vedi
// 0001_init.sql/0010), quindi si passa dalla service role dopo aver
// verificato qui che chi chiama sia staff attivo — stesso principio già
// usato per eliminaRichiestaCliente().
export async function avviaPraticaSubentro(ticketId: string, nomeNuovoTitolare: string | null) {
  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: "Non autenticato.", richiesta: null };

  const { data: ticket } = await supabase.from("tickets").select("cliente").eq("id", ticketId).single();
  if (!ticket) return { errore: "Ticket non trovato.", richiesta: null };

  const service = createServiceClient();
  const { data: richiesta, error } = await service
    .from("richieste_clienti")
    .insert({
      tipo_richiesta: "Subentro",
      cliente: nomeNuovoTitolare?.trim() || null,
      ticket_id: ticketId,
      dettagli: {},
      documenti: [],
      stato: "Da Lavorare",
    })
    .select("*")
    .single();
  if (error) return { errore: error.message, richiesta: null };

  const personaId = await getPersonaCorrenteId();
  await service.from("storico").insert({
    origine: "richiesta_cliente",
    riferimento_id: richiesta.id,
    operazione: "Pratica di Subentro avviata",
    valore_dopo: `Vecchio titolare: ${ticket.cliente}${nomeNuovoTitolare ? ` — Nuovo titolare indicato: ${nomeNuovoTitolare}` : ""}`,
    operatore_id: personaId,
  });

  revalidatePath("/richieste-clienti");
  return { errore: null, richiesta: richiesta as RichiestaCliente };
}

// ★ NUOVA (2026-08) — genera (o rigenera, sostituendo quello precedente
// non ancora usato — stesso principio del token per ticket in
// inviaEmailApprovazioneTicket) il link di conferma per il VECCHIO cliente
// di una pratica di Subentro, e lo invia via email se il Ticket ne ha una
// registrata. Riusa token_approvazione/api/approva/[token] — stesso
// meccanismo già in produzione per contratto/preventivo/firma, qui con
// origine='subentro_vecchio_cliente' e richiesta_cliente_id al posto di
// ticket_id/segnalazione_id.
export async function inviaLinkVecchioClienteSubentro(richiestaClienteId: string, ticketId: string, origineUrl: string) {
  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: "Non autenticato.", link: null, telefono: null, email: null };

  const { data: ticket } = await supabase.from("tickets").select("numero, cliente, telefono, email, reparto").eq("id", ticketId).single();
  if (!ticket) return { errore: "Ticket non trovato.", link: null, telefono: null, email: null };

  const service = createServiceClient();
  await service.from("token_approvazione").delete().eq("richiesta_cliente_id", richiestaClienteId);
  const { data: creato, error } = await service
    .from("token_approvazione")
    .insert({ richiesta_cliente_id: richiestaClienteId, origine: "subentro_vecchio_cliente" })
    .select("token")
    .single();
  if (error) return { errore: error.message, link: null, telefono: null, email: null };

  const link = `${origineUrl}/approva/${creato.token}`;
  if (ticket.email) {
    const { oggetto, corpoHtml, corpoTesto } = emailPraticaCliente(ticket.cliente, "Conferma cessione del contratto (Subentro)", link);
    await inviaEmail({ a: ticket.email, oggetto, corpoHtml, corpoTesto, reparto: ticket.reparto });
  }

  return { errore: null, link, telefono: ticket.telefono, email: ticket.email };
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
