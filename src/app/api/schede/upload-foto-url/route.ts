import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";

/**
 * ★ NUOVA (2026-09-10, richiesta esplicita: "avrei bisogno di poter
 * cancellare o modificare le foto anche successivamente") — prima le foto
 * di una Scheda erano fissate al momento del salvataggio (nessun modo di
 * aggiungerne una dopo, es. per sostituire una foto sfocata). Stesso
 * schema ormai consolidato (signed upload URL, mai un file nel corpo di
 * una Server Action) già in uso per `caricaFotoScheda()`/
 * api/pose/upload-scheda — quella rotta però richiede una sessione pose
 * (tecnico esterno), qui invece serve l'accesso interno (Ticket/Archivio),
 * da cui la rotta dedicata invece di riusare quella.
 */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => ({}) as Record<string, unknown>);
  const appuntamentoId = String(corpo.appuntamentoId || "");
  const nomeFile = String(corpo.nomeFile || "");
  if (!appuntamentoId || !nomeFile) return NextResponse.json({ errore: "Richiesta non valida." }, { status: 400 });

  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return NextResponse.json({ errore: "Non autenticato." }, { status: 401 });
  if (!personaHaAccessoAdmin(persona)) return NextResponse.json({ errore: "Solo un amministratore può modificare le foto di una Scheda già salvata." }, { status: 403 });

  const service = createServiceClient();
  // ★ stesso percorso "schede/<appuntamentoId>/..." già usato da
  // caricaFotoScheda() — una foto aggiunta dopo finisce nella stessa
  // cartella di quelle originali, non in un posto a parte.
  const percorso = `schede/${appuntamentoId}/${Date.now()}-${nomeFile}`;
  const { data, error } = await service.storage.from("documenti").createSignedUploadUrl(percorso);
  if (error || !data) {
    console.error("api/schede/upload-foto-url:", error?.message);
    return NextResponse.json({ errore: "Errore imprevisto durante la preparazione del caricamento — riprova." }, { status: 500 });
  }

  return NextResponse.json({ percorso: data.path, token: data.token });
}
