import { NextResponse, type NextRequest } from "next/server";
import { verificaRichiestaCron } from "@/lib/cron";
import { createServiceClient } from "@/lib/supabase/server";
import { inviaMessaggioChatSistemaDiretto } from "@/lib/chat";

// ★ NUOVA — una lavorazione interna (Rete/Ufficio) assegnata da un
// amministratore può restare ferma a tempo indefinito se nessuno se ne
// occupa — fino ad oggi l'unico modo per accorgersene era aprire la
// bacheca Lavorazioni. Non nel Cron nativo di Vercel (piano Hobby, i 2
// slot già occupati) — stesso schema di
// /api/cron/promemoria-approvazione-contratto: va richiamata da un job
// esterno (cron-job.org), una volta al giorno.
//
// ★ Niente scadenza (richiesta esplicita "non metterei tempistiche"): il
// promemoria si basa su quanto tempo è ferma dalla creazione, non su una
// data limite — stesso principio di "Ferma da Ng" già in uso per
// Segnalazioni/Ticket.
export const maxDuration = 30;

const SOGLIA_PRIMO_PROMEMORIA_ORE = 48; // 2 giorni ferma, prima di sollecitare
const SOGLIA_RIPETI_PROMEMORIA_ORE = 24; // non più di un promemoria al giorno per lavorazione

export async function GET(request: NextRequest) {
  const nonAutorizzato = verificaRichiestaCron(request);
  if (nonAutorizzato) return nonAutorizzato;

  const service = createServiceClient();
  const sogliaCreazione = new Date(Date.now() - SOGLIA_PRIMO_PROMEMORIA_ORE * 60 * 60 * 1000).toISOString();

  const { data: ferme, error } = await service
    .from("lavorazioni_interne")
    .select("id, titolo, categoria, assegnato_a, assegnato_da, creato_il, ultimo_promemoria_il")
    .neq("stato", "Fatta")
    .lte("creato_il", sogliaCreazione);
  if (error) return NextResponse.json({ errore: error.message }, { status: 500 });

  const sogliaRipeti = Date.now() - SOGLIA_RIPETI_PROMEMORIA_ORE * 60 * 60 * 1000;
  const daSollecitare = (ferme ?? []).filter(
    (l) => !l.ultimo_promemoria_il || new Date(l.ultimo_promemoria_il).getTime() < sogliaRipeti
  );

  for (const l of daSollecitare) {
    const giorni = Math.floor((Date.now() - new Date(l.creato_il).getTime()) / (1000 * 60 * 60 * 24));
    const testo = `⏳ Lavorazione ${l.categoria} ferma da ${giorni} giorni: "${l.titolo}".`;

    await inviaMessaggioChatSistemaDiretto(l.assegnato_a, `${testo} Falla avanzare o segnala il blocco.`);
    // ★ se l'ha assegnata a se stesso, è già la stessa persona avvisata
    // sopra — evita un secondo messaggio identico nella stessa DM.
    if (l.assegnato_da !== l.assegnato_a) {
      await inviaMessaggioChatSistemaDiretto(l.assegnato_da, `${testo} Assegnata a chi di dovere, ancora ferma.`);
    }

    await service.from("lavorazioni_interne").update({ ultimo_promemoria_il: new Date().toISOString() }).eq("id", l.id);
  }

  return NextResponse.json({ ok: true, sollecitate: daSollecitare.length });
}
