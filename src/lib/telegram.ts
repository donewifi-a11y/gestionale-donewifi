import type { AreaAccesso } from "@/lib/types";
import { registraEsitoIntegrazione } from "@/lib/integrazioni-log";

// ★ stessi Chat ID del vecchio gestionale Apps Script (CHAT_ID_REPARTI in
// Codice.js) — non sono un segreto, restano hardcoded come lo erano lì;
// solo il token del bot è una variabile d'ambiente.
const CHAT_ID_REPARTI: Partial<Record<AreaAccesso, string>> = {
  "Analisi Rete": "-5466264894",
  Commerciale: "-5395984552",
  Fatturazione: "-5453868665",
};

/**
 * Invia un messaggio al gruppo Telegram del reparto indicato. Non lancia
 * mai un errore verso il chiamante: una notifica mancata non deve mai
 * bloccare il flusso principale (stesso principio del vecchio sistema).
 */
export async function inviaNotificaTelegram(reparto: AreaAccesso, messaggio: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = CHAT_ID_REPARTI[reparto];
  if (!token || !chatId) {
    await registraEsitoIntegrazione("telegram", "errore", `${reparto}: token/chat ID non configurati.`);
    return;
  }

  try {
    // ★ FIX — il risultato di fetch() non veniva mai controllato: un
    // token scaduto/bot rimosso dal gruppo torna comunque una risposta
    // HTTP (200 o 4xx con corpo JSON "ok: false"), non un'eccezione, quindi
    // veniva trattato come invio riuscito senza che nessuno se ne accorgesse.
    const risposta = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: messaggio, parse_mode: "HTML" }),
    });
    if (!risposta.ok) {
      const corpo = await risposta.text();
      await registraEsitoIntegrazione("telegram", "errore", `${reparto}: HTTP ${risposta.status} — ${corpo.slice(0, 200)}`);
      return;
    }
    await registraEsitoIntegrazione("telegram", "ok", reparto);
  } catch (err) {
    // notifica persa, non bloccante — l'operatore vede comunque i dati nel gestionale.
    await registraEsitoIntegrazione("telegram", "errore", `${reparto}: ${err instanceof Error ? err.message : "errore imprevisto"}`);
  }
}
