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
    let risposta = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: messaggio, parse_mode: "HTML" }),
    });

    // ★ FIX (2026-08-27, trovato in un giro di test pre-lancio) — nessuno
    // dei tanti punti che compongono `messaggio` fa l'escape di `<`/`>`/`&`
    // prima di inserirci un nome/comune/problema scritto dal cliente:
    // Telegram, con `parse_mode: "HTML"`, RIFIUTA l'intero messaggio se
    // contiene HTML non valido (es. un cliente che scrive "Costo & IVA" o
    // "test <3" nel proprio nome) — la notifica spariva in silenzio, senza
    // che nessuno se ne accorgesse (Chat interna ed Email, senza questo
    // vincolo, arrivavano comunque, mascherando il problema). Fare
    // l'escape "a mano" in ogni punto che compone un messaggio (una
    // dozzina di file, sparsi) sarebbe stato facile da dimenticare in un
    // punto futuro — qui invece, un solo ripiego per tutti: se Telegram
    // rifiuta per un errore di parsing delle entità HTML, si riprova UNA
    // volta in testo semplice (niente più `<b>` in grassetto per quel
    // messaggio, ma la notifica arriva comunque invece di sparire).
    if (!risposta.ok && risposta.status === 400) {
      const corpoErrore = await risposta.text();
      if (/can't parse entities/i.test(corpoErrore)) {
        risposta = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: messaggio.replace(/<\/?[a-z][^>]*>/gi, "") }),
        });
      } else {
        await registraEsitoIntegrazione("telegram", "errore", `${reparto}: HTTP 400 — ${corpoErrore.slice(0, 200)}`);
        return;
      }
    }

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
