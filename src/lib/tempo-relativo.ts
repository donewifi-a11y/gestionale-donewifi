/**
 * ★ NUOVA (2026-09-17, richiesta esplicita: "le card Kanban devono mostrare
 * esclusivamente nome, un'etichetta di stato e l'ultimo aggiornamento") —
 * data di aggiornamento in forma breve e leggibile a colpo d'occhio, per le
 * card Ticket/Segnalazioni: "agg. 5 min fa" pesa meno sulla card di una
 * data completa, ma dice comunque se una pratica è ferma da tempo.
 */
export function tempoRelativo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minuti = Math.floor(diffMs / 60000);
  if (minuti < 1) return "ora";
  if (minuti < 60) return `${minuti} min fa`;
  const ore = Math.floor(minuti / 60);
  if (ore < 24) return `${ore}h fa`;
  const giorni = Math.floor(ore / 24);
  if (giorni < 7) return `${giorni}g fa`;
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}
