import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { nomeFileSicuro } from "@/lib/nome-file-sicuro";
import { creaLimitatoreTentativi, ipRichiesta } from "@/lib/rate-limit-portale";

/** ★ FIX — i 4 allegati (documento + tessera sanitaria) caricati insieme
 * superavano il limite di ~4.5MB del corpo delle funzioni Vercel quando
 * passavano dentro /api/richiesta-dati. Questa rotta genera solo un signed
 * upload URL (poche centinaia di byte): il file vero viene poi caricato dal
 * browser direttamente allo storage Supabase (vedi richiesta-dati-form.tsx),
 * senza mai transitare per il corpo di una richiesta a questa app.
 *
 * ★ FIX (2026-09-18, audit Portale/Richiesta Dati, Bug Critico confermato)
 * — a differenza di OGNI altra rotta pubblica mutante del gruppo
 * (apri-ticket, trova-cliente, verifica-stato, richiesta-dati,
 * richiesta-cliente), questa non aveva alcun limite di tentativi: uno
 * script poteva chiamarla in loop illimitato ottenendo ad ogni chiamata un
 * signed upload URL valido, caricando file arbitrari nel bucket "documenti"
 * anche sotto una `segnalazioneId` inventata — costo di storage/egress a
 * carico dell'azienda, nessun freno. */
const troppiTentativi = creaLimitatoreTentativi(15, 5 * 60 * 1000);

export async function POST(request: NextRequest) {
  const ip = ipRichiesta(request);
  if (troppiTentativi(ip)) {
    return NextResponse.json({ errore: "Troppi tentativi. Riprova tra qualche minuto." }, { status: 429 });
  }

  // ★ FIX (2026-08-27, trovato in un giro di test pre-lancio) — corpo
  // non-JSON → 500 invece di un errore pulito. Vedi lo stesso fix in
  // api/portale/apri-ticket/route.ts.
  const corpo = await request.json().catch(() => ({}) as Record<string, unknown>);
  const segnalazioneId = String(corpo.segnalazioneId || "");
  const nomeFile = String(corpo.nomeFile || "");
  if (!segnalazioneId || !nomeFile) {
    return NextResponse.json({ errore: "Richiesta non valida." }, { status: 400 });
  }

  const supabase = createServiceClient();
  // ★ FIX (2026-09-18, audit Portale/Richiesta Dati) — `segnalazioneId` non
  // era mai verificato contro un record esistente: si poteva ottenere un
  // signed upload URL valido anche per una segnalazione inventata,
  // caricando file sotto qualunque percorso a piacere nel bucket.
  const { data: segnalazione } = await supabase.from("segnalazioni").select("id").eq("id", segnalazioneId).maybeSingle();
  if (!segnalazione) {
    return NextResponse.json({ errore: "Richiesta non valida." }, { status: 400 });
  }
  // ★ FIX (2026-09-17, code review approfondita) — mancava rispetto alle
  // rotte gemelle chat/tickets: un nome con spazi/accenti (es. "Carta
  // d'identità.jpg", comunissimo qui) poteva far fallire l'upload.
  const percorso = `${segnalazioneId}/${Date.now()}-${nomeFileSicuro(nomeFile)}`;
  const { data, error } = await supabase.storage.from("documenti").createSignedUploadUrl(percorso);
  if (error || !data) {
    // ★ FIX (2026-08-31, controllo d'oro usabilità) — il messaggio grezzo di
    // Supabase Storage (es. "bucket not found") arrivava al cliente proprio
    // durante il caricamento del documento d'identità — dettaglio tecnico
    // inutile per chi non conosce il gestionale, ora resta nei log server.
    console.error("api/richiesta-dati/upload-url:", error?.message);
    return NextResponse.json({ errore: "Errore imprevisto durante la preparazione del caricamento — riprova." }, { status: 500 });
  }

  return NextResponse.json({ percorso: data.path, token: data.token });
}
