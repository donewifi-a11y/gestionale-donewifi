import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verificaRichiestaCron } from "@/lib/cron";
import { titoloAppuntamento, stimaComuneDaIndirizzo } from "@/lib/types";
import { aggiornaEventoCalendario } from "@/lib/google-calendar";

/**
 * ★ NUOVA (2026-09-09, richiesta esplicita: audit dei titoli calendario —
 * "ancora non vedono tutti i dettagli") — trovato controllando i dati
 * reali: la revisione di titoloAppuntamento() (comune nel titolo, tipo di
 * intervento obbligatorio) si applica solo agli Appuntamenti creati da
 * quel momento in poi — ~30 già esistenti (molti ancora da fare)
 * portavano ancora il vecchio formato "Categoria — Sottocategoria ·
 * Cliente", senza comune né dettaglio del lavoro. Rotta temporanea "usa e
 * getta" (stesso auth token dei cron esistenti, verificaRichiestaCron —
 * non richiede una sessione staff, solo il segreto già in uso): da
 * rimuovere dopo l'unico utilizzo previsto, non è pensata per restare.
 *
 * Il "tipo di intervento" specifico (es. "Cambio CPE") non è mai stato
 * salvato separatamente per gli Appuntamenti vecchi — solo la
 * sottocategoria generica del Ticket, un vocabolario diverso e non
 * mappabile 1:1 — quindi qui si rigenera solo comune + cliente (come già
 * accade per "Nuova installazione"), onestamente, invece di inventare un
 * tipo di intervento che non è mai stato registrato.
 *
 * Aggiorna anche l'evento Google Calendar collegato, quando c'è: una
 * `.patch()` che tocca solo il titolo (summary), lasciando invariati
 * luogo/descrizione/orario già sincronizzati.
 *
 * Tocca solo gli Appuntamenti "Programmato" collegati a un Ticket (dati
 * strutturati da cui ricavare comune/cliente in modo affidabile) — quelli
 * senza Ticket, o già Completati/Annullati, restano come sono.
 */
export async function GET(request: NextRequest) {
  const nonAutorizzato = verificaRichiestaCron(request);
  if (nonAutorizzato) return nonAutorizzato;

  const supabase = createServiceClient();
  const { data: appuntamenti, error } = await supabase
    .from("appuntamenti")
    .select("id, titolo, tipo_servizio, indirizzo, ticket_id, google_event_id")
    .eq("stato", "Programmato");
  if (error) return NextResponse.json({ errore: error.message }, { status: 500 });

  const ticketIds = [...new Set((appuntamenti ?? []).map((a) => a.ticket_id).filter((id): id is string => !!id))];
  const { data: tickets } = await supabase.from("tickets").select("id, cliente, indirizzo").in("id", ticketIds.length > 0 ? ticketIds : [""]);
  const ticketPerId = new Map((tickets ?? []).map((t) => [t.id, t]));

  const risultati: { id: string; prima: string; dopo: string; google: boolean }[] = [];
  const saltati: { id: string; motivo: string }[] = [];

  for (const a of appuntamenti ?? []) {
    if (!a.ticket_id) {
      saltati.push({ id: a.id, motivo: "nessun Ticket collegato" });
      continue;
    }
    const ticket = ticketPerId.get(a.ticket_id);
    if (!ticket) {
      saltati.push({ id: a.id, motivo: "Ticket non trovato" });
      continue;
    }
    const indirizzoEffettivo = a.indirizzo || ticket.indirizzo || "";
    const comune = stimaComuneDaIndirizzo(indirizzoEffettivo);
    const nuovoTitolo = titoloAppuntamento(a.tipo_servizio, "", comune, ticket.cliente);
    if (!nuovoTitolo || nuovoTitolo === a.titolo) {
      saltati.push({ id: a.id, motivo: !nuovoTitolo ? "titolo nuovo vuoto (dati mancanti)" : "già aggiornato" });
      continue;
    }

    const { error: erroreUpdate } = await supabase.from("appuntamenti").update({ titolo: nuovoTitolo }).eq("id", a.id);
    if (erroreUpdate) {
      saltati.push({ id: a.id, motivo: erroreUpdate.message });
      continue;
    }

    let google = false;
    if (a.google_event_id) {
      await aggiornaEventoCalendario(a.google_event_id, { summary: nuovoTitolo });
      google = true;
    }
    risultati.push({ id: a.id, prima: a.titolo, dopo: nuovoTitolo, google });
  }

  return NextResponse.json({ ok: true, aggiornati: risultati.length, risultati, saltati });
}
