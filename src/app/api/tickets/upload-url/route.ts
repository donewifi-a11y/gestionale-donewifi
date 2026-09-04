import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente } from "@/lib/persona";

/**
 * ★ NUOVA (2026-09, audit generale "senza dimenticare neanche una parte")
 * — `creaTicket()` (tickets/actions.ts) accettava un allegato ("foto
 * apparati"/"allegato contabile" dei campi extra) come `File` dentro il
 * corpo di una Server Action: Next.js limita di default quel corpo a 1MB,
 * stessa identica classe di bug già trovata e corretta 4 volte in questo
 * gestionale (pose, richiesta-dati, chat) — una foto da smartphone non
 * compressa la supera quasi sempre. Stesso rimedio: il file vero si carica
 * qui, direttamente dal browser allo storage, la Server Action riceve solo
 * il percorso già caricato.
 */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => ({}) as Record<string, unknown>);
  const nomeFile = String(corpo.nomeFile || "");
  if (!nomeFile) return NextResponse.json({ errore: "Richiesta non valida." }, { status: 400 });

  const supabase = await createClient();
  // ★ getPersonaCorrente() ricontrolla anche `attivo`, non solo il cookie
  // firmato — sotto si passa alla service role, che bypassa la RLS.
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });

  const service = createServiceClient();
  const nomeSicuro = nomeFile.normalize("NFKD").replace(/[^\w.-]+/g, "_");
  const percorso = `ticket-extra/${Date.now()}-${nomeSicuro}`;
  const { data, error } = await service.storage.from("documenti").createSignedUploadUrl(percorso);
  if (error || !data) {
    console.error("api/tickets/upload-url:", error?.message);
    return NextResponse.json({ errore: "Errore imprevisto durante la preparazione del caricamento — riprova." }, { status: 500 });
  }

  return NextResponse.json({ percorso: data.path, token: data.token });
}
