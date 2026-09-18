import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { inviaNotificaTelegram } from "@/lib/telegram";
import { inviaMessaggioChatSistema } from "@/lib/chat";
import { inviaEmail, emailAvvisoInterno } from "@/lib/email";
import { validaCodiceFiscale, validaPartitaIva, validaIban } from "@/lib/validazione";
import { creaLimitatoreTentativi, ipRichiesta } from "@/lib/rate-limit-portale";

// ★ FIX (2026-09-17, code review approfondita) — rotta pubblica e mutante
// (scrive richieste_clienti + segnalazioni) senza alcun limite di
// tentativi, protetta solo dall'honeypot "sito_web" (inefficace contro uno
// script scritto apposta). Limite più permissivo delle rotte di ricerca
// (qui il chiamante deve già conoscere un vero segnalazioneId esistente).
const troppiTentativi = creaLimitatoreTentativi(10, 5 * 60 * 1000);

const CAMPI_RISERVATI = new Set(["segnalazioneId", "tipologiaCliente", "profiloInternet", "consenso", "documenti"]);

// ★ Rotta pubblica (nessun login) usata dal modulo Richiesta Dati — ex
// RichiestaDatiNuovoContratto.html del vecchio gestionale: tipologia
// cliente (privato/azienda) con campi condizionali, metodo di pagamento
// con mandato SEPA, documento d'identità in 4 allegati distinti (non un
// solo campo multi-file generico) invece del modulo semplificato di
// prima. Usa la service role solo qui, lato server.
// ★ FIX — riceve JSON, non più multipart/FormData: i file vengono ormai
// caricati direttamente dal browser allo storage (vedi upload-url/route.ts)
// per non superare il limite di corpo delle funzioni Vercel; qui arriva solo
// il loro percorso già caricato dentro `documenti`.
export async function POST(request: NextRequest) {
  const ip = ipRichiesta(request);
  if (troppiTentativi(ip)) {
    return NextResponse.json({ errore: "Troppi tentativi. Riprova tra qualche minuto." }, { status: 429 });
  }

  // ★ FIX (2026-08-27, trovato in un giro di test pre-lancio) — corpo
  // non-JSON → 500 invece di un errore pulito. Vedi lo stesso fix in
  // api/portale/apri-ticket/route.ts.
  const dati = await request.json().catch(() => ({}) as Record<string, unknown>);

  // ★ FIX (2026-08-27, trovato in un giro di test pre-lancio) — unica
  // rotta pubblica del gestionale senza l'honeypot anti-spam già in uso
  // in api/portale/apri-ticket/route.ts: stesso principio, un campo
  // invisibile che solo un bot compila. Finto successo, non un errore —
  // un bot che riceve un 400 di solito riprova con varianti, uno che
  // "riesce" smette.
  if (dati.sito_web) {
    return NextResponse.json({ ok: true });
  }

  const segnalazioneId = String(dati.segnalazioneId || "");
  if (!segnalazioneId) {
    return NextResponse.json({ errore: "Segnalazione non specificata." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: segnalazione, error: erroreLettura } = await supabase
    .from("segnalazioni")
    .select("id, nome, numero, dati_ricevuti_at")
    .eq("id", segnalazioneId)
    .single();
  if (erroreLettura || !segnalazione) {
    return NextResponse.json({ errore: "Segnalazione non trovata." }, { status: 404 });
  }
  // ★ FIX (2026-09-18, audit modulo Segnalazioni) — nessun controllo di
  // idempotenza: un doppio submit ravvicinato (doppio click prima che la UI
  // disabiliti il bottone, o due tab aperte sullo stesso link) superava
  // entrambi la validazione e inseriva due righe distinte in
  // richieste_clienti, con due update concorrenti su segnalazioni il cui
  // esito dipendeva dall'ordine di arrivo — documenti caricati due volte,
  // una delle due submission salvata ma mai più utilizzata da nessuna UI
  // (che legge solo la prima trovata). Una volta che `dati_ricevuti_at` è
  // già valorizzato, i dati sono già arrivati: un secondo invio va
  // rifiutato con un messaggio chiaro invece di creare un doppione.
  if (segnalazione.dati_ricevuti_at) {
    return NextResponse.json({ errore: "I dati per questa richiesta sono già stati inviati in precedenza." }, { status: 409 });
  }

  const tipologiaCliente = String(dati.tipologiaCliente || "");
  const profiloInternet = String(dati.profiloInternet || "");

  // ★ stessa validazione formale del client, ripetuta qui: la route è
  // pubblica, un client malevolo potrebbe saltare i controlli JS.
  const codiceFiscale = String(dati.codiceFiscale || "").trim();
  const partitaIva = String(dati.partitaIva || "").trim();
  const codiceFiscaleAzienda = String(dati.codiceFiscaleAzienda || "").trim();
  const iban = String(dati.iban || "").trim();
  if (codiceFiscale && !validaCodiceFiscale(codiceFiscale).valido) {
    return NextResponse.json({ errore: validaCodiceFiscale(codiceFiscale).messaggio }, { status: 400 });
  }
  if (partitaIva && !validaPartitaIva(partitaIva).valido) {
    return NextResponse.json({ errore: validaPartitaIva(partitaIva).messaggio }, { status: 400 });
  }
  if (codiceFiscaleAzienda && !validaCodiceFiscale(codiceFiscaleAzienda).valido) {
    return NextResponse.json({ errore: validaCodiceFiscale(codiceFiscaleAzienda).messaggio }, { status: 400 });
  }
  if (iban && !validaIban(iban).valido) {
    return NextResponse.json({ errore: validaIban(iban).messaggio }, { status: 400 });
  }

  // ★ tutto ciò che non è un campo di controllo o un allegato noto finisce
  // in "dettagli" — un solo posto da aggiornare se un domani cambiano i
  // campi del modulo, senza toccare questa route.
  const dettagli: Record<string, string> = {};
  for (const [chiave, valore] of Object.entries(dati)) {
    if (CAMPI_RISERVATI.has(chiave)) continue;
    if (typeof valore === "string" && valore.trim()) dettagli[chiave] = valore.trim();
  }

  const documenti = Array.isArray(dati.documenti) ? dati.documenti : [];

  const { error: erroreInsert } = await supabase.from("richieste_clienti").insert({
    tipo_richiesta: "Richiesta Dati",
    cliente: segnalazione.nome,
    segnalazione_id: segnalazioneId,
    dettagli,
    documenti,
  });
  if (erroreInsert) {
    // ★ FIX (2026-08-31, controllo d'oro usabilità) — il messaggio Postgres
    // grezzo (nomi di colonna/tabella) arrivava al cliente proprio dopo che
    // aveva già caricato 4 documenti d'identità: dettaglio tecnico inutile
    // per chi non conosce il gestionale, ora resta nei log del server.
    console.error("api/richiesta-dati — insert richieste_clienti:", erroreInsert.message);
    return NextResponse.json({ errore: "Errore imprevisto durante l'invio — riprova o contattaci." }, { status: 500 });
  }

  const aggiornamentoSegnalazione: Record<string, string | null> = {
    tipologia_cliente: tipologiaCliente || null,
    profilo_internet: profiloInternet || null,
    dati_ricevuti_at: new Date().toISOString(),
    aggiornato_il: new Date().toISOString(),
  };
  if (dettagli.telefono) aggiornamentoSegnalazione.telefono = dettagli.telefono;
  if (dettagli.email) aggiornamentoSegnalazione.email = dettagli.email;
  // ★ nome/cognome (Privato) o ragione sociale (Azienda) sono ora
  // riconfermati dal cliente in questo step invece di restare solo quanto
  // scritto dallo staff in Segnalazione — se diversi, il nome corretto va
  // aggiornato qui.
  if (dettagli.nome && dettagli.cognome) aggiornamentoSegnalazione.nome = `${dettagli.nome} ${dettagli.cognome}`.trim();
  else if (dettagli.ragioneSociale) aggiornamentoSegnalazione.nome = dettagli.ragioneSociale;
  // ★ l'indirizzo di installazione viene riverificato dal cliente in questo
  // step (vedi richiesta-dati-form.tsx) — se corretto rispetto a quello
  // raccolto in Segnalazione, va aggiornato qui.
  if (dettagli.via) aggiornamentoSegnalazione.via = dettagli.via;
  if (dettagli.civico) aggiornamentoSegnalazione.civico = dettagli.civico;
  if (dettagli.comune) aggiornamentoSegnalazione.comune = dettagli.comune;
  if (dettagli.cap) aggiornamentoSegnalazione.cap = dettagli.cap;

  const { error: erroreUpdate } = await supabase
    .from("segnalazioni")
    .update(aggiornamentoSegnalazione)
    .eq("id", segnalazioneId);
  if (erroreUpdate) {
    console.error("api/richiesta-dati — update segnalazioni:", erroreUpdate.message);
    return NextResponse.json({ errore: "Errore imprevisto durante l'invio — riprova o contattaci." }, { status: 500 });
  }

  // ★ stesso comportamento del vecchio gestionale: unica notifica Telegram
  // rimasta attiva, al reparto Commerciale, quando arrivano dati/documenti
  // da un cliente — non blocca la risposta se l'invio fallisce.
  await inviaNotificaTelegram(
    "Commerciale",
    `📋 <b>Nuovi dati ricevuti</b>\n\nCliente: ${segnalazione.nome}\nSegnalazione #${segnalazione.numero}` +
      (tipologiaCliente ? `\nTipologia: ${tipologiaCliente}` : "") +
      (profiloInternet ? `\nProfilo: ${profiloInternet}` : "") +
      `\n\nApri il gestionale per i dettagli.`
  );

  // ★ stesso evento, anche nella Chat interna (gruppo Commerciale — vede
  // anche chi è amministratore) invece del solo Telegram: chi lavora la
  // pratica se ne accorge da dove lavora già ogni giorno.
  await inviaMessaggioChatSistema(
    "Commerciale",
    `📋 Nuovi dati ricevuti da ${segnalazione.nome} (Segnalazione #${segnalazione.numero}). Verifica i documenti e procedi con il contratto.`
  );

  // ★ NUOVA (2026-08) — richiesta esplicita: stesso evento, anche via email
  // verso attivazioni@donewifi.it — non blocca la risposta se l'invio fallisce.
  const { oggetto, corpoHtml, corpoTesto } = emailAvvisoInterno(
    `Nuovi dati ricevuti — Segnalazione #${segnalazione.numero}`,
    `<p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Cliente: <b>${segnalazione.nome}</b>${
      tipologiaCliente ? `<br>Tipologia: ${tipologiaCliente}` : ""
    }${profiloInternet ? `<br>Profilo: ${profiloInternet}` : ""}</p>`,
    `Cliente: ${segnalazione.nome}${tipologiaCliente ? `\nTipologia: ${tipologiaCliente}` : ""}${profiloInternet ? `\nProfilo: ${profiloInternet}` : ""}`,
    `${request.nextUrl.origin}/segnalazioni`
  );
  await inviaEmail({ a: "attivazioni@donewifi.it", oggetto, corpoHtml, corpoTesto, reparto: "Commerciale" });

  return NextResponse.json({ ok: true });
}
