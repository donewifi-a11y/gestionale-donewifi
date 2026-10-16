import { NextResponse, type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createServiceClient } from "@/lib/supabase/server";
import { PreventivoDocument } from "@/lib/pdf/preventivo-document";

// ★ NUOVA (2026-10-16, richiesta esplicita: "preventivo devono essere
// scaricabili in pdf") — lato pubblico: il cliente scarica il PDF dalla
// stessa pagina /approva/[token] dove legge e approva il preventivo,
// stesso token monouso già usato per quella pagina (createServiceClient,
// nessun login — il token stesso è l'autorizzazione), nessun controllo di
// scadenza aggiuntivo: stessa logica "sola lettura" già applicata al
// rendering della pagina stessa (solo l'azione di approvare/rifiutare,
// non la semplice visualizzazione/scarico, controlla la scadenza a 30
// giorni — vedi api/approva/[token]/route.ts).
export const maxDuration = 30;

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: riga } = await supabase.from("token_approvazione").select("preventivo_id").eq("token", token).maybeSingle();
  if (!riga?.preventivo_id) return NextResponse.json({ errore: "Link non valido." }, { status: 404 });

  const { data: preventivo, error } = await supabase
    .from("preventivi")
    .select(
      "numero, cliente_nome, cliente_telefono, cliente_email, cliente_indirizzo, cliente_codice_fiscale, cliente_partita_iva, righe, totale, note, valido_fino_il, creato_il"
    )
    .eq("id", riga.preventivo_id)
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
