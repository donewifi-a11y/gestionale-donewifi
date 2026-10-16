import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { PreventivoDocument } from "@/lib/pdf/preventivo-document";

// ★ NUOVA (2026-10-16, richiesta esplicita: "preventivo devono essere
// scaricabili in pdf") — uso interno (staff autenticato, pannello
// Preventivi): stesso documento generato per /api/approva/[token]/pdf
// (quello pubblico), qui dietro login invece che dietro il token
// monouso dell'approvazione.
export const maxDuration = 30;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });

  const { data: preventivo, error } = await supabase
    .from("preventivi")
    .select(
      "numero, cliente_nome, cliente_telefono, cliente_email, cliente_indirizzo, cliente_codice_fiscale, cliente_partita_iva, righe, totale, note, valido_fino_il, creato_il"
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !preventivo) return NextResponse.json({ errore: "Preventivo non trovato." }, { status: 404 });

  const buffer = await renderToBuffer(<PreventivoDocument preventivo={preventivo} />);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="preventivo-${preventivo.numero}.pdf"`,
    },
  });
}
