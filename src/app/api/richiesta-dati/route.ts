import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { inviaNotificaTelegram } from "@/lib/telegram";
import { validaCodiceFiscale, validaPartitaIva, validaIban } from "@/lib/validazione";

const CAMPI_RISERVATI = new Set(["segnalazioneId", "tipologiaCliente", "profiloInternet", "consenso"]);
const CAMPI_FILE: Record<string, string> = {
  fronteDocumento: "Fronte documento",
  retroDocumento: "Retro documento",
  fronteTesseraSanitaria: "Fronte tessera sanitaria",
  retroTesseraSanitaria: "Retro tessera sanitaria",
};

// ★ Rotta pubblica (nessun login) usata dal modulo Richiesta Dati — ex
// RichiestaDatiNuovoContratto.html del vecchio gestionale: tipologia
// cliente (privato/azienda) con campi condizionali, metodo di pagamento
// con mandato SEPA, documento d'identità in 4 allegati distinti (non un
// solo campo multi-file generico) invece del modulo semplificato di
// prima. Usa la service role solo qui, lato server.
export async function POST(request: NextRequest) {
  const dati = await request.formData();
  const segnalazioneId = String(dati.get("segnalazioneId") || "");
  if (!segnalazioneId) {
    return NextResponse.json({ errore: "Segnalazione non specificata." }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: segnalazione, error: erroreLettura } = await supabase
    .from("segnalazioni")
    .select("id, nome, numero")
    .eq("id", segnalazioneId)
    .single();
  if (erroreLettura || !segnalazione) {
    return NextResponse.json({ errore: "Segnalazione non trovata." }, { status: 404 });
  }

  const tipologiaCliente = String(dati.get("tipologiaCliente") || "");
  const profiloInternet = String(dati.get("profiloInternet") || "");

  // ★ stessa validazione formale del client, ripetuta qui: la route è
  // pubblica, un client malevolo potrebbe saltare i controlli JS.
  const codiceFiscale = String(dati.get("codiceFiscale") || "").trim();
  const partitaIva = String(dati.get("partitaIva") || "").trim();
  const codiceFiscaleAzienda = String(dati.get("codiceFiscaleAzienda") || "").trim();
  const iban = String(dati.get("iban") || "").trim();
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
  for (const [chiave, valore] of dati.entries()) {
    if (CAMPI_RISERVATI.has(chiave) || chiave in CAMPI_FILE) continue;
    if (typeof valore === "string" && valore.trim()) dettagli[chiave] = valore.trim();
  }

  const documenti: { nome: string; percorso: string; tipo: string }[] = [];
  for (const [campo, etichetta] of Object.entries(CAMPI_FILE)) {
    const file = dati.get(campo);
    if (!(file instanceof File) || file.size === 0) continue;
    const percorso = `${segnalazioneId}/${Date.now()}-${file.name}`;
    const { error: erroreUpload } = await supabase.storage.from("documenti").upload(percorso, file, {
      contentType: file.type || "application/octet-stream",
    });
    if (erroreUpload) {
      return NextResponse.json({ errore: `Errore caricamento "${file.name}": ${erroreUpload.message}` }, { status: 500 });
    }
    documenti.push({ nome: file.name, percorso, tipo: etichetta });
  }

  const { error: erroreInsert } = await supabase.from("richieste_clienti").insert({
    tipo_richiesta: "Richiesta Dati",
    cliente: segnalazione.nome,
    segnalazione_id: segnalazioneId,
    dettagli,
    documenti,
  });
  if (erroreInsert) {
    return NextResponse.json({ errore: erroreInsert.message }, { status: 500 });
  }

  const aggiornamentoSegnalazione: Record<string, string | null> = {
    tipologia_cliente: tipologiaCliente || null,
    profilo_internet: profiloInternet || null,
    dati_ricevuti_at: new Date().toISOString(),
    aggiornato_il: new Date().toISOString(),
  };
  if (dettagli.telefono) aggiornamentoSegnalazione.telefono = dettagli.telefono;
  if (dettagli.email) aggiornamentoSegnalazione.email = dettagli.email;

  const { error: erroreUpdate } = await supabase
    .from("segnalazioni")
    .update(aggiornamentoSegnalazione)
    .eq("id", segnalazioneId);
  if (erroreUpdate) {
    return NextResponse.json({ errore: erroreUpdate.message }, { status: 500 });
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

  return NextResponse.json({ ok: true });
}
