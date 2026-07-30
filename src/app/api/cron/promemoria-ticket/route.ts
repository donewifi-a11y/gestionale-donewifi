import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verificaRichiestaCron } from "@/lib/cron";
import { inviaNotificaTelegram } from "@/lib/telegram";
import type { AreaAccesso, Ticket } from "@/lib/types";

const ORE_SOGLIA = 24;

// ★ ex controllaTicketFermi() del vecchio gestionale — un avviso Telegram
// al reparto per i ticket ancora "Da gestire" da troppo tempo, invece del
// solo indicatore visivo in Dashboard.
export async function GET(request: NextRequest) {
  const nonAutorizzato = verificaRichiestaCron(request);
  if (nonAutorizzato) return nonAutorizzato;

  const supabase = createServiceClient();
  const sogliaIso = new Date(Date.now() - ORE_SOGLIA * 60 * 60 * 1000).toISOString();

  const { data: tickets, error } = await supabase
    .from("tickets")
    .select("*")
    .eq("stato", "Da gestire")
    .lt("data_creazione", sogliaIso)
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

  return NextResponse.json({ ok: true, ticketFermi: tickets?.length ?? 0 });
}
