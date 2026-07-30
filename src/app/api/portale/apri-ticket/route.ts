import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { inviaNotificaTelegram } from "@/lib/telegram";
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
  const dati = await request.json();

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
  if (!telefono && !email) {
    return NextResponse.json({ errore: "Inserisci almeno un telefono o un'email per essere ricontattato." }, { status: 400 });
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

  await inviaNotificaTelegram(
    REPARTO_PER_CATEGORIA[categoria],
    `🆕 <b>Ticket aperto dal Portale clienti</b>\n\nCliente: ${nome}\nTicket #${data.numero} · ${categoria}\n\nApri il gestionale per i dettagli.`
  );

  return NextResponse.json({ ok: true, numero: data.numero });
}
