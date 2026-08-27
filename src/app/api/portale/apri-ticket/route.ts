import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { notificaSuTuttiICanali } from "@/lib/notifiche-interne";
import type { AreaAccesso } from "@/lib/types";

// ★ ex "Apri un Ticket" del Portale pubblico (Portale.html) — un cliente
// apre direttamente un Ticket senza chiamare, senza login. Il reparto si
// deduce dalla categoria scelta, così il cliente non deve saperlo.
const REPARTO_PER_CATEGORIA: Record<string, AreaAccesso> = {
  Assistenza: "Analisi Rete",
  Commerciale: "Commerciale",
  Amministrativa: "Fatturazione",
};

export async function POST(request: NextRequest) {
  // ★ FIX (2026-08-27, trovato in un giro di test pre-lancio) — un corpo
  // non-JSON (bot, richiesta rilanciata con l'header sbagliato, scanner
  // automatico) faceva fallire `.json()` con un'eccezione non gestita:
  // 500 invece di un errore pulito. Rotta pubblica, va difesa da un corpo
  // qualunque.
  const dati = await request.json().catch(() => ({}) as Record<string, unknown>);

  // ★ honeypot anti-spam: un campo invisibile che solo un bot compila.
  if (dati.trappola) {
    return NextResponse.json({ ok: true, numero: Math.floor(Math.random() * 900 + 100) });
  }

  const nome = String(dati.nome || "").trim();
  const telefono = String(dati.telefono || "").trim();
  const email = String(dati.email || "").trim();
  const categoria = String(dati.categoria || "");
  const problema = String(dati.problema || "").trim();

  if (nome.length < 2) return NextResponse.json({ errore: "Inserisci il tuo nome." }, { status: 400 });
  if (!categoria || !REPARTO_PER_CATEGORIA[categoria]) {
    return NextResponse.json({ errore: "Seleziona il tipo di richiesta." }, { status: 400 });
  }
  if (!telefono || !email) {
    return NextResponse.json({ errore: "Inserisci sia il telefono sia l'email per essere ricontattato." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("tickets")
    .insert({
      cliente: nome,
      telefono: telefono || null,
      email: email || null,
      categoria,
      problema: problema || null,
      priorita: "Normale",
      reparto: REPARTO_PER_CATEGORIA[categoria],
    })
    .select("id, numero")
    .single();
  if (error) return NextResponse.json({ errore: error.message }, { status: 500 });

  // ★ ESTESA (2026-08-27, richiesta esplicita: "inserisci lo stesso
  // sistema di notifica adoperato per documentazione ricevuta... in tutte
  // le zone") — prima solo Telegram, ora anche Chat interna ed email
  // verso attivazioni@donewifi.it, stesso trattamento di Richiesta Dati.
  const reparto = REPARTO_PER_CATEGORIA[categoria];
  const link = `${request.nextUrl.origin}/tickets?aperto=${data.id}`;
  await notificaSuTuttiICanali({
    reparto,
    telegramHtml: `🆕 <b>Ticket aperto dal Portale clienti</b>\n\nCliente: ${nome}\nTicket #${data.numero} · ${categoria}\n\nApri il gestionale per i dettagli.`,
    chatTesto: `🆕 Ticket aperto dal Portale clienti — ${nome}, Ticket #${data.numero} (${categoria}). ${link}`,
    emailTitolo: `Ticket aperto dal Portale — #${data.numero}`,
    emailCorpoHtml: `<p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Cliente: <b>${nome}</b><br>Categoria: ${categoria}${problema ? `<br>Problema: ${problema}` : ""}</p>`,
    emailCorpoTesto: `Cliente: ${nome}\nCategoria: ${categoria}${problema ? `\nProblema: ${problema}` : ""}`,
    emailLink: link,
  });

  return NextResponse.json({ ok: true, numero: data.numero });
}
