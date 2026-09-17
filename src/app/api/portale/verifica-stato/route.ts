import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { creaLimitatoreTentativi, ipRichiesta } from "@/lib/rate-limit-portale";

// ★ FIX — questa rotta pubblica cerca per numero ticket (intero piccolo e
// sequenziale, non un UUID) + ultime 9 cifre del telefono: senza limite di
// tentativi, conoscendo il telefono di un cliente si potrebbe iterare il
// numero per trovare il suo ticket.
// ★ ESTRATTA (2026-09-17, "controllo d'oro" — la logica di rate limit era
// solo qui: trova-cliente aveva lo stesso identico rischio, senza alcuna
// protezione) — vedi lib/rate-limit-portale.ts per il commento completo.
const troppiTentativi = creaLimitatoreTentativi(8, 5 * 60 * 1000);

// ★ ex "Verifica Stato" del Portale pubblico — cerca per numero ticket +
// ultime 9 cifre del telefono, come nel vecchio sistema (stesso motivo:
// il cliente potrebbe averlo scritto con o senza prefisso/spazi).
export async function POST(request: NextRequest) {
  const ip = ipRichiesta(request);
  if (troppiTentativi(ip)) {
    return NextResponse.json({ errore: "Troppi tentativi. Riprova tra qualche minuto." }, { status: 429 });
  }

  // ★ FIX (2026-08-27, trovato in un giro di test pre-lancio) — corpo
  // non-JSON → 500 invece di un errore pulito. Vedi lo stesso fix in
  // apri-ticket/route.ts.
  const dati = await request.json().catch(() => ({}) as Record<string, unknown>);
  const numero = Number(String(dati.numero || "").trim());
  const telefono = String(dati.telefono || "").replace(/\D/g, "");

  if (!numero || telefono.length < 6) {
    return NextResponse.json({ errore: "Inserisci sia il numero del ticket sia il telefono." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, numero, cliente, categoria, stato, data_creazione, telefono")
    .eq("numero", numero)
    .maybeSingle();

  if (!ticket || !ticket.telefono || ticket.telefono.replace(/\D/g, "").slice(-9) !== telefono.slice(-9)) {
    return NextResponse.json({ errore: "Nessun ticket trovato con questi dati. Controlla numero e telefono." }, { status: 404 });
  }

  let esito: string | null = null;
  if (ticket.stato === "Completato") {
    const { data: rapportino } = await supabase
      .from("rapportini_intervento")
      .select("esito")
      .eq("ticket_id", ticket.id)
      .maybeSingle();
    esito = rapportino?.esito ?? null;
  }

  return NextResponse.json({
    ok: true,
    numero: ticket.numero,
    cliente: ticket.cliente,
    categoria: ticket.categoria,
    stato: ticket.stato,
    dataCreazione: ticket.data_creazione,
    esito,
  });
}
