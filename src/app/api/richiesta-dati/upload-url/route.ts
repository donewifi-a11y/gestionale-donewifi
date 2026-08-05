import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

/** ★ FIX — i 4 allegati (documento + tessera sanitaria) caricati insieme
 * superavano il limite di ~4.5MB del corpo delle funzioni Vercel quando
 * passavano dentro /api/richiesta-dati. Questa rotta genera solo un signed
 * upload URL (poche centinaia di byte): il file vero viene poi caricato dal
 * browser direttamente allo storage Supabase (vedi richiesta-dati-form.tsx),
 * senza mai transitare per il corpo di una richiesta a questa app. */
export async function POST(request: NextRequest) {
  const corpo = await request.json();
  const segnalazioneId = String(corpo.segnalazioneId || "");
  const nomeFile = String(corpo.nomeFile || "");
  if (!segnalazioneId || !nomeFile) {
    return NextResponse.json({ errore: "Richiesta non valida." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const percorso = `${segnalazioneId}/${Date.now()}-${nomeFile}`;
  const { data, error } = await supabase.storage.from("documenti").createSignedUploadUrl(percorso);
  if (error || !data) {
    return NextResponse.json({ errore: error?.message || "Errore preparazione upload." }, { status: 500 });
  }

  return NextResponse.json({ percorso: data.path, token: data.token });
}
