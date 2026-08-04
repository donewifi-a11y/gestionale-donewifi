import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// ★ FIX — questa rotta pubblica cerca per numero ticket (intero piccolo e
// sequenziale, non un UUID) + ultime 9 cifre del telefono: senza limite di
// tentativi, conoscendo il telefono di un cliente si potrebbe iterare il
// numero per trovare il suo ticket. Rate limit in memoria per IP — non
// perfetto su serverless (si azzera ad ogni cold start / istanza diversa),
// ma alza comunque di molto il costo di un tentativo automatizzato senza
// bisogno di un servizio esterno (Redis/Upstash) non ancora presente nel
// progetto.
const TENTATIVI_MAX = 8;
const FINESTRA_MS = 5 * 60 * 1000;
const tentativiPerIp = new Map<string, number[]>();

function troppiTentativi(ip: string): boolean {
  const ora = Date.now();
  const storico = (tentativiPerIp.get(ip) ?? []).filter((t) => ora - t < FINESTRA_MS);
  storico.push(ora);
  tentativiPerIp.set(ip, storico);
  // ★ pulizia opportunistica per non far crescere la Map all'infinito nel
  // lungo periodo di vita di un'istanza serverless.
  if (tentativiPerIp.size > 5000) tentativiPerIp.clear();
  return storico.length > TENTATIVI_MAX;
}

// ★ ex "Verifica Stato" del Portale pubblico — cerca per numero ticket +
// ultime 9 cifre del telefono, come nel vecchio sistema (stesso motivo:
// il cliente potrebbe averlo scritto con o senza prefisso/spazi).
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sconosciuto";
  if (troppiTentativi(ip)) {
    return NextResponse.json({ errore: "Troppi tentativi. Riprova tra qualche minuto." }, { status: 429 });
  }

  const dati = await request.json();
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
