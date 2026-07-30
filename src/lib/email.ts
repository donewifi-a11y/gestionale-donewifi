import type { AreaAccesso } from "@/lib/types";

// ★ ex EMAIL_MITTENTE_REPARTI del vecchio gestionale (Gmail "Invia
// messaggi come") — qui lo stesso principio: l'email che il cliente
// riceve arriva dall'indirizzo del reparto competente, non da un mittente
// generico, così il cliente sa subito chi gli sta scrivendo.
const EMAIL_MITTENTE_REPARTI: Partial<Record<AreaAccesso, string>> = {
  "Analisi Rete": "Done Wifi Assistenza <assistenza@donewifi.it>",
  Commerciale: "Done Wifi Commerciale <commerciale@donewifi.it>",
  Fatturazione: "Done Wifi <servizioclienti@donewifi.it>",
};

export function mittenteReparto(reparto?: AreaAccesso): string | undefined {
  return reparto ? EMAIL_MITTENTE_REPARTI[reparto] : undefined;
}

// ★ ex _inviaEmailChiusura() del vecchio gestionale — qui via Resend (API
// diretta via fetch, nessuna libreria in più). Come Telegram e Google
// Calendar: se RESEND_API_KEY non è configurata, l'invio viene saltato
// silenziosamente, il resto del gestionale funziona lo stesso.
export async function inviaEmail(a: { a: string; oggetto: string; corpoHtml: string; mittente?: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const mittente = a.mittente || process.env.RESEND_MITTENTE || "Done Wifi <notifiche@donewifi.it>";
  if (!apiKey || !a.a) return { errore: "Invio email non configurato (RESEND_API_KEY mancante)." };

  try {
    const risposta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: mittente,
        to: [a.a],
        subject: a.oggetto,
        html: a.corpoHtml,
      }),
    });
    if (!risposta.ok) {
      const corpo = await risposta.text();
      return { errore: `Resend ha rifiutato l'invio: ${corpo}` };
    }
    return { errore: null };
  } catch (err) {
    return { errore: err instanceof Error ? err.message : "Errore imprevisto nell'invio email." };
  }
}

export function emailApprovazioneIntervento(cliente: string, numero: number, link: string) {
  return {
    oggetto: `Done Wifi — Conferma Intervento (Ticket #${numero})`,
    corpoHtml: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#0B1B3D;">Done Wifi — Conferma Intervento</h2>
        <p>Gentile ${cliente},</p>
        <p>Ti confermiamo che l'intervento relativo al tuo Ticket #${numero} è stato completato da remoto.</p>
        <p>Per confermare che tutto funzioni correttamente, clicca sul link qui sotto:</p>
        <p><a href="${link}" style="display:inline-block;background:#2A5FA8;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;">Conferma intervento</a></p>
        <p>Se hai ancora problemi, rispondi a questa email o scrivi a <b>servizioclienti@donewifi.it</b>.</p>
        <p>Grazie,<br>Done Wifi</p>
      </div>
    `,
  };
}

export function emailRichiestaDatiSegnalazione(nome: string, link: string) {
  return {
    oggetto: "Done Wifi — completa i tuoi dati",
    corpoHtml: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <p>Ciao ${nome},</p>
        <p>Per completare la tua richiesta Done Wifi inserisci qui i tuoi dati:</p>
        <p><a href="${link}" style="display:inline-block;background:#2A5FA8;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;">Completa i dati</a></p>
        <p>Grazie,<br>Done Wifi</p>
      </div>
    `,
  };
}

export function emailChiusuraTicket(cliente: string, numero: number) {
  return {
    oggetto: `Done Wifi — Intervento completato (Ticket #${numero})`,
    corpoHtml: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <p>Ciao ${cliente},</p>
        <p>Ti confermiamo che il tuo intervento (Ticket #${numero}) è stato completato.</p>
        <p>Per qualsiasi necessità, rispondi a questa email o scrivi a <b>servizioclienti@donewifi.it</b>.</p>
        <p>Grazie,<br>Done Wifi</p>
      </div>
    `,
  };
}
