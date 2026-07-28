import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// ★ Rotta pubblica (nessun login) usata dal modulo Richiesta Dati.
// Usa la service role solo qui, lato server, per scrivere in modo
// controllato senza aprire una policy RLS anonima diretta sulle tabelle.
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
  const dettagli: Record<string, string> = {
    "Codice Fiscale": String(dati.get("codiceFiscale") || ""),
    "Partita IVA": String(dati.get("partitaIva") || ""),
    IBAN: String(dati.get("iban") || ""),
    "Metodo di pagamento": String(dati.get("metodoPagamento") || ""),
  };

  const documenti: { nome: string; percorso: string }[] = [];
  const files = dati.getAll("documenti").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files) {
    const percorso = `${segnalazioneId}/${Date.now()}-${file.name}`;
    const { error: erroreUpload } = await supabase.storage.from("documenti").upload(percorso, file, {
      contentType: file.type || "application/octet-stream",
    });
    if (erroreUpload) {
      return NextResponse.json({ errore: `Errore caricamento "${file.name}": ${erroreUpload.message}` }, { status: 500 });
    }
    documenti.push({ nome: file.name, percorso });
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

  const { error: erroreUpdate } = await supabase
    .from("segnalazioni")
    .update({
      tipologia_cliente: tipologiaCliente || null,
      profilo_internet: profiloInternet || null,
      dati_ricevuti_at: new Date().toISOString(),
      aggiornato_il: new Date().toISOString(),
    })
    .eq("id", segnalazioneId);
  if (erroreUpdate) {
    return NextResponse.json({ errore: erroreUpdate.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
