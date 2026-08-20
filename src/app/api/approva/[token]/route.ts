import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { trasmettiPerInstallazioneAutomatico } from "@/app/(app)/segnalazioni/actions";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // ★ intervento/contratto non mandano mai un corpo (nessuna scelta da
  // fare) — .json() su un corpo vuoto lancerebbe, quindi si ripiega su un
  // oggetto vuoto invece di far fallire l'intera richiesta per loro.
  const corpo = await request.json().catch(() => ({}) as { azione?: string });
  const azione = corpo.azione === "rifiuta" ? "rifiuta" : "approva";
  const supabase = createServiceClient();

  const { data: riga } = await supabase
    .from("token_approvazione")
    .select("ticket_id, segnalazione_id, preventivo_id, appuntamento_id, richiesta_cliente_id, origine, creato_il")
    .eq("token", token)
    .maybeSingle();
  if (!riga) {
    return NextResponse.json({ errore: "Questo link di approvazione è scaduto o è già stato usato." }, { status: 404 });
  }

  // ★ FIX — il token era monouso (cancellato all'uso, corretto) ma senza
  // scadenza temporale: un'email di conferma dimenticata in una vecchia
  // casella restava valida per sempre. 30 giorni è ampiamente sufficiente
  // per confermare un intervento/contratto/preventivo appena inviato.
  const SCADENZA_MS = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - new Date(riga.creato_il).getTime() > SCADENZA_MS) {
    await supabase.from("token_approvazione").delete().eq("token", token);
    return NextResponse.json({ errore: "Questo link di approvazione è scaduto. Contatta Done Wifi per assistenza." }, { status: 410 });
  }

  // ★ NUOVA — terzo riferimento possibile (vedi token_approvazione.origine,
  // migrazione 0047): unico caso con due esiti, il cliente può anche
  // rifiutare esplicitamente invece di limitarsi ad approvare.
  if (riga.origine === "preventivo" && riga.preventivo_id) {
    const adesso = new Date().toISOString();
    const nuovoStato = azione === "rifiuta" ? "Rifiutato" : "Approvato";
    const { error } = await supabase
      .from("preventivi")
      .update({ stato: nuovoStato, risposto_il: adesso, aggiornato_il: adesso })
      .eq("id", riga.preventivo_id);
    if (error) return NextResponse.json({ errore: error.message }, { status: 500 });

    await supabase.from("storico").insert({
      origine: "preventivo",
      riferimento_id: riga.preventivo_id,
      operazione: nuovoStato === "Approvato" ? "Preventivo approvato dal cliente" : "Preventivo rifiutato dal cliente",
      valore_dopo: `${nuovoStato} via link email il ${adesso}`,
    });
  } else if (riga.origine === "contratto" && riga.segnalazione_id) {
    const adesso = new Date().toISOString();
    const { error } = await supabase
      .from("segnalazioni")
      .update({ contratto_approvato_cliente_il: adesso })
      .eq("id", riga.segnalazione_id);
    if (error) return NextResponse.json({ errore: error.message }, { status: 500 });

    // ★ la voce di storico è la "prova" richiesta nella pratica: data/ora
    // dell'approvazione e che è arrivata da questo stesso link inviato solo
    // all'email del cliente (nessun operatore umano l'ha cliccato).
    await supabase.from("storico").insert({
      origine: "segnalazione",
      riferimento_id: riga.segnalazione_id,
      operazione: "Contratto approvato dal cliente",
      valore_dopo: `Approvato via link email il ${adesso}`,
    });

    // ★ NUOVA — richiesta esplicita: l'approvazione da sola non basta più a
    // lasciare la pratica "in Gestione Cliente" in attesa che un operatore
    // se ne accorga e clicchi Trasmetti a mano — vedi
    // trasmettiPerInstallazioneAutomatico() per i dettagli (non blocca né
    // fa fallire questa risposta se qualcosa manca ancora).
    await trasmettiPerInstallazioneAutomatico(riga.segnalazione_id);
  } else if (riga.origine === "firma_scheda" && riga.appuntamento_id) {
    // ★ NUOVA — fallback della firma cliente sulla Scheda di Installazione/
    // Lavorazione (vedi migrazione 0050): a differenza degli altri tre casi
    // qui non c'è un ticket_id/segnalazione_id/preventivo_id diretto sul
    // token, si referenzia l'appuntamento perché la scheda potrebbe non
    // esistere ancora quando il link è stato inviato (si salva solo al
    // submit finale del wizard) — si aggiorna la scheda più recente per
    // quell'appuntamento, se nel frattempo il tecnico l'ha completata.
    const { data: scheda } = await supabase
      .from("schede_lavoro")
      .select("id")
      .eq("appuntamento_id", riga.appuntamento_id)
      .order("creato_il", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!scheda) {
      return NextResponse.json(
        { errore: "Il tecnico non ha ancora completato la scheda — riprova tra qualche minuto." },
        { status: 409 }
      );
    }
    const { error } = await supabase
      .from("schede_lavoro")
      .update({ firma_cliente_verificato_il: new Date().toISOString() })
      .eq("id", scheda.id);
    if (error) return NextResponse.json({ errore: error.message }, { status: 500 });
  } else if (riga.origine === "firma_rapportino" && riga.ticket_id) {
    // ★ NUOVA — fallback della firma cliente sul Rapportino di chiusura
    // Ticket (vedi migrazione 0051): a differenza di "firma_scheda" qui il
    // riferimento è direttamente il ticket_id, non un appuntamento — il
    // Rapportino non è mai legato a un appuntamento.
    const { data: rapportino } = await supabase
      .from("rapportini_intervento")
      .select("id")
      .eq("ticket_id", riga.ticket_id)
      .order("creato_il", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!rapportino) {
      return NextResponse.json(
        { errore: "Il tecnico non ha ancora completato il rapportino — riprova tra qualche minuto." },
        { status: 409 }
      );
    }
    const { error } = await supabase
      .from("rapportini_intervento")
      .update({ firma_verificato_il: new Date().toISOString() })
      .eq("id", rapportino.id);
    if (error) return NextResponse.json({ errore: error.message }, { status: 500 });
  } else if (riga.origine === "subentro_vecchio_cliente" && riga.richiesta_cliente_id) {
    // ★ NUOVA (2026-08) — Sistema Subentro, traccia del vecchio cliente
    // (Opzione B, doppio consenso in parallelo): a differenza di
    // "contratto" qui non si tocca lo stato della pratica (resta gestita
    // dallo staff in Richieste Clienti) — si registra solo QUANDO e SE il
    // vecchio cliente ha confermato o rifiutato, indipendentemente da
    // quello che sta facendo (o ha già fatto) il nuovo cliente.
    const adesso = new Date().toISOString();
    const campo = azione === "rifiuta" ? "vecchio_cliente_rifiutato_il" : "vecchio_cliente_confermato_il";
    const { error } = await supabase.from("richieste_clienti").update({ [campo]: adesso }).eq("id", riga.richiesta_cliente_id);
    if (error) return NextResponse.json({ errore: error.message }, { status: 500 });

    await supabase.from("storico").insert({
      origine: "richiesta_cliente",
      riferimento_id: riga.richiesta_cliente_id,
      operazione: azione === "rifiuta" ? "Subentro — cessione NON confermata dal vecchio cliente" : "Subentro — cessione confermata dal vecchio cliente",
      valore_dopo: `${azione === "rifiuta" ? "Rifiutata" : "Confermata"} via link email il ${adesso}`,
    });
  } else if (riga.ticket_id) {
    const { error } = await supabase
      .from("tickets")
      .update({ confermato_cliente_il: new Date().toISOString() })
      .eq("id", riga.ticket_id);
    if (error) return NextResponse.json({ errore: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ errore: "Link non valido." }, { status: 404 });
  }

  // ★ monouso: cancellato subito dopo l'uso, come il vecchio token in PropertiesService.
  await supabase.from("token_approvazione").delete().eq("token", token);

  return NextResponse.json({ ok: true, azione });
}
