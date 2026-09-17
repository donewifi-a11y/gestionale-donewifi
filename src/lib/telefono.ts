/**
 * ★ ESTRATTO (2026-09-17, code review approfondita) — la stessa identica
 * espressione (numero italiano, con o senza prefisso, in formato
 * internazionale per un link `wa.me`) era duplicata in 3 componenti
 * (vista-tecnico-board, segnalazioni-board, condivisi/invio-link) — estratta
 * qui invece di continuare a copiarla una quarta volta.
 */
export function telefonoIntl(telefono: string | null | undefined): string {
  if (!telefono) return "";
  return "39" + telefono.replace(/\D/g, "").replace(/^0?39/, "").replace(/^0/, "");
}
