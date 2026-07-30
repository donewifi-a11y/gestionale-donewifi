import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { inviaNotificaTelegram } from "@/lib/telegram";
import { REPARTO_PER_TIPO_RICHIESTA, TIPI_RICHIESTA_CLIENTE, type TipoRichiestaCliente } from "@/lib/types";

const CAMPI_RISERVATI = new Set(["tipo", "nomeCliente", "ticketId", "consenso"]);
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

  const dettagli: Record<string, string> = {};
  for (const [chiave, valore] of dati.entries()) {
    if (CAMPI_RISERVATI.has(chiave) || chiave in CAMPI_FILE) continue;
    if (typeof valore === "string" && valore.trim()) dettagli[chiave] = valore.trim();
  }

  const supabase = createServiceClient();

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

  const { error: erroreInsert } = await supabase.from("richieste_clienti").insert({
    tipo_richiesta: tipo,
    cliente: nomeCliente,
    ticket_id: ticketId,
    dettagli,
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
