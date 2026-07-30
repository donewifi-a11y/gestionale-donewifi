// ★ ex _inviaEmailChiusura() del vecchio gestionale — qui via Resend (API
// diretta via fetch, nessuna libreria in più). Come Telegram e Google
// Calendar: se RESEND_API_KEY non è configurata, l'invio viene saltato
// silenziosamente, il resto del gestionale funziona lo stesso.
export async function inviaEmail(a: { a: string; oggetto: string; corpoHtml: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const mittente = process.env.RESEND_MITTENTE || "Done Wifi <notifiche@donewifi.it>";
  if (!apiKey || !a.a) return;

  try {
    await fetch("https://api.resend.com/emails", {
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
  } catch {
    // invio perso, non bloccante — stesso principio già usato per Telegram.
  }
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
