import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente } from "@/lib/persona";
import { nomeFileSicuro } from "@/lib/nome-file-sicuro";

/**
 * ★ NUOVA (2026-09-18, audit modulo Segnalazioni, Bug Critico confermato) —
 * `caricaContrattoSegnalazione()` (segnalazioni/actions.ts) riceveva ancora
 * il `File` vero dentro il corpo di una Server Action (`FormData`), lo
 * stesso identico problema già anticipato nel commento di
 * `api/richieste-clienti/upload-contratto-url/route.ts` ("a differenza di
 * caricaContrattoSegnalazione(), ancora con un File dentro il corpo di una
 * Server Action") ma mai corretto qui: un contratto firmato scansionato
 * multi-pagina supera facilmente il limite di ~1MB del corpo di una Server
 * Action. Stesso schema ormai consolidato: signed upload URL (poche
 * centinaia di byte), il file vero si carica dal browser direttamente allo
 * storage Supabase.
 */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => ({}) as Record<string, unknown>);
  const segnalazioneId = String(corpo.segnalazioneId || "");
  const nomeFile = String(corpo.nomeFile || "");
  if (!segnalazioneId || !nomeFile) return NextResponse.json({ errore: "Richiesta non valida." }, { status: 400 });

  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });

  const service = createServiceClient();
  const percorso = `contratti/${segnalazioneId}-${Date.now()}-${nomeFileSicuro(nomeFile)}`;
  const { data, error } = await service.storage.from("documenti").createSignedUploadUrl(percorso);
  if (error || !data) {
    console.error("api/segnalazioni/upload-contratto-url:", error?.message);
    return NextResponse.json({ errore: "Errore imprevisto durante la preparazione del caricamento — riprova." }, { status: 500 });
  }

  return NextResponse.json({ percorso: data.path, token: data.token });
}
