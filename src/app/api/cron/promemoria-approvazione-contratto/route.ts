import { NextResponse, type NextRequest } from "next/server";
import { verificaRichiestaCron } from "@/lib/cron";
import { createServiceClient } from "@/lib/supabase/server";
import { inviaMessaggioChatSistema } from "@/lib/chat";

// ★ NUOVA — un contratto inviato per approvazione (vedi
// inviaEmailApprovazioneContratto() in segnalazioni/actions.ts) può restare
// "in attesa" a tempo indefinito se il cliente non clicca mai il link: fino
// ad oggi l'unico modo per accorgersene era aprire ogni singola pratica.
// Non è nel Cron nativo di Vercel (piano Hobby, 2 slot già occupati) —
// stesso schema di /api/cron/controlla-risposte-email: va richiamata da un
// job esterno (cron-job.org), una volta al giorno.
export const maxDuration = 30;

const SOGLIA_PRIMO_PROMEMORIA_ORE = 72; // 3 giorni dall'invio, prima di sollecitare
const SOGLIA_RIPETI_PROMEMORIA_ORE = 24; // non più di un promemoria al giorno per pratica

export async function GET(request: NextRequest) {
  const nonAutorizzato = verificaRichiestaCron(request);
  if (nonAutorizzato) return nonAutorizzato;

  const service = createServiceClient();
  const sogliaInvio = new Date(Date.now() - SOGLIA_PRIMO_PROMEMORIA_ORE * 60 * 60 * 1000).toISOString();

  const { data: inSospeso, error } = await service
    .from("segnalazioni")
    .select("id, numero, nome, contratto_inviato_approvazione_il, ultimo_promemoria_approvazione_il")
    .not("contratto_inviato_approvazione_il", "is", null)
    .is("contratto_approvato_cliente_il", null)
    .lte("contratto_inviato_approvazione_il", sogliaInvio);
  if (error) return NextResponse.json({ errore: error.message }, { status: 500 });

  const sogliaRipeti = Date.now() - SOGLIA_RIPETI_PROMEMORIA_ORE * 60 * 60 * 1000;
  const daSollecitare = (inSospeso ?? []).filter(
    (s) => !s.ultimo_promemoria_approvazione_il || new Date(s.ultimo_promemoria_approvazione_il).getTime() < sogliaRipeti
  );

  for (const s of daSollecitare) {
    const giorni = Math.floor((Date.now() - new Date(s.contratto_inviato_approvazione_il as string).getTime()) / (1000 * 60 * 60 * 24));
    await inviaMessaggioChatSistema(
      "Commerciale",
      `⏳ Contratto in attesa di approvazione da ${giorni} giorni: ${s.nome} (Segnalazione #${s.numero}). Valuta se risollecitare il cliente.`
    );
    await service.from("segnalazioni").update({ ultimo_promemoria_approvazione_il: new Date().toISOString() }).eq("id", s.id);
  }

  return NextResponse.json({ ok: true, sollecitate: daSollecitare.length });
}
