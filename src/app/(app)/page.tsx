import Link from "next/link";
import { Ticket, PhoneCall, CalendarDays, HardHat, Plus, ArrowRight, TriangleAlert, Clock, Gauge, CheckCircle2, StickyNote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, personaHaAccessoAdmin } from "@/lib/persona";
import type { AreaAccesso } from "@/lib/types";

const SLUG_REPARTO: Record<string, string> = {
  "Analisi Rete": "analisi-rete",
  Commerciale: "commerciale",
  Fatturazione: "fatturazione",
};

/**
 * ★ NUOVA — "Mondo Ticket": non solo le porte d'ingresso ma il vero punto
 * di partenza della giornata, centrato sui Ticket (da qui il nome) — KPI
 * di urgenza, un pannello "serve attenzione ora" e una vista filtrata per
 * reparto per chi non ha accesso "Tutto", sullo stesso principio del
 * Centro Operativo del vecchio gestionale.
 */
export default async function MondoTicketPage() {
  const supabase = await createClient();
  const personaCorrente = await getPersonaCorrente(supabase);
  const personaCorrenteId = await getPersonaCorrenteId();
  const isAdmin = personaHaAccessoAdmin(personaCorrente);
  const repartoUtente = !isAdmin ? (personaCorrente?.area_accesso as AreaAccesso | undefined) : undefined;
  const filtratoPerReparto = repartoUtente && SLUG_REPARTO[repartoUtente];

  const oggiInizio = new Date();
  oggiInizio.setHours(0, 0, 0, 0);
  const oggiFine = new Date();
  oggiFine.setHours(23, 59, 59, 999);
  const soglia24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  let queryTicket = supabase
    .from("tickets")
    .select("id, numero, cliente, categoria, stato, priorita, reparto, tecnico_assegnato, data_creazione, aggiornato_il")
    .not("stato", "in", "(Completato,Annullato)");
  if (filtratoPerReparto) queryTicket = queryTicket.eq("reparto", repartoUtente!);

  const [
    { data: ticketAttivi },
    { count: ticketCompletatiOggi },
    { count: segnalazioniDaContattare },
    { count: segnalazioniInGestione },
    { count: appuntamentiOggi },
    { count: mieiTicketOggi },
    { data: promemoria },
  ] = await Promise.all([
    queryTicket,
    supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("stato", "Completato")
      .gte("aggiornato_il", oggiInizio.toISOString())
      .lte("aggiornato_il", oggiFine.toISOString()),
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
  ]);

  const attivi = ticketAttivi ?? [];
  const urgenti = attivi.filter((t) => t.priorita === "Urgente");
  const nonPresi = attivi.filter((t) => !t.tecnico_assegnato);

  // ★ pannello "serve attenzione ora": Urgenti + fermi da oltre 24h senza
  // nessuno assegnato — la stessa lista che nel vecchio gestionale evitava
  // di dover aprire la bacheca solo per capire cosa è rimasto indietro.
  const serveAttenzione = attivi
    .filter((t) => t.priorita === "Urgente" || (!t.tecnico_assegnato && new Date(t.data_creazione) < soglia24h))
    .sort((a, b) => {
      if (a.priorita === "Urgente" && b.priorita !== "Urgente") return -1;
      if (b.priorita === "Urgente" && a.priorita !== "Urgente") return 1;
      return new Date(a.data_creazione).getTime() - new Date(b.data_creazione).getTime();
    })
    .slice(0, 8);

  const linkDashboard = isAdmin ? "/dashboard" : filtratoPerReparto ? `/dashboard/${filtratoPerReparto}` : null;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold tracking-tight">Mondo Ticket</h1>
        {linkDashboard && (
          <Link href={linkDashboard} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            <Gauge className="h-3.5 w-3.5" strokeWidth={2.5} />
            {isAdmin ? "Dashboard generale" : `Dashboard ${repartoUtente}`}
          </Link>
        )}
      </div>
      <p className="mb-6 text-muted-foreground">
        {filtratoPerReparto ? `Il colpo d'occhio sul reparto ${repartoUtente}.` : "Il colpo d'occhio sull'intera azienda."}
      </p>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile icona={TriangleAlert} etichetta="Urgenti" valore={urgenti.length} colore={urgenti.length > 0 ? "text-critical" : "text-muted-foreground"} />
        <KpiTile icona={Clock} etichetta="Non presi in carico" valore={nonPresi.length} colore={nonPresi.length > 0 ? "text-warning" : "text-muted-foreground"} />
        <KpiTile icona={Gauge} etichetta="Ticket aperti" valore={attivi.length} colore="text-foreground" />
        <KpiTile icona={CheckCircle2} etichetta="Completati oggi" valore={ticketCompletatiOggi ?? 0} colore="text-success" />
      </div>

      {serveAttenzione.length > 0 && (
        <div className="mb-8 rounded-2xl border bg-card p-5 shadow-md">
          <h2 className="mb-3 font-heading text-sm font-bold">Serve attenzione ora</h2>
          <div className="flex flex-col gap-1.5">
            {serveAttenzione.map((t) => (
              <Link
                key={t.id}
                href={`/tickets?aperto=${t.id}`}
                className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition hover:bg-muted/60"
              >
                <span className="truncate">
                  <span className="font-mono text-xs text-muted-foreground">#{t.numero}</span> — {t.cliente}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {t.priorita === "Urgente" && (
                    <span className="rounded-full bg-critical/10 px-2 py-0.5 text-[10.5px] font-bold uppercase text-critical">Urgente</span>
                  )}
                  {!filtratoPerReparto && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">{t.reparto}</span>
                  )}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

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

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <AreaCard
          href="/tickets"
          icona={Ticket}
          titolo="Ticket"
          descrizione="Assistenza, pratiche commerciali e amministrative."
          numero={attivi.length}
          etichettaNumero="aperti"
          hrefNuovo="/tickets/nuovo"
          etichettaNuovo="Nuovo Ticket"
        />
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
    <div className="rounded-2xl border bg-card p-4 shadow-md">
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
    <div className="group flex flex-col justify-between rounded-2xl border bg-card p-5 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40">
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
