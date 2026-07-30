import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// ★ ex "Verifica Stato" del Portale pubblico — cerca per numero ticket +
// ultime 9 cifre del telefono, come nel vecchio sistema (stesso motivo:
// il cliente potrebbe averlo scritto con o senza prefisso/spazi).
export async function POST(request: NextRequest) {
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
