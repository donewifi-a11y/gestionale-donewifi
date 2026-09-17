import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";

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
  // ★ FIX (2026-09-17, code review approfondita) — confronto diretto con
  // "!==" invece di un confronto a tempo costante, incoerente con lo
  // standard già in uso altrove nel progetto (vedi tecnico-esterno.ts,
  // verificaFirma). Basso rischio pratico (il secret non varia per
  // carattere osservabile da qui), ma un attaccante con accesso alla rete
  // interna/timing potrebbe in teoria dedurre il secret carattere per
  // carattere dai tempi di risposta di un confronto stringa non costante.
  const auth = request.headers.get("authorization") ?? "";
  const atteso = `Bearer ${segreto}`;
  const bufferAuth = Buffer.from(auth);
  const bufferAtteso = Buffer.from(atteso);
  const valido = bufferAuth.length === bufferAtteso.length && timingSafeEqual(bufferAuth, bufferAtteso);
  if (!valido) {
    return NextResponse.json({ errore: "Non autorizzato." }, { status: 401 });
  }
  return null;
}
