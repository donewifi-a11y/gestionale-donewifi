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

  // ★ NUOVA (2026-09-17, "controllo d'oro" completo — priorità 1) — stesso
  // identico principio, ma per i contratti di Subentro e Trasferimento
  // (vedi richieste-clienti/actions.ts): prima solo le Segnalazioni
  // avevano un promemoria, un contratto di queste due pratiche poteva
  // restare "in attesa" per sempre senza che nessuno se ne accorgesse.
  // Due colonne diverse per l'esito ("nuovo cliente" per Subentro, un
  // solo cliente per Trasferimento — vedi il commento sulla migrazione
  // 0077), un'unica query con `.or()` invece di due query quasi identiche.
  const { data: praticheInSospeso, error: erroreRichieste } = await service
    .from("richieste_clienti")
    .select("id, cliente, tipo_richiesta, contratto_inviato_approvazione_il, ultimo_promemoria_approvazione_il, contratto_approvato_nuovo_cliente_il, contratto_approvato_cliente_il")
    .in("tipo_richiesta", ["Subentro", "Trasferimento", "Cambio IBAN", "Cambio Anagrafica"])
    .not("contratto_inviato_approvazione_il", "is", null)
    .lte("contratto_inviato_approvazione_il", sogliaInvio);
  if (erroreRichieste) return NextResponse.json({ errore: erroreRichieste.message }, { status: 500 });

  const praticheDaSollecitare = (praticheInSospeso ?? []).filter((p) => {
    const approvato = p.tipo_richiesta === "Subentro" ? p.contratto_approvato_nuovo_cliente_il : p.contratto_approvato_cliente_il;
    if (approvato) return false;
    return !p.ultimo_promemoria_approvazione_il || new Date(p.ultimo_promemoria_approvazione_il).getTime() < sogliaRipeti;
  });

  for (const p of praticheDaSollecitare) {
    const giorni = Math.floor((Date.now() - new Date(p.contratto_inviato_approvazione_il as string).getTime()) / (1000 * 60 * 60 * 24));
    await inviaMessaggioChatSistema(
      "Commerciale",
      `⏳ Contratto di ${p.tipo_richiesta} in attesa di approvazione da ${giorni} giorni: ${p.cliente ?? "cliente"}. Valuta se risollecitare.`
    );
    await service.from("richieste_clienti").update({ ultimo_promemoria_approvazione_il: new Date().toISOString() }).eq("id", p.id);
  }

  return NextResponse.json({ ok: true, sollecitate: daSollecitare.length, sollecitatePratiche: praticheDaSollecitare.length });
}
