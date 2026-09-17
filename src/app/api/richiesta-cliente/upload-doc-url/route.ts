import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { nomeFileSicuro } from "@/lib/nome-file-sicuro";

/** ★ NUOVA (2026-09-17, "controllo d'oro" — continuazione, bug reale
 * trovato per confronto con la rotta gemella già corretta) — stesso
 * identico problema di api/richiesta-dati/upload-url/route.ts (vedi lì il
 * commento completo): i 4 allegati del modulo di Subentro (fronte/retro
 * documento, fronte/retro tessera sanitaria) passavano ancora nel corpo
 * di api/richiesta-cliente, superando facilmente il limite di ~4.5MB
 * delle funzioni Vercel con foto vere da fotocamera — l'unico dei moduli
 * pubblici con allegati a non essere mai stato migrato a questo schema.
 * Genera solo un signed upload URL (poche centinaia di byte): il file
 * vero si carica poi dal browser direttamente allo storage Supabase.
 */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => ({}) as Record<string, unknown>);
  const nomeFile = String(corpo.nomeFile || "");
  if (!nomeFile) {
    return NextResponse.json({ errore: "Richiesta non valida." }, { status: 400 });
  }

  const supabase = createServiceClient();
  // ★ FIX (2026-09-17, code review approfondita) — mancava, vedi il commento
  // in lib/nome-file-sicuro.ts.
  const percorso = `richieste-cliente/${Date.now()}-${nomeFileSicuro(nomeFile)}`;
  const { data, error } = await supabase.storage.from("documenti").createSignedUploadUrl(percorso);
  if (error || !data) {
    console.error("api/richiesta-cliente/upload-doc-url:", error?.message);
    return NextResponse.json({ errore: "Errore imprevisto durante la preparazione del caricamento — riprova." }, { status: 500 });
  }

  return NextResponse.json({ percorso: data.path, token: data.token });
}
