import type { AreaAccesso } from "@/lib/types";

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
  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: messaggio, parse_mode: "HTML" }),
    });
  } catch {
    // notifica persa, non bloccante — l'operatore vede comunque i dati nel gestionale.
  }
}
