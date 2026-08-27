import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// ★ NUOVA (2026-08) — richiesta esplicita: punto d'ingresso per il cliente
// che vuole avviare da solo una pratica (Trasferimento/Cambio IBAN/Cambio
// Anagrafica) dal Portale pubblico, senza che uno staff gli mandi prima un
// link da dentro un Ticket. Identificazione con telefono + CF/PIVA insieme
// (Opzione C della proposta "Come trovare il cliente" — la più certa,
// mai un caso ambiguo di più risultati da gestire). Rotta pubblica,
// nessun login: restituisce solo il minimo indispensabile per la conferma
// "sei tu?" (id + nome), mai l'anagrafica completa.
export async function POST(request: NextRequest) {
  // ★ FIX (2026-08-27, trovato in un giro di test pre-lancio) — corpo
  // non-JSON → 500 invece di un errore pulito. Vedi lo stesso fix in
  // apri-ticket/route.ts.
  const { telefono, codiceFiscale } = await request.json().catch(() => ({}) as Record<string, unknown>);
  const tel = String(telefono || "").replace(/\D/g, "").slice(-9);
  const cf = String(codiceFiscale || "").trim().toUpperCase();
  if (tel.length < 6 || !cf) {
    return NextResponse.json({ errore: "Inserisci un numero di telefono e un codice fiscale/partita IVA validi." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("clienti_esterni")
    .select("id, nome, cognome, ragionesociale")
    .ilike("telefono", `%${tel}%`)
    .or(`codice_fiscale.eq.${cf},partita_iva.eq.${cf}`)
    .limit(1);

  if (error) return NextResponse.json({ errore: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json(
      { errore: "Non troviamo nessun cliente con questi dati. Controlla di aver scritto correttamente telefono e codice fiscale/partita IVA, oppure contattaci direttamente." },
      { status: 404 }
    );
  }

  const c = data[0];
  const nome = c.ragionesociale || [c.nome, c.cognome].filter(Boolean).join(" ") || "Cliente";
  return NextResponse.json({ ok: true, clienteEsternoId: c.id, nome });
}
