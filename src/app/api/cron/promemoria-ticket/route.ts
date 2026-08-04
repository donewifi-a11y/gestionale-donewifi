import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verificaRichiestaCron } from "@/lib/cron";
import { inviaNotificaTelegram } from "@/lib/telegram";
import type { AreaAccesso, Segnalazione, Ticket } from "@/lib/types";

const ORE_SOGLIA = 24;
// ★ stessa soglia usata per il badge "in attesa da Ng" nella bacheca
// Segnalazioni (segnalazioni-board.tsx) — coerente tra l'avviso visivo e
// quello via Telegram, stesso numero di giorni per lo stesso concetto.
const GIORNI_SOGLIA_SEGNALAZIONI = 3;

// ★ ex controllaTicketFermi() del vecchio gestionale — un avviso Telegram
// al reparto per i ticket ancora "Da gestire" da troppo tempo, invece del
// solo indicatore visivo in Dashboard.
//
// ★ FIX (controllo d'oro) — nessun promemoria era collegato al passaggio
// Segnalazione → Richiesta Dati: una pratica "Gestione Cliente" con link
// inviato ma senza risposta del cliente restava silenziosa finché uno
// staff non se ne accorgeva da solo scorrendo la bacheca (il badge "in
// attesa da Ng" è solo visivo). Il piano Vercel di questo progetto è
// Hobby (limite 2 cron job, già entrambi occupati) — niente terzo cron,
// il controllo si aggiunge qui.
export async function GET(request: NextRequest) {
  const nonAutorizzato = verificaRichiestaCron(request);
  if (nonAutorizzato) return nonAutorizzato;

  const supabase = createServiceClient();
  const sogliaTicketIso = new Date(Date.now() - ORE_SOGLIA * 60 * 60 * 1000).toISOString();

  const { data: tickets, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("stato", "Da gestire")
    .lt("data_creazione", sogliaTicketIso)
    .order("data_creazione", { ascending: true });

  if (error) return NextResponse.json({ errore: error.message }, { status: 500 });

  const perReparto = new Map<AreaAccesso, Ticket[]>();
  for (const t of (tickets as Ticket[]) ?? []) {
    const lista = perReparto.get(t.reparto) ?? [];
    lista.push(t);
    perReparto.set(t.reparto, lista);
  }

  for (const [reparto, lista] of perReparto) {
    const righe = lista
      .slice(0, 10)
      .map((t) => `• #${t.numero} — ${t.cliente} (${t.priorita})`)
      .join("\n");
    const altri = lista.length > 10 ? `\n… e altri ${lista.length - 10}.` : "";
    await inviaNotificaTelegram(
      reparto,
      `⏰ <b>${lista.length} ticket fermi da oltre ${ORE_SOGLIA}h</b>\n\n${righe}${altri}\n\nApri il gestionale per prenderli in carico.`
    );
  }

  const sogliaSegnalazioniIso = new Date(Date.now() - GIORNI_SOGLIA_SEGNALAZIONI * 24 * 60 * 60 * 1000).toISOString();

  const { data: segnalazioni, error: erroreSegnalazioni } = await supabase
    .from("segnalazioni")
    .select("*")
    .eq("stato", "Gestione Cliente")
    .is("dati_ricevuti_at", null)
    .not("documenti_richiesti_at", "is", null)
    .lt("documenti_richiesti_at", sogliaSegnalazioniIso)
    .order("documenti_richiesti_at", { ascending: true });

  if (erroreSegnalazioni) return NextResponse.json({ errore: erroreSegnalazioni.message }, { status: 500 });

  const segnalazioniFerme = (segnalazioni as Segnalazione[]) ?? [];
  if (segnalazioniFerme.length > 0) {
    const righe = segnalazioniFerme
      .slice(0, 10)
      .map((s) => {
        const giorni = Math.floor((Date.now() - new Date(s.documenti_richiesti_at as string).getTime()) / (1000 * 60 * 60 * 24));
        return `• #${s.numero} — ${s.nome} (in attesa da ${giorni}g)`;
      })
      .join("\n");
    const altri = segnalazioniFerme.length > 10 ? `\n… e altre ${segnalazioniFerme.length - 10}.` : "";
    await inviaNotificaTelegram(
      "Commerciale",
      `📋 <b>${segnalazioniFerme.length} Richiesta Dati senza risposta da oltre ${GIORNI_SOGLIA_SEGNALAZIONI} giorni</b>\n\n${righe}${altri}\n\nValuta di ricontattare il cliente o sollecitare l'invio dei dati.`
    );
  }

  return NextResponse.json({ ok: true, ticketFermi: tickets?.length ?? 0, segnalazioniFerme: segnalazioniFerme.length });
}
