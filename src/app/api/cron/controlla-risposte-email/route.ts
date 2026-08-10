import { NextResponse, type NextRequest } from "next/server";
import { verificaRichiestaCron } from "@/lib/cron";
import { controllaTutteLeCaselle } from "@/lib/imap";

// ★ NUOVA — a differenza degli altri /api/cron di questo progetto, questa
// route non è nel Cron nativo di Vercel (piano Hobby, limite 2 cron job già
// occupati): va richiamata da un servizio esterno (es. cron-job.org) ogni
// pochi minuti, con lo stesso header "Authorization: Bearer $CRON_SECRET"
// che Vercel manda in automatico alle proprie — verificaRichiestaCron() è
// lo stesso identico controllo, nessun secret nuovo da gestire.
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const nonAutorizzato = verificaRichiestaCron(request);
  if (nonAutorizzato) return nonAutorizzato;

  const risultati = await controllaTutteLeCaselle();
  return NextResponse.json({ ok: true, risultati });
}
