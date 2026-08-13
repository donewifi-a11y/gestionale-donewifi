import Link from "next/link";
import { Ticket, PhoneCall, CalendarDays, HardHat, Plus, ArrowRight, TriangleAlert, Clock, Gauge, CheckCircle2, StickyNote, Wifi, Handshake, Receipt, Inbox, FileCheck2, FileSignature } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, personaHaAccessoAdmin } from "@/lib/persona";
import { REPARTI_ELENCO } from "@/lib/analytics";
import { ChatPanel } from "@/components/chat/chat-panel";
import { TodoPanel } from "@/components/todo/todo-panel";
import type { AreaAccesso } from "@/lib/types";

const SLUG_REPARTO: Record<string, string> = {
  "Analisi Rete": "analisi-rete",
  Commerciale: "commerciale",
  Fatturazione: "fatturazione",
};

const ICONA_REPARTO: Record<string, typeof Wifi> = {
  "Analisi Rete": Wifi,
  Commerciale: Handshake,
  Fatturazione: Receipt,
};

function etichettaReparti(reparti: AreaAccesso[]): string {
  return reparti.join(" e ");
}

interface TicketRiga {
  id: string;
  numero: number;
  cliente: string;
  categoria: string;
  stato: string;
  priorita: string;
  reparto: AreaAccesso;
  tecnico_assegnato: string | null;
  data_creazione: string;
  aggiornato_il: string;
}

/**
 * ★ NUOVA — "Mondo Ticket": non solo le porte d'ingresso ma il vero punto
 * di partenza della giornata, centrato sui Ticket (da qui il nome) — KPI
 * di urgenza, un pannello "serve attenzione ora" e una vista filtrata per
 * reparto per chi non ha accesso "Tutto", sullo stesso principio del
 * Centro Operativo del vecchio gestionale.
 *
 * ★ RIORGANIZZATA per settore (2026-08): invece di un'unica striscia di
 * KPI aggregata su tutta l'azienda, i Ticket sono raggruppati in una
 * colonna per settore (Analisi Rete/Commerciale/Fatturazione) — ognuna
 * con i propri numeri e il proprio "serve attenzione ora". Chi ha un
 * solo settore vede solo la sua colonna, un admin le vede tutte
 * affiancate. Segnalazioni/Calendario/Vista Tecnico restano moduli
 * condivisi sotto: non hanno un reparto proprio nei dati.
 */
export default async function MondoTicketPage() {
  const supabase = await createClient();
  const personaCorrente = await getPersonaCorrente(supabase);
  const personaCorrenteId = await getPersonaCorrenteId();
  const isAdmin = personaHaAccessoAdmin(personaCorrente);
  const repartiUtente: AreaAccesso[] = !isAdmin ? personaCorrente?.reparti ?? [] : [];
  const filtratoPerReparto = repartiUtente.length > 0;
  const repartiVisibili = isAdmin ? REPARTI_ELENCO : REPARTI_ELENCO.filter((r) => repartiUtente.includes(r));
  // ★ NUOVA — richiesta esplicita: "quando un cliente invia documentazione
  // e approva preventivi e contratti" deve cadere all'occhio in prima
  // pagina, per i settori competenti — oggi lo si scopriva solo aprendo
  // Richieste Clienti/Segnalazioni/Preventivi a parte. Stessa visibilità
  // già usata per quelle sezioni in sidebar (vedeRichieste in
  // app-sidebar.tsx): moduli cliente e contratti sono commerciale/
  // fatturazione, Analisi Rete non li vede.
  const vedeNovitaClienti = isAdmin || repartiUtente.includes("Commerciale") || repartiUtente.includes("Fatturazione");

  const oggiInizio = new Date();
  oggiInizio.setHours(0, 0, 0, 0);
  const oggiFine = new Date();
  oggiFine.setHours(23, 59, 59, 999);
  const soglia24h = new Date();
  soglia24h.setTime(soglia24h.getTime() - 24 * 60 * 60 * 1000);

  let queryTicket = supabase
    .from("tickets")
    .select("id, numero, cliente, categoria, stato, priorita, reparto, tecnico_assegnato, data_creazione, aggiornato_il")
    .not("stato", "in", "(Completato,Annullato)");
  if (filtratoPerReparto) queryTicket = queryTicket.in("reparto", repartiUtente);

  let queryCompletatiOggi = supabase
    .from("tickets")
    .select("id, reparto")
    .eq("stato", "Completato")
    .gte("aggiornato_il", oggiInizio.toISOString())
    .lte("aggiornato_il", oggiFine.toISOString());
  if (filtratoPerReparto) queryCompletatiOggi = queryCompletatiOggi.in("reparto", repartiUtente);

  const settimanaFa = new Date();
  settimanaFa.setDate(settimanaFa.getDate() - 7);

  const [
    { data: ticketAttivi },
    { data: completatiOggiRighe },
    { count: segnalazioniDaContattare },
    { count: segnalazioniInGestione },
    { count: appuntamentiOggi },
    { count: mieiTicketOggi },
    { data: promemoria },
    { data: richiesteDaLavorare },
    { data: contrattiApprovatiDaTrasmettere },
    { data: preventiviRisposti },
  ] = await Promise.all([
    queryTicket,
    queryCompletatiOggi,
    supabase.from("segnalazioni").select("*", { count: "exact", head: true }).eq("stato", "Da Contattare"),
    supabase.from("segnalazioni").select("*", { count: "exact", head: true }).eq("stato", "Gestione Cliente"),
    supabase
      .from("appuntamenti")
      .select("*", { count: "exact", head: true })
      .eq("stato", "Programmato")
      .gte("data_ora", oggiInizio.toISOString())
      .lte("data_ora", oggiFine.toISOString()),
    personaCorrenteId
      ? supabase
          .from("tickets")
          .select("*", { count: "exact", head: true })
          .eq("tecnico_assegnato", personaCorrenteId)
          .not("stato", "in", "(Completato,Annullato)")
      : Promise.resolve({ count: 0 }),
    supabase
      .from("note_calendario")
      .select("id, testo, data_promemoria")
      .eq("completata", false)
      .lte("data_promemoria", oggiFine.toISOString().slice(0, 10))
      .order("data_promemoria", { ascending: true }),
    vedeNovitaClienti
      ? supabase
          .from("richieste_clienti")
          .select("id, tipo_richiesta, cliente, ticket_id, segnalazione_id, data")
          .eq("stato", "Da Lavorare")
          .order("data", { ascending: false })
      : Promise.resolve({ data: [] }),
    vedeNovitaClienti
      ? supabase
          .from("segnalazioni")
          .select("id, numero, nome, contratto_approvato_cliente_il")
          .eq("stato", "Gestione Cliente")
          .not("contratto_approvato_cliente_il", "is", null)
          .order("contratto_approvato_cliente_il", { ascending: false })
      : Promise.resolve({ data: [] }),
    vedeNovitaClienti
      ? supabase
          .from("preventivi")
          .select("id, numero, cliente_nome, stato, risposto_il")
          .in("stato", ["Approvato", "Rifiutato"])
          .gte("risposto_il", settimanaFa.toISOString())
          .order("risposto_il", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const attivi = (ticketAttivi ?? []) as TicketRiga[];
  const completatiOggi = completatiOggiRighe ?? [];

  // ★ le 3 fonti sopra si combinano in un'unica lista "novità dai
  // clienti", ognuna con un link diretto alla pratica — invece di dover
  // sapere a memoria in quale delle 3 sezioni (Richieste Clienti/
  // Segnalazioni/Preventivi) guardare per scoprire cosa è appena arrivato.
  interface NovitaCliente {
    id: string;
    icona: typeof Inbox;
    testo: string;
    quando: string;
    href: string;
    colore: string;
  }
  const novitaClienti: NovitaCliente[] = [
    ...(richiesteDaLavorare ?? []).map((r): NovitaCliente => ({
      id: `r-${r.id}`,
      icona: Inbox,
      testo: `${r.tipo_richiesta} da ${r.cliente ?? "cliente"}`,
      quando: r.data,
      href: r.ticket_id ? `/tickets?aperto=${r.ticket_id}` : r.segnalazione_id ? `/segnalazioni?aperto=${r.segnalazione_id}` : "/richieste-clienti",
      colore: "text-primary",
    })),
    ...(contrattiApprovatiDaTrasmettere ?? []).map((s): NovitaCliente => ({
      id: `c-${s.id}`,
      icona: FileCheck2,
      testo: `Contratto approvato — ${s.nome} (#${s.numero})`,
      quando: s.contratto_approvato_cliente_il as string,
      href: `/segnalazioni?aperto=${s.id}`,
      colore: "text-success",
    })),
    ...(preventiviRisposti ?? []).map((p): NovitaCliente => ({
      id: `p-${p.id}`,
      icona: FileSignature,
      testo: `Preventivo ${p.stato.toLowerCase()} — ${p.cliente_nome} (#${p.numero})`,
      quando: p.risposto_il as string,
      href: `/preventivi?aperto=${p.id}`,
      colore: p.stato === "Approvato" ? "text-success" : "text-critical",
    })),
  ].sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());

  // ★ pannello "serve attenzione ora" per settore: Urgenti + fermi da oltre
  // 24h senza nessuno assegnato — la stessa lista che nel vecchio
  // gestionale evitava di dover aprire la bacheca solo per capire cosa è
  // rimasto indietro, ora divisa per reparto invece che unica per tutti.
  function datiSettore(reparto: AreaAccesso) {
    const attiviSettore = attivi.filter((t) => t.reparto === reparto);
    const urgenti = attiviSettore.filter((t) => t.priorita === "Urgente");
    const nonPresi = attiviSettore.filter((t) => !t.tecnico_assegnato);
    const completati = completatiOggi.filter((t) => t.reparto === reparto);
    const serveAttenzione = attiviSettore
      .filter((t) => t.priorita === "Urgente" || (!t.tecnico_assegnato && new Date(t.data_creazione) < soglia24h))
      .sort((a, b) => {
        if (a.priorita === "Urgente" && b.priorita !== "Urgente") return -1;
        if (b.priorita === "Urgente" && a.priorita !== "Urgente") return 1;
        return new Date(a.data_creazione).getTime() - new Date(b.data_creazione).getTime();
      })
      .slice(0, 4);
    return { attiviSettore, urgenti, nonPresi, completati, serveAttenzione };
  }

  const linkDashboard = isAdmin
    ? "/dashboard"
    : repartiUtente.length === 1
      ? `/dashboard/${SLUG_REPARTO[repartiUtente[0]]}`
      : repartiUtente.length > 1
        ? "/dashboard"
        : null;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Mondo Ticket</h1>
        {linkDashboard && (
          <Link href={linkDashboard} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            <Gauge className="h-3.5 w-3.5" strokeWidth={2.5} />
            {isAdmin ? "Dashboard generale" : `Dashboard ${etichettaReparti(repartiUtente)}`}
          </Link>
        )}
      </div>
      <p className="mb-6 text-muted-foreground">
        {filtratoPerReparto ? `Il colpo d'occhio sul settore ${etichettaReparti(repartiUtente)}.` : "Il colpo d'occhio sull'intera azienda, settore per settore."}
      </p>

      {vedeNovitaClienti && novitaClienti.length > 0 && (
        <div className="mb-8 rounded-2xl border border-primary/30 bg-primary/5 p-5 shadow-md">
          <h2 className="mb-3 flex items-center gap-1.5 font-heading text-sm font-bold">
            <Inbox className="h-4 w-4 text-primary" strokeWidth={2.25} />
            Novità dai clienti
          </h2>
          <div className="flex flex-col gap-1">
            {novitaClienti.slice(0, 8).map((n) => {
              const Icona = n.icona;
              return (
                <Link
                  key={n.id}
                  href={n.href}
                  className="flex items-center gap-2.5 rounded-lg bg-card px-2.5 py-2 text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <Icona className={`h-4 w-4 shrink-0 ${n.colore}`} strokeWidth={2.25} />
                  <span className="min-w-0 flex-1 truncate">{n.testo}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(n.quando).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.25} />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className={`mb-8 grid grid-cols-1 gap-5 ${repartiVisibili.length >= 3 ? "lg:grid-cols-3" : repartiVisibili.length === 2 ? "md:grid-cols-2" : ""}`}>
        {repartiVisibili.map((reparto) => (
          <SezioneSettore key={reparto} reparto={reparto} dati={datiSettore(reparto)} />
        ))}
      </div>

      {promemoria && promemoria.length > 0 && (
        <div className="mb-8 rounded-2xl border border-warning/30 bg-warning/5 p-5 shadow-md">
          <h2 className="mb-3 flex items-center gap-1.5 font-heading text-sm font-bold">
            <StickyNote className="h-4 w-4 text-warning" strokeWidth={2.25} />
            Promemoria di oggi e scaduti
          </h2>
          <div className="flex flex-col gap-1.5">
            {promemoria.map((n) => (
              <Link
                key={n.id}
                href="/calendario"
                className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition hover:bg-warning/10"
              >
                <span className="truncate">{n.testo}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(`${n.data_promemoria}T00:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ★ NUOVA — chat e to-do personali come riquadri fissi qui invece di
      pulsanti flottanti sempre in vista su ogni pagina ("troppi pulsanti
      in giro", segnalato esplicitamente) — restano comunque richiamabili
      come pop-up da qualunque sezione tramite i due pulsanti in fondo
      alla sidebar. Stesso componente, due contesti diversi. */}
      {personaCorrenteId && (
        <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2">
          <ChatPanel personaCorrenteId={personaCorrenteId} variant="riquadro" />
          <TodoPanel personaCorrenteId={personaCorrenteId} variant="riquadro" />
        </div>
      )}

      <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-wide text-muted-foreground">Strumenti condivisi</h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <AreaCard
          href="/segnalazioni"
          icona={PhoneCall}
          titolo="Segnalazioni"
          descrizione="Nuovi contatti, richiesta dati, contratto."
          numero={segnalazioniDaContattare ?? 0}
          etichettaNumero="da contattare"
          hrefNuovo="/segnalazioni/nuovo"
          etichettaNuovo="Nuova Segnalazione"
          badgeExtra={segnalazioniInGestione ? `${segnalazioniInGestione} in Gestione Cliente` : undefined}
        />
        <AreaCard
          href="/calendario"
          icona={CalendarDays}
          titolo="Calendario"
          descrizione="Appuntamenti e installazioni programmate."
          numero={appuntamentiOggi ?? 0}
          etichettaNumero="oggi"
        />
        {(mieiTicketOggi ?? 0) > 0 && (
          <AreaCard
            href="/vista-tecnico"
            icona={HardHat}
            titolo="Vista Tecnico"
            descrizione="I tuoi ticket assegnati, chiamata e chiusura a un tocco."
            numero={mieiTicketOggi ?? 0}
            etichettaNumero="assegnati a te"
          />
        )}
      </div>
    </div>
  );
}

function SezioneSettore({
  reparto,
  dati,
}: {
  reparto: AreaAccesso;
  dati: { attiviSettore: TicketRiga[]; urgenti: TicketRiga[]; nonPresi: TicketRiga[]; completati: unknown[]; serveAttenzione: TicketRiga[] };
}) {
  const Icona = ICONA_REPARTO[reparto];
  return (
    <div className="flex flex-col gap-4 rounded-2xl border bg-muted p-4 shadow-md">
      <Link href="/tickets" className="group flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <Icona className="h-4 w-4" strokeWidth={2.25} />
        </div>
        <h2 className="font-heading text-base font-bold group-hover:text-primary">{reparto}</h2>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
      </Link>

      <div className="grid grid-cols-2 gap-2.5">
        <KpiTile icona={TriangleAlert} etichetta="Urgenti" valore={dati.urgenti.length} colore={dati.urgenti.length > 0 ? "text-critical" : "text-muted-foreground"} />
        <KpiTile icona={Clock} etichetta="Non presi" valore={dati.nonPresi.length} colore={dati.nonPresi.length > 0 ? "text-warning" : "text-muted-foreground"} />
        <KpiTile icona={Gauge} etichetta="Aperti" valore={dati.attiviSettore.length} colore="text-foreground" />
        <KpiTile
          icona={CheckCircle2}
          etichetta="Completati oggi"
          valore={dati.completati.length}
          colore={dati.completati.length > 0 ? "text-success" : "text-muted-foreground"}
        />
      </div>

      {dati.serveAttenzione.length > 0 ? (
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Serve attenzione ora</div>
          <div className="flex flex-col gap-1">
            {dati.serveAttenzione.map((t) => (
              <Link
                key={t.id}
                href={`/tickets?aperto=${t.id}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-card px-2.5 py-1.5 text-sm shadow-sm transition hover:bg-muted/60"
              >
                <span className="truncate">
                  <span className="font-mono text-xs text-muted-foreground">#{t.numero}</span> — {t.cliente}
                </span>
                {t.priorita === "Urgente" && (
                  <span className="shrink-0 rounded-full bg-critical/10 px-2 py-0.5 text-[10.5px] font-bold uppercase text-critical">Urgente</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground/70">Nessun ticket richiede attenzione immediata.</p>
      )}
    </div>
  );
}

function KpiTile({
  icona: Icona,
  etichetta,
  valore,
  colore,
}: {
  icona: typeof Ticket;
  etichetta: string;
  valore: number;
  colore: string;
}) {
  return (
    // ★ meno risalto delle AreaCard sotto (niente bordo, ombra più
    // leggera, padding ridotto): sono numeri da leggere al volo, non
    // moduli su cui cliccare — la gerarchia visiva deve dirlo prima
    // ancora del contenuto.
    <div className="rounded-2xl bg-card p-3.5 shadow-sm">
      <Icona className={`mb-2 h-4 w-4 ${colore}`} strokeWidth={2.25} />
      <div className={`font-heading text-2xl font-bold tabular-nums ${colore}`}>{valore}</div>
      <div className="text-xs text-muted-foreground">{etichetta}</div>
    </div>
  );
}

function AreaCard({
  href,
  icona: Icona,
  titolo,
  descrizione,
  numero,
  etichettaNumero,
  hrefNuovo,
  etichettaNuovo,
  badgeExtra,
}: {
  href: string;
  icona: typeof Ticket;
  titolo: string;
  descrizione: string;
  numero: number;
  etichettaNumero: string;
  hrefNuovo?: string;
  etichettaNuovo?: string;
  badgeExtra?: string;
}) {
  return (
    // ★ sfondo leggermente marcato (bg-muted) + bordo + ombra più
    // pronunciata delle KpiTile sopra: sono moduli cliccabili, devono
    // "sembrare" superfici interagibili, non solo numeri da leggere.
    <div className="group flex flex-col justify-between rounded-2xl border bg-muted p-5 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40">
      <Link href={href} className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
            <Icona className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
        </div>
        <div>
          <h2 className="font-heading text-lg font-bold">{titolo}</h2>
          <p className="text-sm text-muted-foreground">{descrizione}</p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-heading text-3xl font-bold tabular-nums">{numero}</span>
          <span className="text-xs text-muted-foreground">{etichettaNumero}</span>
          {badgeExtra && (
            <span className="ml-auto rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
              {badgeExtra}
            </span>
          )}
        </div>
      </Link>
      {hrefNuovo && etichettaNuovo && (
        <Link
          href={hrefNuovo}
          className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-sm font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          {etichettaNuovo}
        </Link>
      )}
    </div>
  );
}
