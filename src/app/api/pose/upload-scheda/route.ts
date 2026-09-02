import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { chiUsaPose } from "@/app/pose/actions";

/** ★ NUOVA (2026-09-02, bug reale: "Errore imprevisto durante il
 * salvataggio" su pose, Nuova installazione — causa reale: le foto da
 * fotocamera (Struttura esterna + Router interno, anche più di una)
 * passavano nel corpo di `salvaSchedaLavoroEsterno()`/
 * `completaTicketConRapportinoEsterno()`, superando il limite di default
 * di 1MB delle Server Action di Next.js — Next.js risponde con un errore
 * che il client non sa interpretare ("An unexpected response was received
 * from the server"), riproducibile sempre, non solo da pagina stantia.
 * Stesso identico problema già risolto per Richiesta Dati (vedi
 * api/richiesta-dati/upload-url/route.ts) — stessa soluzione: un signed
 * upload URL, il file vero caricato dal browser direttamente allo storage
 * Supabase, mai dentro il corpo di una richiesta a questa app.
 *
 * A differenza della rotta pubblica di Richiesta Dati, questa richiede
 * l'operatore pose autenticato (tecnico esterno o persona interna via
 * pose) — non è una rotta pubblica. */
export async function POST(request: NextRequest) {
  const operatore = await chiUsaPose();
  if (!operatore) return NextResponse.json({ errore: "Sessione scaduta — accedi di nuovo." }, { status: 401 });

  const corpo = await request.json().catch(() => ({}) as Record<string, unknown>);
  const cartella = String(corpo.cartella || "");
  const nomeFile = String(corpo.nomeFile || "");
  if (!cartella || !nomeFile) {
    return NextResponse.json({ errore: "Richiesta non valida." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const percorso = `schede/${cartella}/${Date.now()}-${nomeFile}`;
  const { data, error } = await supabase.storage.from("documenti").createSignedUploadUrl(percorso);
  if (error || !data) {
    console.error("api/pose/upload-scheda:", error?.message);
    return NextResponse.json({ errore: "Errore imprevisto durante la preparazione del caricamento — riprova." }, { status: 500 });
  }

  return NextResponse.json({ percorso: data.path, token: data.token });
}
