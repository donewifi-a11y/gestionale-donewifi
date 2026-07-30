import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verificaRichiestaCron } from "@/lib/cron";

const GIORNI_CONSERVAZIONE = 30;

// ★ ex pulisciDocumentiClientiScaduti() del vecchio gestionale (trigger
// notturno) — coerente con l'Informativa Privacy (/privacy, sezione 4):
// i documenti caricati dai clienti vengono eliminati 30 giorni dopo
// l'invio, la riga della richiesta resta come traccia storica ma senza
// più i file allegati.
export async function GET(request: NextRequest) {
  const nonAutorizzato = verificaRichiestaCron(request);
  if (nonAutorizzato) return nonAutorizzato;

  const supabase = createServiceClient();
  const sogliaIso = new Date(Date.now() - GIORNI_CONSERVAZIONE * 24 * 60 * 60 * 1000).toISOString();

  const { data: righe, error } = await supabase
    .from("richieste_clienti")
    .select("id, documenti")
    .lt("data", sogliaIso)
    .neq("documenti", "[]");

  if (error) return NextResponse.json({ errore: error.message }, { status: 500 });

  let fileEliminati = 0;
  for (const riga of righe ?? []) {
    const documenti = (riga.documenti as { nome: string; percorso: string }[]) || [];
    if (documenti.length === 0) continue;

    const percorsi = documenti.map((d) => d.percorso);
    const { error: erroreStorage } = await supabase.storage.from("documenti").remove(percorsi);
    if (erroreStorage) continue; // non blocca le righe successive

    await supabase.from("richieste_clienti").update({ documenti: [] }).eq("id", riga.id);
    fileEliminati += percorsi.length;
  }

  return NextResponse.json({ ok: true, richiesteProcessate: righe?.length ?? 0, fileEliminati });
}
