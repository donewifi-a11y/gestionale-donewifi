/**
 * ★ NUOVA (2026-09-17, code review approfondita) — `new Date().setHours(0,0,0,0)`
 * o `new Date().toISOString().slice(0,10)` calcolano "oggi" nel fuso orario
 * DEL PROCESSO che esegue il codice, non in quello dell'utente. Su Vercel il
 * processo gira in UTC (nessuna variabile `TZ` impostata), mentre lo staff è
 * in Italia (UTC+1 CET / UTC+2 CEST): per circa 1-2 ore ogni notte, subito
 * dopo la mezzanotte italiana, il calendario UTC è ancora fermo al giorno
 * prima — "completati oggi", "appuntamenti di oggi" e simili risultavano
 * vuoti o sbagliati in quella finestra, un bug reale anche se raro da notare
 * (nessuno guarda la Dashboard a mezzanotte e mezza). Bug innocuo nei
 * componenti "use client" (girano nel browser dello staff, già in orario
 * italiano) — riguarda solo il codice eseguito lato server (Server
 * Component, Server Action, API route).
 *
 * Calcola l'inizio/fine della giornata di calendario italiana come istante
 * UTC reale, indipendentemente dal fuso del processo che esegue il codice.
 */
const FUSO_ITALIA = "Europe/Rome";

export function inizioGiornataItalia(offsetGiorni = 0, ora: number = Date.now()): Date {
  const riferimento = new Date(ora + offsetGiorni * 86400000);
  const dataItalia = riferimento.toLocaleDateString("en-CA", { timeZone: FUSO_ITALIA });
  const candidato = new Date(`${dataItalia}T00:00:00.000Z`);
  // ★ candidato è mezzanotte UTC di quella data — l'ora che l'Italia vede in
  // quell'istante (1 o 2, a seconda dell'ora legale) è esattamente lo
  // scarto da sottrarre per ottenere la vera mezzanotte italiana in UTC.
  const oraItalia = Number(new Intl.DateTimeFormat("en-GB", { timeZone: FUSO_ITALIA, hour: "2-digit", hourCycle: "h23" }).format(candidato));
  candidato.setUTCHours(candidato.getUTCHours() - oraItalia);
  return candidato;
}

export function fineGiornataItalia(offsetGiorni = 0, ora: number = Date.now()): Date {
  return new Date(inizioGiornataItalia(offsetGiorni + 1, ora).getTime() - 1);
}

/** Data odierna (o traslata di `offsetGiorni`) come "YYYY-MM-DD" nel calendario italiano. */
export function dataItaliaStringa(offsetGiorni = 0, ora: number = Date.now()): string {
  return new Date(ora + offsetGiorni * 86400000).toLocaleDateString("en-CA", { timeZone: FUSO_ITALIA });
}
