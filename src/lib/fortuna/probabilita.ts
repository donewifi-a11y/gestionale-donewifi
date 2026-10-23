// ★ NUOVA — specchio in TypeScript della funzione SQL fortuna_probabilita() (progetto Fortuna), usato
// dall'editor dei prodotti per mostrare in tempo reale «Uscirà nel X% dei casi». La fonte di verità resta
// l'SQL: se cambia una, cambia anche l'altra (c'è un test che le confronta, vedi README del modulo).
// Nessun import: deve restare puro, così si può eseguire anche da riga di comando nei test.

export type ModalitaPremio = "percentuale" | "pezzi";

export interface PremioPerProbabilita {
  chiave: string;
  modalita: ModalitaPremio;
  /** Percentuale scelta dall'admin (solo modalità «percentuale»). */
  percentuale: number;
  /** Quantità totale: obbligatoria per «pezzi», facoltativa (null = illimitata) per «percentuale». */
  quantita: number | null;
  /** Pezzi ancora disponibili dopo il salvataggio (null = illimitata). */
  rimanenti: number | null;
}

export interface EsitoProbabilita {
  /** Probabilità (0-1) di ogni premio ancora in gara; i premi fuori gara non compaiono. */
  perPremio: Map<string, number>;
  /** Somma delle probabilità: sotto 1 significa che una parte dei giocatori non riceve nessun premio. */
  somma: number;
  /** I pezzi, da soli, superano i partecipanti previsti (e vengono riproporzionati tra loro). */
  pezziEccedenti: boolean;
}

/**
 * - pezzi in gara (pezzi rimasti > 0): p = quantita / partecipanti previsti (se la somma supera 1 si riproporzionano);
 * - prodotti a percentuale in gara (percentuale > 0, scorta illimitata o non finita): si dividono la quota che resta
 *   (1 − somma dei pezzi) in proporzione alle loro percentuali.
 */
export function calcolaProbabilita(premi: PremioPerProbabilita[], previsti: number | null): EsitoProbabilita {
  const n = previsti && previsti > 0 ? previsti : 0;
  const pezzi = premi.filter((p) => p.modalita === "pezzi" && n > 0 && (p.rimanenti ?? 0) > 0 && (p.quantita ?? 0) > 0);
  const percentuali = premi.filter((p) => p.modalita === "percentuale" && p.percentuale > 0 && (p.rimanenti === null || p.rimanenti > 0));

  const totPezzi = pezzi.reduce((s, p) => s + (p.quantita as number) / n, 0);
  const totPerc = percentuali.reduce((s, p) => s + p.percentuale, 0);

  const perPremio = new Map<string, number>();
  for (const p of pezzi) perPremio.set(p.chiave, (p.quantita as number) / n / Math.max(1, totPezzi));
  if (totPerc > 0) {
    for (const p of percentuali) perPremio.set(p.chiave, (Math.max(0, 1 - totPezzi) * p.percentuale) / totPerc);
  }

  let somma = 0;
  for (const v of perPremio.values()) somma += v;
  return { perPremio, somma, pezziEccedenti: totPezzi > 1 };
}
