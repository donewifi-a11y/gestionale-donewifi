import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente } from "@/lib/persona";

/**
 * ★ NUOVA (2026-09, "il contratto nuovo approvato solo da nuovo" — vedi
 * l'artifact "Il Subentro Fino all'Installazione") — a differenza di
 * caricaContrattoSegnalazione() (tickets/segnalazioni/actions.ts, ancora
 * con un `File` dentro il corpo di una Server Action), questa parte nuova
 * segue fin da subito lo schema ormai consolidato in questo gestionale:
 * il file si carica dal browser direttamente allo storage, la Server
 * Action riceve solo il percorso già scritto — mai il limite di 1MB sul
 * corpo di una Server Action, trovato e corretto altrove più volte.
 */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => ({}) as Record<string, unknown>);
  const praticaId = String(corpo.praticaId || "");
  const nomeFile = String(corpo.nomeFile || "");
  if (!praticaId || !nomeFile) return NextResponse.json({ errore: "Richiesta non valida." }, { status: 400 });

  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });

  const service = createServiceClient();
  const percorso = `contratti/subentro-${praticaId}-${Date.now()}-${nomeFile}`;
  const { data, error } = await service.storage.from("documenti").createSignedUploadUrl(percorso);
  if (error || !data) {
    console.error("api/richieste-clienti/upload-contratto-url:", error?.message);
    return NextResponse.json({ errore: "Errore imprevisto durante la preparazione del caricamento — riprova." }, { status: 500 });
  }

  return NextResponse.json({ percorso: data.path, token: data.token });
}
