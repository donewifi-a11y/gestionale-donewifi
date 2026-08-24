import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verificaRichiestaCron } from "@/lib/cron";
import { inviaNotificaTelegram } from "@/lib/telegram";
import { inviaEmail, emailAvvisoInterno } from "@/lib/email";
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
//
// ★ NUOVA (2026-08) — stesso principio, terza aggiunta: riepilogo mattutino
// via email delle Segnalazioni non ancora prese in carico. Orario spostato
// da "0 8 * * 1-6" a "0 9 * * *" in vercel.json (tutti i giorni, non più
// solo lun-sab) apposta per questo — sposta di un'ora anche i due controlli
// sopra (ticket fermi, richiesta dati ferma), effetto collaterale accettato
// per non consumare il secondo slot di cron rimasto libero.
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

  // ★ NUOVA (2026-08) — richiesta esplicita: riepilogo via email ogni
  // mattina (vedi vercel.json, orario spostato alle 9 apposta per questo)
  // delle Segnalazioni ancora "Da Contattare" — non prese in carico da
  // nessuno — verso attivazioni@donewifi.it. A differenza degli avvisi
  // sopra (Telegram, al reparto) qui l'indirizzo è fisso ed è sempre
  // un'email, come richiesto esplicitamente; nessuna soglia di giorni: è
  // un riepilogo giornaliero, non un allarme per un singolo caso vecchio.
  const { data: nonPreseInCarico, error: erroreNonPrese } = await supabase
    .from("segnalazioni")
    .select("*")
    .eq("stato", "Da Contattare")
    .order("data", { ascending: true });
  if (erroreNonPrese) return NextResponse.json({ errore: erroreNonPrese.message }, { status: 500 });

  const segnalazioniNonPrese = (nonPreseInCarico as Segnalazione[]) ?? [];
  if (segnalazioniNonPrese.length > 0) {
    const righeHtml = segnalazioniNonPrese
      .map((s) => `<li>#${s.numero} — ${s.nome} (${s.comune}) — arrivata il ${new Date(s.data).toLocaleDateString("it-IT")}</li>`)
      .join("");
    const righeTesto = segnalazioniNonPrese
      .map((s) => `- #${s.numero} — ${s.nome} (${s.comune}) — arrivata il ${new Date(s.data).toLocaleDateString("it-IT")}`)
      .join("\n");
    const { oggetto, corpoHtml, corpoTesto } = emailAvvisoInterno(
      `${segnalazioniNonPrese.length} Segnalazioni non ancora prese in carico`,
      `<ul style="font-size:14px;color:#141414;line-height:1.7;padding-left:20px;margin:0 0 12px;">${righeHtml}</ul>`,
      righeTesto,
      "https://gestione.donewifi.it/segnalazioni"
    );
    await inviaEmail({ a: "attivazioni@donewifi.it", oggetto, corpoHtml, corpoTesto, reparto: "Commerciale" });
  }

  return NextResponse.json({
    ok: true,
    ticketFermi: tickets?.length ?? 0,
    segnalazioniFerme: segnalazioniFerme.length,
    segnalazioniNonPrese: segnalazioniNonPrese.length,
  });
}
