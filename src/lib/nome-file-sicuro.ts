/**
 * ★ ESTRATTO (2026-09-17, code review approfondita) — la sanificazione del
 * nome file era duplicata identica in 2 delle 7 rotte "upload-url" del
 * progetto (chat, tickets) ma dimenticata nelle altre 5 (richiesta-dati,
 * richiesta-cliente, richieste-clienti/upload-contratto, schede/upload-foto,
 * pose/upload-scheda): un nome con spazi, accenti o altri caratteri non
 * ASCII (es. "Carta d'identità.jpg", comunissimo su un documento reale)
 * poteva far fallire l'upload firmato verso Supabase Storage a seconda del
 * client. Estratta qui invece di duplicarla una terza volta, così un domani
 * un ottavo endpoint la riusa senza reinventarla (o dimenticarla).
 */
export function nomeFileSicuro(nomeFile: string): string {
  return nomeFile.normalize("NFKD").replace(/[^\w.-]+/g, "_");
}
