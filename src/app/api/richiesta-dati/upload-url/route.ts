import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/** ★ FIX — i 4 allegati (documento + tessera sanitaria) caricati insieme
 * superavano il limite di ~4.5MB del corpo delle funzioni Vercel quando
 * passavano dentro /api/richiesta-dati. Questa rotta genera solo un signed
 * upload URL (poche centinaia di byte): il file vero viene poi caricato dal
 * browser direttamente allo storage Supabase (vedi richiesta-dati-form.tsx),
 * senza mai transitare per il corpo di una richiesta a questa app. */
export async function POST(request: NextRequest) {
  // ★ FIX (2026-08-27, trovato in un giro di test pre-lancio) — corpo
  // non-JSON → 500 invece di un errore pulito. Vedi lo stesso fix in
  // api/portale/apri-ticket/route.ts.
  const corpo = await request.json().catch(() => ({}) as Record<string, unknown>);
  const segnalazioneId = String(corpo.segnalazioneId || "");
  const nomeFile = String(corpo.nomeFile || "");
  if (!segnalazioneId || !nomeFile) {
    return NextResponse.json({ errore: "Richiesta non valida." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const percorso = `${segnalazioneId}/${Date.now()}-${nomeFile}`;
  const { data, error } = await supabase.storage.from("documenti").createSignedUploadUrl(percorso);
  if (error || !data) {
    // ★ FIX (2026-08-31, controllo d'oro usabilità) — il messaggio grezzo di
    // Supabase Storage (es. "bucket not found") arrivava al cliente proprio
    // durante il caricamento del documento d'identità — dettaglio tecnico
    // inutile per chi non conosce il gestionale, ora resta nei log server.
    console.error("api/richiesta-dati/upload-url:", error?.message);
    return NextResponse.json({ errore: "Errore imprevisto durante la preparazione del caricamento — riprova." }, { status: 500 });
  }

  return NextResponse.json({ percorso: data.path, token: data.token });
}
