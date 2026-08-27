import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { trasmettiPerInstallazioneAutomatico } from "@/app/(app)/segnalazioni/actions";
import { notificaSuTuttiICanali } from "@/lib/notifiche-interne";
import { REPARTO_PER_TIPO_RICHIESTA } from "@/lib/types";

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
    const { data: preventivo, error } = await supabase
      .from("preventivi")
      .update({ stato: nuovoStato, risposto_il: adesso, aggiornato_il: adesso })
      .eq("id", riga.preventivo_id)
      .select("numero, cliente_nome, totale")
      .single();
    if (error) return NextResponse.json({ errore: error.message }, { status: 500 });

    await supabase.from("storico").insert({
      origine: "preventivo",
      riferimento_id: riga.preventivo_id,
      operazione: nuovoStato === "Approvato" ? "Preventivo approvato dal cliente" : "Preventivo rifiutato dal cliente",
      valore_dopo: `${nuovoStato} via link email il ${adesso}`,
    });

    // ★ NUOVA (2026-08-27, "fai la A" — Proposta A dell'artifact
    // "Estensione Notifiche") — prima NESSUN avviso qui, solo la riga di
    // Storico sopra (che nessuno guarda attivamente): uno dei "buchi"
    // trovati nell'audit, il cliente decide da solo e lo staff non lo
    // scopriva finché non riapriva per caso il Preventivo.
    if (preventivo) {
      const esito = nuovoStato === "Approvato" ? "approvato" : "rifiutato";
      await notificaSuTuttiICanali({
        reparto: "Commerciale",
        telegramHtml: `${nuovoStato === "Approvato" ? "✅" : "❌"} <b>Preventivo ${esito} dal cliente</b>\n\n#${preventivo.numero} — ${preventivo.cliente_nome}`,
        chatTesto: `${nuovoStato === "Approvato" ? "✅" : "❌"} Preventivo #${preventivo.numero} ${esito} da ${preventivo.cliente_nome}.`,
        emailTitolo: `Preventivo #${preventivo.numero} ${esito} dal cliente`,
        emailCorpoHtml: `<p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Il cliente <b>${preventivo.cliente_nome}</b> ha ${esito} il Preventivo #${preventivo.numero}.</p>`,
        emailCorpoTesto: `Il cliente ${preventivo.cliente_nome} ha ${esito} il Preventivo #${preventivo.numero}.`,
        emailLink: "https://gestione.donewifi.it/preventivi",
      });
    }
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
      .select("id, ticket_id, tipo")
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

    // ★ NUOVA (2026-08-27, "fai la A" — Proposta A dell'artifact
    // "Estensione Notifiche") — prima NESSUN avviso qui: la conferma del
    // cliente restava visibile solo aprendo la scheda a mano (vedi
    // SchedaVista, "Conferma cliente").
    if (scheda.ticket_id) {
      const { data: ticket } = await supabase.from("tickets").select("cliente, numero, reparto").eq("id", scheda.ticket_id).maybeSingle();
      if (ticket) {
        await notificaSuTuttiICanali({
          reparto: ticket.reparto,
          telegramHtml: `✅ <b>Scheda confermata dal cliente</b>\n\nTicket #${ticket.numero} — ${ticket.cliente} (${scheda.tipo}).`,
          chatTesto: `✅ Scheda confermata dal cliente — Ticket #${ticket.numero} (${ticket.cliente}).`,
          emailTitolo: `Scheda confermata dal cliente — Ticket #${ticket.numero}`,
          emailCorpoHtml: `<p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Il cliente <b>${ticket.cliente}</b> ha confermato la scheda del Ticket #${ticket.numero}.</p>`,
          emailCorpoTesto: `Il cliente ${ticket.cliente} ha confermato la scheda del Ticket #${ticket.numero}.`,
          emailLink: `https://gestione.donewifi.it/tickets?aperto=${scheda.ticket_id}`,
        });
      }
    }
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

    // ★ NUOVA (2026-08-27, "fai la A" — Proposta A dell'artifact
    // "Estensione Notifiche") — prima NESSUN avviso qui, stesso buco del
    // ramo "firma_scheda" sopra.
    {
      const { data: ticket } = await supabase.from("tickets").select("cliente, numero, reparto").eq("id", riga.ticket_id).maybeSingle();
      if (ticket) {
        await notificaSuTuttiICanali({
          reparto: ticket.reparto,
          telegramHtml: `✅ <b>Rapportino confermato dal cliente</b>\n\nTicket #${ticket.numero} — ${ticket.cliente}.`,
          chatTesto: `✅ Rapportino confermato dal cliente — Ticket #${ticket.numero} (${ticket.cliente}).`,
          emailTitolo: `Rapportino confermato dal cliente — Ticket #${ticket.numero}`,
          emailCorpoHtml: `<p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Il cliente <b>${ticket.cliente}</b> ha confermato il rapportino del Ticket #${ticket.numero}.</p>`,
          emailCorpoTesto: `Il cliente ${ticket.cliente} ha confermato il rapportino del Ticket #${ticket.numero}.`,
          emailLink: `https://gestione.donewifi.it/tickets?aperto=${riga.ticket_id}`,
        });
      }
    }
  } else if (riga.origine === "subentro_vecchio_cliente" && riga.richiesta_cliente_id) {
    // ★ NUOVA (2026-08) — Sistema Subentro, traccia del vecchio cliente
    // (Opzione B, doppio consenso in parallelo): a differenza di
    // "contratto" qui non si tocca lo stato della pratica (resta gestita
    // dallo staff in Richieste Clienti) — si registra solo QUANDO e SE il
    // vecchio cliente ha confermato o rifiutato, indipendentemente da
    // quello che sta facendo (o ha già fatto) il nuovo cliente.
    const adesso = new Date().toISOString();
    const campo = azione === "rifiuta" ? "vecchio_cliente_rifiutato_il" : "vecchio_cliente_confermato_il";
    const { data: richiesta, error } = await supabase
      .from("richieste_clienti")
      .update({ [campo]: adesso })
      .eq("id", riga.richiesta_cliente_id)
      .select("cliente")
      .single();
    if (error) return NextResponse.json({ errore: error.message }, { status: 500 });

    await supabase.from("storico").insert({
      origine: "richiesta_cliente",
      riferimento_id: riga.richiesta_cliente_id,
      operazione: azione === "rifiuta" ? "Subentro — cessione NON confermata dal vecchio cliente" : "Subentro — cessione confermata dal vecchio cliente",
      valore_dopo: `${azione === "rifiuta" ? "Rifiutata" : "Confermata"} via link email il ${adesso}`,
    });

    // ★ NUOVA (2026-08-27, "fai la A" — Proposta A dell'artifact
    // "Estensione Notifiche") — prima NESSUN avviso qui, solo Storico.
    if (richiesta) {
      const esito = azione === "rifiuta" ? "NON confermata" : "confermata";
      const reparto = REPARTO_PER_TIPO_RICHIESTA.Subentro;
      await notificaSuTuttiICanali({
        reparto,
        telegramHtml: `${azione === "rifiuta" ? "❌" : "✅"} <b>Subentro — cessione ${esito}</b>\n\nIl vecchio cliente${richiesta.cliente ? ` (${richiesta.cliente})` : ""} ha risposto.`,
        chatTesto: `${azione === "rifiuta" ? "❌" : "✅"} Subentro — cessione ${esito} dal vecchio cliente${richiesta.cliente ? ` (${richiesta.cliente})` : ""}.`,
        emailTitolo: `Subentro — cessione ${esito}`,
        emailCorpoHtml: `<p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Il vecchio cliente${richiesta.cliente ? ` <b>${richiesta.cliente}</b>` : ""} ha ${esito === "confermata" ? "confermato" : "rifiutato"} la cessione (Subentro).</p>`,
        emailCorpoTesto: `Il vecchio cliente${richiesta.cliente ? ` ${richiesta.cliente}` : ""} ha ${esito === "confermata" ? "confermato" : "rifiutato"} la cessione (Subentro).`,
        emailLink: "https://gestione.donewifi.it/richieste-clienti",
      });
    }
  } else if (riga.ticket_id) {
    const { data: ticket, error } = await supabase
      .from("tickets")
      .update({ confermato_cliente_il: new Date().toISOString() })
      .eq("id", riga.ticket_id)
      .select("cliente, numero, reparto")
      .single();
    if (error) return NextResponse.json({ errore: error.message }, { status: 500 });

    // ★ NUOVA (2026-08-27, "fai la A" — Proposta A dell'artifact
    // "Estensione Notifiche") — prima NESSUN avviso qui: la conferma di
    // un intervento risolto da remoto restava visibile solo aprendo il
    // Ticket a mano.
    if (ticket) {
      await notificaSuTuttiICanali({
        reparto: ticket.reparto,
        telegramHtml: `✅ <b>Intervento confermato dal cliente</b>\n\nTicket #${ticket.numero} — ${ticket.cliente}.`,
        chatTesto: `✅ Intervento confermato dal cliente — Ticket #${ticket.numero} (${ticket.cliente}).`,
        emailTitolo: `Intervento confermato dal cliente — Ticket #${ticket.numero}`,
        emailCorpoHtml: `<p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Il cliente <b>${ticket.cliente}</b> ha confermato che l'intervento risolto da remoto (Ticket #${ticket.numero}) funziona correttamente.</p>`,
        emailCorpoTesto: `Il cliente ${ticket.cliente} ha confermato che l'intervento risolto da remoto (Ticket #${ticket.numero}) funziona correttamente.`,
        emailLink: `https://gestione.donewifi.it/tickets?aperto=${riga.ticket_id}`,
      });
    }
  } else {
    return NextResponse.json({ errore: "Link non valido." }, { status: 404 });
  }

  // ★ monouso: cancellato subito dopo l'uso, come il vecchio token in PropertiesService.
  await supabase.from("token_approvazione").delete().eq("token", token);

  return NextResponse.json({ ok: true, azione });
}
