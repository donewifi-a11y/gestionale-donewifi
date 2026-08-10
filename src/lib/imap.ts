import { ImapFlow } from "imapflow";
import { createServiceClient } from "@/lib/supabase/server";
import { inviaMessaggioChatSistema } from "@/lib/chat";
import type { AreaAccesso } from "@/lib/types";

// ★ stesse caselle/credenziali già usate in outbound (src/lib/email.ts) —
// IMAP e SMTP sono lo stesso account di posta, nessun segreto nuovo da
// configurare oltre a quelli già in uso per l'invio.
const CASELLE_REPARTI_IMAP: Partial<Record<AreaAccesso, { envUser: string; envPass: string }>> = {
  "Analisi Rete": { envUser: "SMTP_USER_ANALISI_RETE", envPass: "SMTP_PASS_ANALISI_RETE" },
  Commerciale: { envUser: "SMTP_USER_COMMERCIALE", envPass: "SMTP_PASS_COMMERCIALE" },
  Fatturazione: { envUser: "SMTP_USER_FATTURAZIONE", envPass: "SMTP_PASS_FATTURAZIONE" },
};

const HOST = process.env.IMAP_HOST || "imaps.aruba.it";
const PORT = Number(process.env.IMAP_PORT || 993);

/**
 * Controlla una casella per email arrivate dall'ultimo controllo (per UID,
 * non per flag "letto": una risposta già aperta da webmail prima del nostro
 * passaggio non deve sfuggire alla notifica) e avvisa il reparto in Chat
 * per ciascuna. Al primo avvio per una casella memorizza solo la posizione
 * attuale invece di notificare l'intera cronologia esistente. Non lancia
 * mai un errore verso il chiamante — una casella non configurata o
 * irraggiungibile non deve bloccare il controllo delle altre due (stesso
 * principio di inviaNotificaTelegram()/inviaEmail()).
 */
export async function controllaNuoveEmail(reparto: AreaAccesso): Promise<{ nuove: number; errore?: string }> {
  const casella = CASELLE_REPARTI_IMAP[reparto];
  if (!casella) return { nuove: 0 };
  const user = process.env[casella.envUser];
  const pass = process.env[casella.envPass];
  if (!user || !pass) return { nuove: 0 };

  const service = createServiceClient();
  const { data: stato } = await service
    .from("imap_controllo_email")
    .select("ultimo_uid")
    .eq("reparto", reparto)
    .maybeSingle();
  const ultimoUid = stato?.ultimo_uid ?? 0;

  const client = new ImapFlow({ host: HOST, port: PORT, secure: true, auth: { user, pass }, logger: false });
  let nuove = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uidNextAttuale = client.mailbox && typeof client.mailbox === "object" ? client.mailbox.uidNext : undefined;
      const uidMassimoAttuale = uidNextAttuale ? uidNextAttuale - 1 : 0;

      if (ultimoUid === 0) {
        // ★ primo avvio per questa casella: solo la posizione, niente notifiche sulla cronologia già esistente.
        if (uidMassimoAttuale > 0) {
          await service
            .from("imap_controllo_email")
            .upsert({ reparto, ultimo_uid: uidMassimoAttuale, ultimo_controllo_il: new Date().toISOString() });
        }
      } else if (uidMassimoAttuale > ultimoUid) {
        let uidMassimoVisto = ultimoUid;
        for await (const messaggio of client.fetch(`${ultimoUid + 1}:*`, { envelope: true, uid: true })) {
          if (messaggio.uid <= ultimoUid) continue;
          uidMassimoVisto = Math.max(uidMassimoVisto, messaggio.uid);
          const mittente = messaggio.envelope?.from?.[0];
          const nomeMittente = mittente?.name || mittente?.address || "mittente sconosciuto";
          const oggetto = messaggio.envelope?.subject || "(nessun oggetto)";
          nuove++;
          await inviaMessaggioChatSistema(reparto, `📩 Nuova email da ${nomeMittente}: "${oggetto}"`);
        }
        if (uidMassimoVisto > ultimoUid) {
          await service
            .from("imap_controllo_email")
            .upsert({ reparto, ultimo_uid: uidMassimoVisto, ultimo_controllo_il: new Date().toISOString() });
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    return { nuove: 0, errore: err instanceof Error ? err.message : "Errore imprevisto IMAP." };
  }

  return { nuove };
}

export async function controllaTutteLeCaselle(): Promise<Record<string, { nuove: number; errore?: string }>> {
  const risultati: Record<string, { nuove: number; errore?: string }> = {};
  for (const reparto of Object.keys(CASELLE_REPARTI_IMAP) as AreaAccesso[]) {
    risultati[reparto] = await controllaNuoveEmail(reparto);
  }
  return risultati;
}
