import nodemailer from "nodemailer";
import type { AreaAccesso } from "@/lib/types";
import { registraEsitoIntegrazione } from "@/lib/integrazioni-log";

// ★ MIGRATA (2026-09-03, bug reale: la casella Aruba di Commerciale è
// stata bloccata da Aruba stessa — "525 5.7.13 Sending temporarily
// disabled for this mailbox, please change password" — e, sbloccarla
// richiedendo un cambio password non voluto, si è scelto di smettere di
// dipendere dalle caselle Aruba del tutto) — un solo mittente per tutte le
// email del gestionale, verificato su Resend (dominio donewifi.it) invece
// di tre caselle Aruba indipendenti che possono bloccarsi una per una.
// "comunicazioni@donewifi.it" — scelto esplicitamente dall'utente, un vero
// no-reply: nessuna casella reale legge le risposte, per questo i testi
// delle email invitano a chiamare invece di "rispondi pure a questa
// email" (vedi CONTATTACI_TESTO più sotto, usato ovunque prima c'era
// quella frase).
const MITTENTE_UNICO = "comunicazioni@donewifi.it";

// ★ il nome mittente resta diverso per reparto come con le caselle Aruba —
// cambia solo l'indirizzo dietro le quinte, non l'identità percepita dal
// cliente ("Done Wifi Commerciale" invece di un generico "Done Wifi").
const NOME_MITTENTE_REPARTI: Partial<Record<AreaAccesso, string>> = {
  "Analisi Rete": "Done Wifi Assistenza",
  Commerciale: "Done Wifi Commerciale",
  Fatturazione: "Done Wifi",
};

function mittenteReparto(reparto?: AreaAccesso): string {
  const nome = (reparto && NOME_MITTENTE_REPARTI[reparto]) || "Done Wifi";
  return `"${nome}" <${MITTENTE_UNICO}>`;
}

async function inviaViaResend(mittente: string, a: string, oggetto: string, html: string, testo?: string): Promise<{ errore: string | null }> {
  const risposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: mittente, to: a, subject: oggetto, html, text: testo }),
  });
  if (!risposta.ok) {
    const corpo = await risposta.json().catch(() => ({}) as Record<string, unknown>);
    const messaggio = typeof corpo.message === "string" ? corpo.message : `Resend ha risposto ${risposta.status}.`;
    return { errore: messaggio };
  }
  return { errore: null };
}

// ★ ex EMAIL_MITTENTE_REPARTI del vecchio gestionale (Gmail "Invia
// messaggi come") — percorso SMTP via le caselle Aruba, tenuto solo come
// ripiego se RESEND_API_KEY non è configurata (es. sviluppo locale senza
// account Resend a disposizione): non più il percorso principale, vedi
// nota sopra su MITTENTE_UNICO.
const CASELLE_REPARTI_SMTP: Partial<Record<AreaAccesso, { nome: string; envUser: string; envPass: string }>> = {
  "Analisi Rete": { nome: "Done Wifi Assistenza", envUser: "SMTP_USER_ANALISI_RETE", envPass: "SMTP_PASS_ANALISI_RETE" },
  Commerciale: { nome: "Done Wifi Commerciale", envUser: "SMTP_USER_COMMERCIALE", envPass: "SMTP_PASS_COMMERCIALE" },
  Fatturazione: { nome: "Done Wifi", envUser: "SMTP_USER_FATTURAZIONE", envPass: "SMTP_PASS_FATTURAZIONE" },
};

function transporterSmtp(user: string, pass: string) {
  const host = process.env.SMTP_HOST || "smtps.aruba.it";
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

async function inviaViaSmtp(a: { a: string; oggetto: string; corpoHtml: string; corpoTesto?: string; reparto?: AreaAccesso }): Promise<{ errore: string | null }> {
  const casella = a.reparto ? CASELLE_REPARTI_SMTP[a.reparto] : undefined;
  const user = (casella ? process.env[casella.envUser] : undefined) || process.env.SMTP_USER;
  const pass = (casella ? process.env[casella.envPass] : undefined) || process.env.SMTP_PASS;
  if (!user || !pass) return { errore: "Invio email non configurato (né RESEND_API_KEY né credenziali SMTP per questa casella)." };
  const mittente = `"${casella?.nome || "Done Wifi"}" <${user}>`;
  try {
    await transporterSmtp(user, pass).sendMail({ from: mittente, to: a.a, subject: a.oggetto, html: a.corpoHtml, text: a.corpoTesto });
    return { errore: null };
  } catch (err) {
    return { errore: err instanceof Error ? err.message : "Errore imprevisto nell'invio email." };
  }
}

// ★ NUOVA (2026-08) — `corpoTesto` (facoltativo) aggiunge una versione
// solo-testo accanto all'HTML: filtri antispam e client che bloccano
// immagini/HTML vedono comunque un messaggio leggibile invece di
// un'email vuota — un miglioramento di recapitabilità, non solo estetico.
export async function inviaEmail(a: { a: string; oggetto: string; corpoHtml: string; corpoTesto?: string; reparto?: AreaAccesso }) {
  if (!a.a) return { errore: "Nessun indirizzo destinatario." };

  const risultato = process.env.RESEND_API_KEY
    ? await inviaViaResend(mittenteReparto(a.reparto), a.a, a.oggetto, a.corpoHtml, a.corpoTesto)
    : await inviaViaSmtp(a);

  await registraEsitoIntegrazione(
    "email",
    risultato.errore ? "errore" : "ok",
    risultato.errore ? `${a.reparto ?? "default"} → ${a.a}: ${risultato.errore}` : `${a.reparto ?? "default"} → ${a.a}`
  );
  return risultato;
}

// ═══════════════════════════════════════════════════════════════════════
// ★ RISCRITTE (2026-08) — richiesta esplicita: le 8 email al cliente erano
// "alquanto tristi" — nessun logo/identità visiva, tono mischiato
// Gentile/Ciao a seconda di chi aveva scritto quella funzione, nessun
// footer con i dati dell'azienda, firma sempre anonima "Done Wifi", solo
// HTML senza alternativa testo. Proposta con artifact, approvata: tono
// sempre "Gentile", firma per reparto, footer con ragione sociale/
// indirizzo/P.IVA/telefono, versione testo per ogni email.
//
// Un'unica "cornice" (involucroEmail) invece di un <div> ricopiato in
// ognuna delle 8 funzioni: un ritocco futuro (es. cambiare il footer) si
// fa in un solo punto.
// ═══════════════════════════════════════════════════════════════════════

// ★ servito da public/brand/logo-bianco.png (wordmark bianco, visibile
// solo su sfondo scuro — da qui l'intestazione nera sotto). URL assoluto:
// i client email non caricano risorse relative né, in molti casi,
// immagini incorporate in base64.
const LOGO_URL = "https://gestione.donewifi.it/brand/logo-bianco.png";

const FOOTER_AZIENDA =
  '<b style="color:#6B625E;">Done Wifi</b> — Studio Armonia Srl, Via Tourneuve 6, 11100 Aosta (AO) — P.IVA 05690180012 — Tel. 0165 1825169';
const FOOTER_AZIENDA_TESTO = "Done Wifi — Studio Armonia Srl, Via Tourneuve 6, 11100 Aosta (AO) — P.IVA 05690180012 — Tel. 0165 1825169";

// ★ NUOVA (2026-09-03, stesso contesto della migrazione a Resend sopra) —
// da "comunicazioni@donewifi.it" (vero no-reply, nessuna casella dietro a
// leggere le risposte) non ha più senso invitare a "rispondere a questa
// email" come facevano le 7 email sotto quando partivano da una vera
// casella Aruba — sostituita ovunque con un invito a chiamare.
const CONTATTACI_TESTO = "Per qualsiasi domanda, chiamaci al 0165 1825169.";

function involucroEmail({ eyebrow, corpoHtml, footerExtra }: { eyebrow: string; corpoHtml: string; footerExtra: string }): string {
  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.12);">
      <div style="background:#141414;padding:28px 32px;text-align:center;">
        <img src="${LOGO_URL}" alt="Done Wifi" width="72" style="display:inline-block;" />
      </div>
      <div style="padding:32px 32px 8px;">
        <p style="font-family:ui-monospace,'SFMono-Regular',Consolas,monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#CF000A;font-weight:700;margin:0 0 10px;">${eyebrow}</p>
        ${corpoHtml}
      </div>
      <div style="padding:20px 32px 28px;border-top:1px solid #EFEAE7;margin-top:16px;">
        <p style="font-size:12px;color:#948A85;line-height:1.6;margin:0;">
          ${FOOTER_AZIENDA}<br>
          ${footerExtra}
        </p>
      </div>
    </div>
  `;
}

function bottoneEmail(testo: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background:#CF000A;color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:700;font-size:14px;margin:18px 0 8px;">${testo}</a>`;
}

export function emailApprovazioneIntervento(cliente: string, numero: number, link: string) {
  return {
    oggetto: `Done Wifi — Conferma Intervento (Ticket #${numero})`,
    corpoHtml: involucroEmail({
      eyebrow: `Ticket #${numero} · Conferma intervento`,
      corpoHtml: `
        <h1 style="font-size:21px;font-weight:800;color:#141414;margin:0 0 14px;letter-spacing:-0.01em;">L'intervento è stato risolto da remoto</h1>
        <p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Gentile ${cliente},</p>
        <p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">ti confermiamo che l'intervento relativo al tuo Ticket #${numero} è stato completato da remoto. Per confermare che tutto funzioni correttamente, clicca sul link qui sotto:</p>
        ${bottoneEmail("Conferma intervento", link)}
        <p style="font-size:14px;color:#6B625E;line-height:1.6;margin:18px 0 0;">${CONTATTACI_TESTO}<br><b style="color:#141414;">Assistenza Done Wifi</b></p>
      `,
      footerExtra: "Hai ricevuto questa email perché è stato risolto da remoto un intervento sul tuo Ticket.",
    }),
    corpoTesto: `Gentile ${cliente},

ti confermiamo che l'intervento relativo al tuo Ticket #${numero} è stato completato da remoto.
Per confermare che tutto funzioni correttamente, apri questo link:
${link}

${CONTATTACI_TESTO}

Assistenza Done Wifi
${FOOTER_AZIENDA_TESTO}`,
  };
}

export function emailApprovazioneContratto(cliente: string, numero: number, link: string) {
  return {
    oggetto: `Done Wifi — Il tuo contratto è pronto (Pratica #${numero})`,
    corpoHtml: involucroEmail({
      eyebrow: `Pratica #${numero} · Nuovo contratto`,
      corpoHtml: `
        <h1 style="font-size:21px;font-weight:800;color:#141414;margin:0 0 14px;letter-spacing:-0.01em;">Il tuo contratto è pronto</h1>
        <p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Gentile ${cliente},</p>
        <p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">abbiamo preparato il contratto relativo alla tua pratica #${numero}. Prima di procedere con l'installazione, ti chiediamo di leggerlo e confermarne l'approvazione.</p>
        ${bottoneEmail("Vedi e approva il contratto", link)}
        <p style="font-size:14px;color:#6B625E;line-height:1.6;margin:18px 0 0;">${CONTATTACI_TESTO}<br><b style="color:#141414;">Commerciale Done Wifi</b></p>
      `,
      footerExtra: "Hai ricevuto questa email perché hai richiesto un preventivo/installazione Done Wifi.",
    }),
    corpoTesto: `Gentile ${cliente},

abbiamo preparato il contratto relativo alla tua pratica #${numero}. Prima di procedere con l'installazione, ti chiediamo di leggerlo e confermarne l'approvazione:
${link}

${CONTATTACI_TESTO}

Commerciale Done Wifi
${FOOTER_AZIENDA_TESTO}`,
  };
}

// ★ sostituisce la firma disegnata su schermo del cliente nella Scheda di
// Installazione/Lavorazione: un codice a 6 cifre, valido 10 minuti, che
// il cliente legge dalla propria email e conferma di persona al tecnico
// presente sul posto — prova più solida di un semplice link cliccabile
// in autonomia in un momento qualsiasi (vedi emailLinkFirmaScheda più
// sotto, riservato al fallback autorizzato dal tecnico).
export function emailOtpFirmaScheda(cliente: string, codice: string, ticketNumero: number) {
  return {
    oggetto: `Done Wifi — Codice di conferma lavori (Ticket #${ticketNumero})`,
    corpoHtml: involucroEmail({
      eyebrow: `Ticket #${ticketNumero} · Conferma lavori`,
      corpoHtml: `
        <h1 style="font-size:21px;font-weight:800;color:#141414;margin:0 0 14px;letter-spacing:-0.01em;">I lavori sono stati completati</h1>
        <p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Gentile ${cliente},</p>
        <p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">il nostro tecnico è presente da te e ti chiede di confermare i lavori appena svolti. Comunicagli questo codice a voce:</p>
        <p style="font-size:34px;font-weight:800;letter-spacing:7px;color:#CF000A;text-align:center;margin:22px 0;">${codice}</p>
        <p style="font-size:13px;color:#948A85;margin:0 0 18px;">Il codice scade tra 10 minuti. Se non hai richiesto nulla, ignora questa email.</p>
        <p style="font-size:14px;color:#6B625E;line-height:1.6;margin:0;">A presto,<br><b style="color:#141414;">Assistenza Done Wifi</b></p>
      `,
      footerExtra: "Hai ricevuto questa email perché un tecnico Done Wifi è intervenuto sul tuo impianto oggi.",
    }),
    corpoTesto: `Gentile ${cliente},

il nostro tecnico è presente da te e ti chiede di confermare i lavori appena svolti (Ticket #${ticketNumero}).
Comunicagli questo codice a voce: ${codice}

Il codice scade tra 10 minuti. Se non hai richiesto nulla, ignora questa email.

Assistenza Done Wifi
${FOOTER_AZIENDA_TESTO}`,
  };
}

// ★ alternativa al codice OTP (emailOtpFirmaScheda) per quando il cliente
// non può riceverlo/leggerlo sul posto insieme al tecnico — va usata solo
// se il tecnico autorizza esplicitamente il passaggio (mai una scelta
// lasciata al cliente): stesso schema del link di approvazione già usato
// per contratto/intervento/preventivo, il cliente può confermare anche in
// un momento successivo da solo.
export function emailLinkFirmaScheda(cliente: string, ticketNumero: number, link: string) {
  return {
    oggetto: `Done Wifi — Conferma i lavori svolti (Ticket #${ticketNumero})`,
    corpoHtml: involucroEmail({
      eyebrow: `Ticket #${ticketNumero} · Conferma lavori`,
      corpoHtml: `
        <h1 style="font-size:21px;font-weight:800;color:#141414;margin:0 0 14px;letter-spacing:-0.01em;">Conferma i lavori svolti</h1>
        <p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Gentile ${cliente},</p>
        <p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">il tecnico Done Wifi ha completato l'intervento relativo al Ticket #${ticketNumero}. Conferma che i lavori sono stati svolti correttamente:</p>
        ${bottoneEmail("Confermo i lavori svolti", link)}
        <p style="font-size:14px;color:#6B625E;line-height:1.6;margin:18px 0 0;">${CONTATTACI_TESTO}<br><b style="color:#141414;">Assistenza Done Wifi</b></p>
      `,
      footerExtra: "Hai ricevuto questa email perché un tecnico Done Wifi è intervenuto sul tuo impianto.",
    }),
    corpoTesto: `Gentile ${cliente},

il tecnico Done Wifi ha completato l'intervento relativo al Ticket #${ticketNumero}. Conferma che i lavori sono stati svolti correttamente:
${link}

${CONTATTACI_TESTO}

Assistenza Done Wifi
${FOOTER_AZIENDA_TESTO}`,
  };
}

export function emailPreventivo(cliente: string, numero: number, totale: string, link: string) {
  return {
    oggetto: `Done Wifi — Il tuo preventivo (#${numero})`,
    corpoHtml: involucroEmail({
      eyebrow: `Preventivo #${numero}`,
      corpoHtml: `
        <h1 style="font-size:21px;font-weight:800;color:#141414;margin:0 0 14px;letter-spacing:-0.01em;">Il tuo preventivo</h1>
        <p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Gentile ${cliente},</p>
        <p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">abbiamo preparato un preventivo per te (totale <b>${totale}</b>). Puoi vederlo nel dettaglio e scegliere se approvarlo direttamente da qui:</p>
        ${bottoneEmail("Vedi il preventivo", link)}
        <p style="font-size:14px;color:#6B625E;line-height:1.6;margin:18px 0 0;">${CONTATTACI_TESTO}<br><b style="color:#141414;">Commerciale Done Wifi</b></p>
      `,
      footerExtra: "Hai ricevuto questa email perché hai richiesto un preventivo Done Wifi.",
    }),
    corpoTesto: `Gentile ${cliente},

abbiamo preparato un preventivo per te (totale ${totale}). Puoi vederlo nel dettaglio e scegliere se approvarlo qui:
${link}

${CONTATTACI_TESTO}

Commerciale Done Wifi
${FOOTER_AZIENDA_TESTO}`,
  };
}

// ★ FIX (storico) — il pulsante "Email" del pannello "Invia una pratica al
// cliente" (Trasferimento/Subentro/Cambio IBAN/Cambio Anagrafica/Disdetta,
// vedi InvioLinkCliente) apriva il client di posta locale dell'operatore
// (mailto:) invece di inviare davvero dalla casella del reparto competente
// — a differenza di Richiesta Dati, che invia per davvero da
// commerciale@donewifi.it. Firmata "Servizio Clienti" (non un reparto
// singolo): questa pratica può coinvolgerne più di uno a seconda del tipo
// (Fatturazione per IBAN/Anagrafica, Commerciale per Trasferimento/
// Subentro) e la funzione non riceve quel dato.
//
// ★ RIVISTA (2026-08-28, richiesta esplicita: "rivediamo i testi di quando
// il sistema invia le mail con richiesta dati, cambi e disdette" →
// artifact "I testi che il sistema invia davvero": stesso identico
// paragrafo generico ("per la tua pratica di X, apri il link") per tutte
// e 5 le pratiche — un Cambio IBAN e una Disdetta suonavano indistinguibili
// → "correggi così come hai fatto [con il testo dei rapporti, reso meno
// robotico], prima era troppo colloquiale e diretto") — un paragrafo su
// misura per ciascuna pratica invece dell'unica frase generica: dice cosa
// è successo e cosa aspettarsi dopo il click, non solo "apri il link".
// Lookup per titolo invece di un nuovo parametro passato da ognuno dei 4
// punti che chiamano questa funzione (tickets/actions.ts ×2,
// richieste-clienti/actions.ts, clienti-esterni/actions.ts): i titoli sono
// già stringhe fisse note qui (vedi lib/richieste-cliente-config.ts e i
// due casi "Dati per il Subentro"/"Conferma cessione..." passati a mano),
// un solo file da mantenere invece di quattro.
const INTRO_PRATICA: Record<string, string> = {
  "Cambio IBAN":
    "Ci hai comunicato di voler aggiornare l'IBAN usato per l'addebito delle fatture. Apri il link qui sotto per indicarci il nuovo IBAN — bastano un paio di minuti, e resterà valido dalla prossima fattura utile.",
  "Cambio Anagrafica":
    "Ci hai comunicato di voler aggiornare i tuoi dati sul contratto. Apri il link qui sotto per indicarci cosa è cambiato — un tuo documento potrebbe servirci per confermare la modifica.",
  Trasferimento:
    "Ci hai comunicato di voler trasferire la tua linea Done Wifi a un nuovo indirizzo. Apri il link qui sotto per indicarci dove: verificheremo la copertura e, se il trasferimento è possibile, ti contatteremo per organizzare l'intervento.",
  Subentro:
    "Ci hai comunicato di voler intestarti un contratto Done Wifi già attivo. Apri il link qui sotto per completare i tuoi dati — il servizio resta attivo per tutta la pratica, senza nessuna interruzione.",
  "Disdetta contratto":
    "Abbiamo ricevuto la tua richiesta di disdetta. Apri il link qui sotto per confermarla: ti terremo aggiornato sui tempi di disattivazione e su eventuali apparati da restituire.",
  "Conferma cessione del contratto (Subentro)":
    "È stata avviata una richiesta di subentro sul tuo contratto Done Wifi — prima di procedere, ci serve la tua conferma esplicita. Apri il link qui sotto per confermare la cessione: fino a quel momento il contratto resta a tuo nome.",
  "Dati per il Subentro":
    "Il contratto Done Wifi sull'impianto è pronto per essere intestato a te. Apri il link qui sotto per completare i tuoi dati e concludere il subentro.",
};

export function emailPraticaCliente(nome: string, titoloPratica: string, link: string) {
  const intro = INTRO_PRATICA[titoloPratica] ?? `Per la tua pratica di ${titoloPratica.toLowerCase()} con Done Wifi, apri il link qui sotto per proseguire.`;
  return {
    oggetto: `Done Wifi — ${titoloPratica}`,
    corpoHtml: involucroEmail({
      eyebrow: titoloPratica,
      corpoHtml: `
        <h1 style="font-size:21px;font-weight:800;color:#141414;margin:0 0 14px;letter-spacing:-0.01em;">${titoloPratica}</h1>
        <p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Gentile ${nome},</p>
        <p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">${intro}</p>
        ${bottoneEmail("Vai alla pratica", link)}
        <p style="font-size:14px;color:#6B625E;line-height:1.6;margin:18px 0 0;">${CONTATTACI_TESTO}<br><b style="color:#141414;">Servizio Clienti Done Wifi</b></p>
      `,
      footerExtra: "Hai ricevuto questa email perché hai richiesto questa pratica presso Done Wifi.",
    }),
    corpoTesto: `Gentile ${nome},

${intro}
${link}

${CONTATTACI_TESTO}

Servizio Clienti Done Wifi
${FOOTER_AZIENDA_TESTO}`,
  };
}

// ★ RIVISTA (2026-08-28, stesso giro di email.ts sopra) — diceva solo
// "inserisci qui i tuoi dati", senza spiegare quali né perché né quanto ci
// vuole: chi la riceveva doveva aprire il link per scoprirlo. Ora nomina
// cosa serve davvero (dati fiscali/di pagamento, un documento) e quanto
// richiede, in linea con quello che il modulo poi chiede per davvero.
export function emailRichiestaDatiSegnalazione(nome: string, link: string) {
  return {
    oggetto: "Done Wifi — completa i tuoi dati",
    corpoHtml: involucroEmail({
      eyebrow: "Completa i tuoi dati",
      corpoHtml: `
        <h1 style="font-size:21px;font-weight:800;color:#141414;margin:0 0 14px;letter-spacing:-0.01em;">Completa i tuoi dati</h1>
        <p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Gentile ${nome},</p>
        <p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">grazie per aver scelto Done Wifi. Per procedere con l'attivazione ci servono i tuoi dati fiscali e di pagamento, oltre a un documento d'identità — bastano pochi minuti, e i dati restano al sicuro.</p>
        ${bottoneEmail("Completa i dati", link)}
        <p style="font-size:14px;color:#6B625E;line-height:1.6;margin:18px 0 0;">${CONTATTACI_TESTO}<br><b style="color:#141414;">Commerciale Done Wifi</b></p>
      `,
      footerExtra: "Hai ricevuto questa email perché hai richiesto una copertura/attivazione Done Wifi.",
    }),
    corpoTesto: `Gentile ${nome},

grazie per aver scelto Done Wifi. Per procedere con l'attivazione ci servono i tuoi dati fiscali e di pagamento, oltre a un documento d'identità — bastano pochi minuti, e i dati restano al sicuro.
${link}

${CONTATTACI_TESTO}

Commerciale Done Wifi
${FOOTER_AZIENDA_TESTO}`,
  };
}

/** ★ NUOVA (2026-08-26) — `riepilogo` facoltativo: il testo generato da
 * generaTestoRapportino()/generaTestoScheda() (lib/testo-rapporto.ts,
 * richiesta esplicita), per dare al cliente un resoconto leggibile
 * dell'intervento invece del solo "è stato completato". Facoltativo per
 * non rompere i punti che non lo passano ancora. */
export function emailChiusuraTicket(cliente: string, numero: number, riepilogo?: string) {
  return {
    oggetto: `Done Wifi — Intervento completato (Ticket #${numero})`,
    corpoHtml: involucroEmail({
      eyebrow: `Ticket #${numero} · Intervento completato`,
      corpoHtml: `
        <h1 style="font-size:21px;font-weight:800;color:#141414;margin:0 0 14px;letter-spacing:-0.01em;">Il tuo intervento è concluso</h1>
        <p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Gentile ${cliente},</p>
        <p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">ti confermiamo che il tuo intervento (Ticket #${numero}) è stato completato.</p>
        ${
          riepilogo
            ? `<div style="background:#F7F3F1;border-radius:10px;padding:14px 16px;margin:14px 0 0;"><p style="font-size:14px;color:#141414;line-height:1.6;margin:0;">${riepilogo}</p></div>`
            : ""
        }
        <p style="font-size:14px;color:#6B625E;line-height:1.6;margin:18px 0 0;">${CONTATTACI_TESTO}<br><b style="color:#141414;">Assistenza Done Wifi</b></p>
      `,
      footerExtra: "Hai ricevuto questa email perché è stato completato un intervento sul tuo Ticket.",
    }),
    corpoTesto: `Gentile ${cliente},

ti confermiamo che il tuo intervento (Ticket #${numero}) è stato completato.
${riepilogo ? `\n${riepilogo}\n` : ""}
${CONTATTACI_TESTO}

Assistenza Done Wifi
${FOOTER_AZIENDA_TESTO}`,
  };
}

// ★ NUOVA (2026-08) — richiesta esplicita: promemoria interni verso un
// indirizzo fisso (attivazioni@donewifi.it) invece che verso il cliente —
// a differenza di tutte le email sopra, qui il destinatario è lo staff
// stesso, quindi niente "Gentile [nome]", solo i fatti e un link diretto
// al gestionale. Un'unica funzione condivisa (invece di tre quasi
// identiche) per le tre notifiche richieste: nuova Segnalazione, nuovi
// dati/documenti ricevuti, riepilogo mattutino delle Segnalazioni non
// ancora prese in carico — vedi segnalazioni/actions.ts,
// api/richiesta-dati/route.ts, api/cron/promemoria-ticket/route.ts.
export function emailAvvisoInterno(titolo: string, corpoHtml: string, corpoTesto: string, link: string) {
  return {
    oggetto: `Done Wifi — ${titolo}`,
    corpoHtml: involucroEmail({
      eyebrow: "Notifica gestionale",
      corpoHtml: `
        <h1 style="font-size:21px;font-weight:800;color:#141414;margin:0 0 14px;letter-spacing:-0.01em;">${titolo}</h1>
        ${corpoHtml}
        ${bottoneEmail("Apri il gestionale", link)}
      `,
      footerExtra: "Notifica automatica del gestionale — non serve rispondere a questa email.",
    }),
    corpoTesto: `${titolo}\n\n${corpoTesto}\n\n${link}`,
  };
}
