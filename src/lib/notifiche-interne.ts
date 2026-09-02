import { inviaNotificaTelegram } from "@/lib/telegram";
import { inviaMessaggioChatSistema } from "@/lib/chat";
import { inviaEmail, emailAvvisoInterno } from "@/lib/email";
import type { AreaAccesso } from "@/lib/types";

// ★ NUOVA (2026-08-27, richiesta esplicita: "inserisci lo stesso sistema
// di notifica adoperato per documentazione ricevuta in segnalazione in
// tutte le zone dove arrivano nuove notifiche" — Proposta A dell'artifact
// "Estensione Notifiche", scelta senza eccezioni) — prima ogni punto che
// notificava un evento lo faceva scrivendo a mano le stesse 3 chiamate in
// sequenza (Telegram, Chat, Email — vedi api/richiesta-dati/route.ts, il
// modello preso a riferimento), ognuna con la propria variante di
// formattazione: comodo da leggere lì una volta, ma vent'anni di copia-
// incolla in più punti diversi col rischio di dimenticarne uno o
// scriverlo in modo leggermente diverso. Un'unica funzione condivisa,
// usata per ogni nuovo punto di copertura aggiunto in questo giro — i due
// punti già "gold standard" (Richiesta Dati, Richiesta Cliente) restano
// scritti a mano come prima: già corretti, cambiarli non aggiunge nulla e
// rischia solo una regressione in codice che funziona.
export interface NotificaInterna {
  reparto: AreaAccesso;
  /** HTML — Telegram legge un sottoinsieme di tag (<b>, ecc.). */
  telegramHtml: string;
  chatTesto: string;
  emailTitolo: string;
  emailCorpoHtml: string;
  emailCorpoTesto: string;
  emailLink: string;
}

/** Manda lo stesso evento sui 3 canali (Telegram + Chat interna + Email
 * verso attivazioni@donewifi.it) — nessuno dei tre blocca gli altri né il
 * chiamante: ogni funzione sottostante già non lancia mai un errore
 * (stesso principio ovunque nel gestionale, una notifica mancata non deve
 * mai bloccare il flusso principale). */
export async function notificaSuTuttiICanali(n: NotificaInterna): Promise<void> {
  const { oggetto, corpoHtml, corpoTesto } = emailAvvisoInterno(n.emailTitolo, n.emailCorpoHtml, n.emailCorpoTesto, n.emailLink);
  // ★ FIX (2026-09-02, "di nuovo il problema" — "Errore imprevisto durante
  // il salvataggio" riproducibile per una Nuova installazione via pose,
  // anche da browser mai aperti prima) — i 3 canali sono indipendenti (nessuno
  // aspetta l'esito degli altri) ma venivano comunque eseguiti in sequenza:
  // 3 chiamate di rete una dopo l'altra (Telegram, poi Chat, poi SMTP) invece
  // che in parallelo, su ogni singolo punto che chiama questa funzione — con
  // più punti in fila nello stesso salvataggio (es. notificaGestionaleAntenne
  // + l'email di chiusura al cliente), il tempo si sommava fino a superare
  // il timeout di default di una funzione serverless. `Promise.all` invece
  // di 3 `await` in fila non cambia il comportamento (nessuno dei tre lancia
  // mai un errore, vedi sopra) ma dimezza abbondantemente il tempo reale.
  await Promise.all([
    inviaNotificaTelegram(n.reparto, n.telegramHtml),
    inviaMessaggioChatSistema(n.reparto, n.chatTesto),
    inviaEmail({ a: "attivazioni@donewifi.it", oggetto, corpoHtml, corpoTesto, reparto: n.reparto }),
  ]);
}
