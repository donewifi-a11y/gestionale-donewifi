import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { inviaNotificaTelegram } from "@/lib/telegram";
import { inviaMessaggioChatSistema } from "@/lib/chat";
import { inviaEmail, emailAvvisoInterno } from "@/lib/email";
import { REPARTO_PER_TIPO_RICHIESTA, TIPI_RICHIESTA_CLIENTE, type TipoRichiestaCliente } from "@/lib/types";

const CAMPI_RISERVATI = new Set(["tipo", "nomeCliente", "ticketId", "praticaId", "clienteEsternoId", "consenso", "volontaSubentro", "sito_web"]);
const CAMPI_FILE: Record<string, string> = {
  fronteDoc: "Fronte documento",
  retroDoc: "Retro documento",
  fronteTS: "Fronte tessera sanitaria",
  retroTS: "Retro tessera sanitaria",
};

// ★ Rotta pubblica (nessun login) per le 4 pratiche cliente — Cambio IBAN,
// Cambio Anagrafica, Trasferimento, Subentro — ognuna con i propri campi
// (ex form dedicati di RichiestaDati.html), raccolti qui in modo generico
// invece di uno per tipo: tutto ciò che non è un campo di controllo o un
// allegato noto finisce in "dettagli".
export async function POST(request: NextRequest) {
  // ★ FIX (2026-08-27, trovato in un giro di test pre-lancio) — un corpo
  // non-multipart (bot, richiesta rilanciata con l'header sbagliato)
  // faceva fallire `.formData()` con un'eccezione non gestita: 500 invece
  // di un errore pulito. La validazione già sotto ("Tipo di richiesta non
  // valido") gestisce già il caso di un FormData vuoto.
  const dati = await request.formData().catch(() => new FormData());

  // ★ FIX (2026-08-27, trovato in un giro di test pre-lancio) — stesso
  // honeypot anti-spam già in uso in api/portale/apri-ticket/route.ts e
  // api/richiesta-dati/route.ts: un campo invisibile che solo un bot
  // compila. Finto successo, non un errore.
  if (String(dati.get("sito_web") || "")) {
    return NextResponse.json({ ok: true });
  }

  const tipo = String(dati.get("tipo") || "");
  if (!TIPI_RICHIESTA_CLIENTE.includes(tipo as TipoRichiestaCliente)) {
    return NextResponse.json({ errore: "Tipo di richiesta non valido." }, { status: 400 });
  }
  const nomeCliente = String(dati.get("nomeCliente") || "").trim();
  if (!nomeCliente) {
    return NextResponse.json({ errore: "Il nome è obbligatorio." }, { status: 400 });
  }

  const ticketId = String(dati.get("ticketId") || "") || null;
  // ★ NUOVA (2026-08) — Subentro, doppio consenso in parallelo: se la
  // pratica è già stata avviata dall'operatore (vedi avviaPraticaSubentro
  // in richieste-clienti/actions.ts), il modulo pubblico arriva con
  // l'id di quella riga già esistente e va AGGIORNATA — non se ne crea
  // una seconda — per non perdere l'eventuale conferma del vecchio cliente
  // già registrata su quella stessa riga.
  const praticaId = String(dati.get("praticaId") || "") || null;
  // ★ NUOVA (2026-08) — "Pratiche cliente senza Ticket": collega la
  // richiesta al vero cliente (anagrafica Aruba) — valorizzato quando il
  // cliente si identifica da solo dal Portale (telefono+CF, vedi
  // /api/portale/trova-cliente) o quando l'operatore la avvia dalla scheda
  // Cliente Esterno. Facoltativo: le pratiche legate a un Ticket (incluso
  // Subentro) continuano a funzionare come prima, senza questo campo.
  const clienteEsternoIdRaw = String(dati.get("clienteEsternoId") || "");
  const clienteEsternoId = clienteEsternoIdRaw && Number.isFinite(Number(clienteEsternoIdRaw)) ? Number(clienteEsternoIdRaw) : null;

  const dettagli: Record<string, string> = {};
  for (const [chiave, valore] of dati.entries()) {
    if (CAMPI_RISERVATI.has(chiave) || chiave in CAMPI_FILE) continue;
    if (typeof valore === "string" && valore.trim()) dettagli[chiave] = valore.trim();
  }

  const supabase = createServiceClient();

  if (praticaId) {
    const { data: esistente } = await supabase.from("richieste_clienti").select("id, tipo_richiesta").eq("id", praticaId).maybeSingle();
    if (!esistente || esistente.tipo_richiesta !== tipo) {
      return NextResponse.json({ errore: "Pratica non valida o già gestita diversamente." }, { status: 400 });
    }
  }

  const documenti: { nome: string; percorso: string; tipo: string }[] = [];
  for (const [campo, etichetta] of Object.entries(CAMPI_FILE)) {
    const file = dati.get(campo);
    if (!(file instanceof File) || file.size === 0) continue;
    const percorso = `richieste-cliente/${Date.now()}-${file.name}`;
    const { error: erroreUpload } = await supabase.storage.from("documenti").upload(percorso, file, {
      contentType: file.type || "application/octet-stream",
    });
    if (erroreUpload) {
      return NextResponse.json({ errore: `Errore caricamento "${file.name}": ${erroreUpload.message}` }, { status: 500 });
    }
    documenti.push({ nome: file.name, percorso, tipo: etichetta });
  }

  const erroreScrittura = praticaId
    ? (await supabase.from("richieste_clienti").update({ cliente: nomeCliente, dettagli, documenti }).eq("id", praticaId)).error
    : (
        await supabase.from("richieste_clienti").insert({
          tipo_richiesta: tipo,
          cliente: nomeCliente,
          ticket_id: ticketId,
          cliente_esterno_id: clienteEsternoId,
          dettagli,
          documenti,
        })
      ).error;
  if (erroreScrittura) {
    return NextResponse.json({ errore: erroreScrittura.message }, { status: 500 });
  }

  const reparto = REPARTO_PER_TIPO_RICHIESTA[tipo as TipoRichiestaCliente];
  await inviaNotificaTelegram(
    reparto,
    `📋 <b>Nuova richiesta: ${tipo}</b>\n\nCliente: ${nomeCliente}\n\nApri il gestionale (Richieste Clienti) per i dettagli.`
  );

  // ★ NUOVA — richiesta esplicita: anche nella Chat interna (come già per
  // Richiesta Dati), con un link diretto che apre subito il Ticket sulla
  // tab "Documenti" invece del generico "apri Richieste Clienti" — se il
  // modulo non è collegato a un Ticket, apre comunque l'elenco filtrabile.
  const link = ticketId ? `${request.nextUrl.origin}/tickets?aperto=${ticketId}` : `${request.nextUrl.origin}/richieste-clienti`;
  await inviaMessaggioChatSistema(reparto, `📋 Nuova richiesta ${tipo} da ${nomeCliente}. ${link}`);

  // ★ NUOVA (2026-08) — stesso evento, anche via email verso
  // attivazioni@donewifi.it (richiesta esplicita, stesso principio già
  // applicato a Segnalazioni/Richiesta Dati) — non blocca la risposta se
  // l'invio fallisce.
  const { oggetto, corpoHtml, corpoTesto } = emailAvvisoInterno(
    `Nuova richiesta: ${tipo}`,
    `<p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Cliente: <b>${nomeCliente}</b>${clienteEsternoId ? `<br>Collegata alla scheda cliente #${clienteEsternoId}` : ""}</p>`,
    `Cliente: ${nomeCliente}${clienteEsternoId ? `\nCollegata alla scheda cliente #${clienteEsternoId}` : ""}`,
    link
  );
  await inviaEmail({ a: "attivazioni@donewifi.it", oggetto, corpoHtml, corpoTesto, reparto });

  return NextResponse.json({ ok: true });
}
