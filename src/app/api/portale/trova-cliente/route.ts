import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { creaLimitatoreTentativi, ipRichiesta } from "@/lib/rate-limit-portale";

// ★ NUOVA (2026-08) — richiesta esplicita: punto d'ingresso per il cliente
// che vuole avviare da solo una pratica (Trasferimento/Cambio IBAN/Cambio
// Anagrafica) dal Portale pubblico, senza che uno staff gli mandi prima un
// link da dentro un Ticket. Identificazione con telefono + CF/PIVA insieme
// (Opzione C della proposta "Come trovare il cliente" — la più certa,
// mai un caso ambiguo di più risultati da gestire). Rotta pubblica,
// nessun login: restituisce solo il minimo indispensabile per la conferma
// "sei tu?" (id + nome), mai l'anagrafica completa.
//
// ★ FIX (2026-09-17, "controllo d'oro" — continuazione) — a differenza
// della rotta gemella verifica-stato/route.ts (stesso genere di ricerca
// "due dati del cliente, nessun login"), questa non aveva alcun limite di
// tentativi: un risultato qui rivela il NOME REALE di un cliente, un
// rischio di correlazione dati più concreto di verificare lo stato di un
// Ticket. Stessa protezione, ora condivisa in lib/rate-limit-portale.ts.
const troppiTentativi = creaLimitatoreTentativi(8, 5 * 60 * 1000);

export async function POST(request: NextRequest) {
  const ip = ipRichiesta(request);
  if (troppiTentativi(ip)) {
    return NextResponse.json({ errore: "Troppi tentativi. Riprova tra qualche minuto." }, { status: 429 });
  }

  // ★ FIX (2026-08-27, trovato in un giro di test pre-lancio) — corpo
  // non-JSON → 500 invece di un errore pulito. Vedi lo stesso fix in
  // apri-ticket/route.ts.
  const { telefono, codiceFiscale } = await request.json().catch(() => ({}) as Record<string, unknown>);
  const tel = String(telefono || "").replace(/\D/g, "").slice(-9);
  // ★ FIX (2026-09-17, code review approfondita) — `cf` finisce interpolato
  // direttamente dentro la stringa di filtro di `.or()` qui sotto: il solo
  // `.toUpperCase()` rende improbabile in pratica un'iniezione riuscita
  // (nomi di colonna/operatore PostgREST sono case-sensitive e le colonne
  // reali sono minuscole), ma un CF/PIVA legittimo non contiene mai virgole
  // o punti — filtrarlo ai soli caratteri alfanumerici chiude comunque la
  // classe di bug alla radice invece di fare affidamento su un effetto
  // collaterale del maiuscolo.
  const cf = String(codiceFiscale || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
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

  if (error) {
    // ★ FIX (2026-08-31, controllo d'oro usabilità) — stesso fix di
    // apri-ticket/route.ts: messaggio Postgres grezzo verso il cliente
    // pubblico, ora resta nei log server.
    console.error("api/portale/trova-cliente:", error.message);
    return NextResponse.json({ errore: "Errore imprevisto durante la ricerca — riprova." }, { status: 500 });
  }
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
