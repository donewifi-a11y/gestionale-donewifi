import nodemailer from "nodemailer";
import type { AreaAccesso } from "@/lib/types";
import { registraEsitoIntegrazione } from "@/lib/integrazioni-log";

// ★ ex EMAIL_MITTENTE_REPARTI del vecchio gestionale (Gmail "Invia
// messaggi come") — qui lo stesso principio ma via le caselle Aruba vere
// e proprie (SMTP, non l'API Resend): ogni reparto ha una propria casella
// con le proprie credenziali, quindi il cliente riceve davvero da
// quell'indirizzo, non da un mittente generico "spoofato".
const CASELLE_REPARTI: Partial<Record<AreaAccesso, { nome: string; envUser: string; envPass: string }>> = {
  "Analisi Rete": { nome: "Done Wifi Assistenza", envUser: "SMTP_USER_ANALISI_RETE", envPass: "SMTP_PASS_ANALISI_RETE" },
  Commerciale: { nome: "Done Wifi Commerciale", envUser: "SMTP_USER_COMMERCIALE", envPass: "SMTP_PASS_COMMERCIALE" },
  Fatturazione: { nome: "Done Wifi", envUser: "SMTP_USER_FATTURAZIONE", envPass: "SMTP_PASS_FATTURAZIONE" },
};

function transporter(user: string, pass: string) {
  const host = process.env.SMTP_HOST || "smtps.aruba.it";
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

interface CredenzialiCasella {
  mittente: string;
  user: string;
  pass: string;
}

/** Credenziali della casella del reparto — o della casella di default (SMTP_USER/SMTP_PASS) se il reparto non ne ha una propria o non è specificato. */
function credenzialiReparto(reparto?: AreaAccesso): CredenzialiCasella | null {
  const casella = reparto ? CASELLE_REPARTI[reparto] : undefined;
  const user = (casella ? process.env[casella.envUser] : undefined) || process.env.SMTP_USER;
  const pass = (casella ? process.env[casella.envPass] : undefined) || process.env.SMTP_PASS;
  if (!user || !pass) return null;
  const nome = casella?.nome || "Done Wifi";
  return { mittente: `"${nome}" <${user}>`, user, pass };
}

// ★ ex _inviaEmailChiusura() del vecchio gestionale — qui via SMTP Aruba
// (nodemailer) invece di Resend: nessuna API esterna, usa direttamente le
// caselle email aziendali già esistenti. Come Telegram e Google Calendar:
// se le credenziali della casella non sono configurate, l'invio viene
// segnalato come errore ma non blocca mai il resto del gestionale.
export async function inviaEmail(a: { a: string; oggetto: string; corpoHtml: string; reparto?: AreaAccesso }) {
  if (!a.a) return { errore: "Nessun indirizzo destinatario." };

  const credenziali = credenzialiReparto(a.reparto);
  if (!credenziali) {
    const errore = "Invio email non configurato (credenziali SMTP mancanti per questa casella).";
    await registraEsitoIntegrazione("email", "errore", `${a.reparto ?? "default"}: ${errore}`);
    return { errore };
  }

  try {
    const t = transporter(credenziali.user, credenziali.pass);
    await t.sendMail({
      from: credenziali.mittente,
      to: a.a,
      subject: a.oggetto,
      html: a.corpoHtml,
    });
    await registraEsitoIntegrazione("email", "ok", `${a.reparto ?? "default"} → ${a.a}`);
    return { errore: null };
  } catch (err) {
    const errore = err instanceof Error ? err.message : "Errore imprevisto nell'invio email.";
    await registraEsitoIntegrazione("email", "errore", `${a.reparto ?? "default"} → ${a.a}: ${errore}`);
    return { errore };
  }
}

export function emailApprovazioneIntervento(cliente: string, numero: number, link: string) {
  return {
    oggetto: `Done Wifi — Conferma Intervento (Ticket #${numero})`,
    corpoHtml: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#141414;">Done Wifi — Conferma Intervento</h2>
        <p>Gentile ${cliente},</p>
        <p>Ti confermiamo che l'intervento relativo al tuo Ticket #${numero} è stato completato da remoto.</p>
        <p>Per confermare che tutto funzioni correttamente, clicca sul link qui sotto:</p>
        <p><a href="${link}" style="display:inline-block;background:#CF000A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;">Conferma intervento</a></p>
        <p>Se hai ancora problemi, rispondi a questa email o scrivi a <b>servizioclienti@donewifi.it</b>.</p>
        <p>Grazie,<br>Done Wifi</p>
      </div>
    `,
  };
}

export function emailApprovazioneContratto(cliente: string, numero: number, link: string) {
  return {
    oggetto: `Done Wifi — Il tuo contratto è pronto (Pratica #${numero})`,
    corpoHtml: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#141414;">Done Wifi — Il tuo contratto è pronto</h2>
        <p>Gentile ${cliente},</p>
        <p>Abbiamo preparato il contratto relativo alla tua pratica #${numero}. Prima di procedere con l'installazione, ti chiediamo di leggerlo e confermarne l'approvazione.</p>
        <p><a href="${link}" style="display:inline-block;background:#CF000A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;">Vedi e approva il contratto</a></p>
        <p>Per qualsiasi domanda, rispondi a questa email o scrivi a <b>commerciale@donewifi.it</b>.</p>
        <p>Grazie,<br>Done Wifi</p>
      </div>
    `,
  };
}

export function emailPreventivo(cliente: string, numero: number, totale: string, link: string) {
  return {
    oggetto: `Done Wifi — Il tuo preventivo (#${numero})`,
    corpoHtml: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#141414;">Done Wifi — Il tuo preventivo</h2>
        <p>Gentile ${cliente},</p>
        <p>Abbiamo preparato un preventivo per te (totale <b>${totale}</b>). Puoi vederlo nel dettaglio e scegliere se approvarlo direttamente da qui:</p>
        <p><a href="${link}" style="display:inline-block;background:#CF000A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;">Vedi il preventivo</a></p>
        <p>Per qualsiasi domanda, rispondi a questa email o scrivi a <b>commerciale@donewifi.it</b>.</p>
        <p>Grazie,<br>Done Wifi</p>
      </div>
    `,
  };
}

// ★ NUOVA — FIX: il pulsante "Email" del pannello "Invia una pratica al
// cliente" (Trasferimento/Subentro/Cambio IBAN/Cambio Anagrafica/Disdetta,
// vedi InvioLinkCliente) apriva il client di posta locale dell'operatore
// (mailto:) invece di inviare davvero dalla casella del reparto competente
// — a differenza di Richiesta Dati, che invia per davvero da
// commerciale@donewifi.it. Stesso identico schema riusato qui.
export function emailPraticaCliente(nome: string, titoloPratica: string, link: string) {
  return {
    oggetto: `Done Wifi — ${titoloPratica}`,
    corpoHtml: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
        <p>Ciao ${nome},</p>
        <p>Per la tua pratica di ${titoloPratica.toLowerCase()} con Done Wifi, apri il link qui sotto:</p>
        <p><a href="${link}" style="display:inline-block;background:#CF000A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;">Vai alla pratica</a></p>
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
        <p><a href="${link}" style="display:inline-block;background:#CF000A;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600;">Completa i dati</a></p>
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
