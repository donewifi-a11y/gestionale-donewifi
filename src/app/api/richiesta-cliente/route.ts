import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { inviaNotificaTelegram } from "@/lib/telegram";
import { validaIban } from "@/lib/validazione";
import { REPARTO_PER_TIPO_RICHIESTA, TIPI_RICHIESTA_CLIENTE, type TipoRichiestaCliente } from "@/lib/types";

// ★ Rotta pubblica (nessun login) per le 4 pratiche cliente — Cambio IBAN,
// Cambio Anagrafica, Trasferimento, Subentro — sul modello già usato da
// /api/richiesta-dati: service role solo qui, lato server.
export async function POST(request: NextRequest) {
  const dati = await request.formData();
  const tipo = String(dati.get("tipo") || "");
  if (!TIPI_RICHIESTA_CLIENTE.includes(tipo as TipoRichiestaCliente)) {
    return NextResponse.json({ errore: "Tipo di richiesta non valido." }, { status: 400 });
  }
  const nomeCliente = String(dati.get("nomeCliente") || "").trim();
  if (!nomeCliente) {
    return NextResponse.json({ errore: "Il nome è obbligatorio." }, { status: 400 });
  }

  const ticketId = String(dati.get("ticketId") || "") || null;

  const campoValori: Record<string, string> = {};
  for (const chiave of ["iban", "nuovoRecapito", "nuovoIndirizzo", "nuovoIntestatario"]) {
    const valore = String(dati.get(chiave) || "").trim();
    if (valore) campoValori[chiave] = valore;
  }

  if (tipo === "Cambio IBAN" && campoValori.iban) {
    const esito = validaIban(campoValori.iban);
    if (!esito.valido) return NextResponse.json({ errore: esito.messaggio }, { status: 400 });
  }

  const supabase = createServiceClient();

  const documenti: { nome: string; percorso: string }[] = [];
  const files = dati.getAll("documenti").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files) {
    const percorso = `richieste-cliente/${Date.now()}-${file.name}`;
    const { error: erroreUpload } = await supabase.storage.from("documenti").upload(percorso, file, {
      contentType: file.type || "application/octet-stream",
    });
    if (erroreUpload) {
      return NextResponse.json({ errore: `Errore caricamento "${file.name}": ${erroreUpload.message}` }, { status: 500 });
    }
    documenti.push({ nome: file.name, percorso });
  }

  const { error: erroreInsert } = await supabase.from("richieste_clienti").insert({
    tipo_richiesta: tipo,
    cliente: nomeCliente,
    ticket_id: ticketId,
    dettagli: campoValori,
    documenti,
  });
  if (erroreInsert) {
    return NextResponse.json({ errore: erroreInsert.message }, { status: 500 });
  }

  const reparto = REPARTO_PER_TIPO_RICHIESTA[tipo as TipoRichiestaCliente];
  await inviaNotificaTelegram(
    reparto,
    `📋 <b>Nuova richiesta: ${tipo}</b>\n\nCliente: ${nomeCliente}\n\nApri il gestionale (Richieste Clienti) per i dettagli.`
  );

  return NextResponse.json({ ok: true });
}
