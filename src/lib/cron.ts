import { NextResponse, type NextRequest } from "next/server";

// ★ Le route sotto /api/cron sono chiamate solo da Vercel Cron (vedi
// vercel.json), mai da un browser: Vercel firma la richiesta con questo
// header quando CRON_SECRET è configurato — senza corrispondenza, 401.
export function verificaRichiestaCron(request: NextRequest): NextResponse | null {
  const segreto = process.env.CRON_SECRET;
  if (!segreto) return null; // nessun secret configurato: consentito (comodo in sviluppo)
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }
  return null;
}
