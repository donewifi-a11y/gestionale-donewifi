import { NextResponse, type NextRequest } from "next/server";

// ★ Le route sotto /api/cron sono chiamate solo da Vercel Cron (vedi
// vercel.json), mai da un browser: Vercel firma la richiesta con questo
// header quando CRON_SECRET è configurato — senza corrispondenza, 401.
export function verificaRichiestaCron(request: NextRequest): NextResponse | null {
  const segreto = process.env.CRON_SECRET;
  if (!segreto) {
    // ★ FIX — "nessun secret configurato" tornava sempre "consentito", comodo
    // in sviluppo ma pericoloso in produzione: se CRON_SECRET non fosse
    // impostato su Vercel, chiunque conoscesse l'URL potrebbe richiamare
    // pulizia-documenti (cancella allegati clienti) o promemoria-ticket
    // (spam Telegram) semplicemente visitando il link. In produzione, un
    // secret mancante ora blocca la richiesta invece di lasciarla passare;
    // resta permissivo solo in sviluppo locale, dove CRON_SECRET normalmente
    // non è impostato.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ errore: "CRON_SECRET non configurato: rotta cron disabilitata." }, { status: 401 });
    }
    return null;
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${segreto}`) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }
  return null;
}
