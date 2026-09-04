import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrenteId } from "@/lib/persona";

/**
 * ★ NUOVA (2026-09-04, bug reale trovato controllando "come possiamo
 * migliorare la chat" — stessa classe di bug già risolta 3 volte in questa
 * sessione, pose/richiesta-dati) — `inviaAllegatoChat` (chat/actions.ts)
 * accettava un allegato fino a 10MB dentro il corpo di una Server Action:
 * Next.js limita di default il corpo di una Server Action a 1MB — qualunque
 * file oltre quella soglia (un PDF di poche pagine, una foto non
 * compressa) avrebbe dato lo stesso identico errore generico "An
 * unexpected response was received from the server" già diagnosticato per
 * le Schede di Installazione. Stesso rimedio: il file vero si carica da
 * qui, direttamente dal browser allo storage — la Server Action riceve
 * solo il percorso già caricato, mai il contenuto.
 */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => ({}) as Record<string, unknown>);
  const conversazioneId = String(corpo.conversazioneId || "");
  const nomeFile = String(corpo.nomeFile || "");
  if (!conversazioneId || !nomeFile) {
    return NextResponse.json({ errore: "Richiesta non valida." }, { status: 400 });
  }

  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });

  // ★ la RLS (non l'app) decide chi vede una conversazione — ricontrollata
  // a mano perché sotto si passa alla service role, che la bypassa, per
  // generare l'URL firmata sullo storage privato. Stesso controllo già in
  // uso in inviaAllegatoChat/urlAllegatoChat.
  const { data: consentita } = await supabase.from("conversazioni").select("id").eq("id", conversazioneId).maybeSingle();
  if (!consentita) return NextResponse.json({ errore: "Conversazione non trovata o non accessibile." }, { status: 403 });

  const service = createServiceClient();
  // ★ Supabase Storage rifiuta spazi/accenti nella chiave — il nome
  // originale resta comunque quello mostrato in chat (allegato_nome).
  const nomeSicuro = nomeFile.normalize("NFKD").replace(/[^\w.-]+/g, "_");
  const percorso = `chat/${conversazioneId}/${Date.now()}-${nomeSicuro}`;
  const { data, error } = await service.storage.from("documenti").createSignedUploadUrl(percorso);
  if (error || !data) {
    console.error("api/chat/upload-url:", error?.message);
    return NextResponse.json({ errore: "Errore imprevisto durante la preparazione del caricamento — riprova." }, { status: 500 });
  }

  return NextResponse.json({ percorso: data.path, token: data.token });
}
