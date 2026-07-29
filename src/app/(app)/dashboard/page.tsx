import { Gauge, TriangleAlert, Clock, CalendarCheck2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

const STATI_TICKET_ORDINE = ["Da gestire", "In lavorazione", "In attesa", "Completato"] as const;
const COLORE_STATO_TICKET: Record<string, string> = {
  "Da gestire": "bg-muted-foreground/40",
  "In lavorazione": "bg-primary",
  "In attesa": "bg-warning",
  Completato: "bg-success",
};

const STATI_SEGN_ORDINE = ["Da Contattare", "In Contatto", "Gestione Cliente", "Trasmessa"] as const;
const COLORE_STATO_SEGN: Record<string, string> = {
  "Da Contattare": "bg-muted-foreground/40",
  "In Contatto": "bg-primary",
  "Gestione Cliente": "bg-warning",
  Trasmessa: "bg-success",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const oggiInizio = new Date();
  oggiInizio.setHours(0, 0, 0, 0);
  const oggiFine = new Date();
  oggiFine.setHours(23, 59, 59, 999);
  const settimanaFa = new Date();
  settimanaFa.setDate(settimanaFa.getDate() - 7);

  const [{ data: tickets }, { data: segnalazioni }, { data: persone }, { count: appuntamentiOggi }] =
    await Promise.all([
      supabase.from("tickets").select("stato, priorita, tecnico_assegnato").neq("stato", "Annullato"),
      supabase.from("segnalazioni").select("stato"),
      supabase.from("persone").select("id, nome").eq("attivo", true),
      supabase
        .from("appuntamenti")
        .select("*", { count: "exact", head: true })
        .eq("stato", "Programmato")
        .gte("data_ora", oggiInizio.toISOString())
        .lte("data_ora", oggiFine.toISOString()),
    ]);

  const listaTicket = tickets ?? [];
  const listaSegnalazioni = segnalazioni ?? [];
  const listaPersone = persone ?? [];

  const ticketUrgenti = listaTicket.filter((t) => t.priorita === "Urgente" && t.stato !== "Completato").length;
  const ticketNonAssegnati = listaTicket.filter((t) => !t.tecnico_assegnato && t.stato !== "Completato").length;

  const conteggioPerStato = <T extends string>(lista: { stato: string }[], ordine: readonly T[]) =>
    ordine.map((s) => ({ stato: s, conteggio: lista.filter((x) => x.stato === s).length }));

  const ticketPerStato = conteggioPerStato(listaTicket, STATI_TICKET_ORDINE);
  const segnalazioniPerStato = conteggioPerStato(listaSegnalazioni, STATI_SEGN_ORDINE);

  const caricoTecnici = listaPersone
    .map((p) => ({
      persona: p,
      conteggio: listaTicket.filter((t) => t.tecnico_assegnato === p.id && t.stato !== "Completato").length,
    }))
    .sort((a, b) => b.conteggio - a.conteggio);

  const maxTicket = Math.max(1, ...ticketPerStato.map((r) => r.conteggio));
  const maxSegn = Math.max(1, ...segnalazioniPerStato.map((r) => r.conteggio));
  const maxCarico = Math.max(1, ...caricoTecnici.map((r) => r.conteggio));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <Gauge className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Il colpo d&apos;occhio sul carico di lavoro di oggi.</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi icona={TriangleAlert} etichetta="Ticket Urgenti" valore={ticketUrgenti} colore="text-critical" />
        <Kpi icona={Clock} etichetta="Non assegnati" valore={ticketNonAssegnati} colore="text-warning" />
        <Kpi icona={CalendarCheck2} etichetta="Appuntamenti oggi" valore={appuntamentiOggi ?? 0} colore="text-primary" />
        <Kpi icona={Gauge} etichetta="Ticket attivi" valore={listaTicket.filter((t) => t.stato !== "Completato").length} colore="text-foreground" />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Pannello titolo="Ticket per stato">
          {ticketPerStato.map((r) => (
            <BarraRiga
              key={r.stato}
              etichetta={r.stato}
              conteggio={r.conteggio}
              max={maxTicket}
              colore={COLORE_STATO_TICKET[r.stato]}
            />
          ))}
        </Pannello>

        <Pannello titolo="Segnalazioni per stato">
          {segnalazioniPerStato.map((r) => (
            <BarraRiga
              key={r.stato}
              etichetta={r.stato}
              conteggio={r.conteggio}
              max={maxSegn}
              colore={COLORE_STATO_SEGN[r.stato]}
            />
          ))}
        </Pannello>

        <Pannello titolo="Carico per tecnico" className="md:col-span-2">
          {caricoTecnici.length === 0 && (
            <p className="text-sm text-muted-foreground">Nessuna persona attiva. Aggiungile in &quot;Persone&quot;.</p>
          )}
          {caricoTecnici.map(({ persona, conteggio }) => (
            <BarraRiga
              key={persona.id}
              etichetta={persona.nome}
              conteggio={conteggio}
              max={maxCarico}
              colore="bg-primary"
            />
          ))}
        </Pannello>
      </div>
    </div>
  );
}

function Kpi({
  icona: Icona,
  etichetta,
  valore,
  colore,
}: {
  icona: typeof Gauge;
  etichetta: string;
  valore: number;
  colore: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-md">
      <Icona className={`mb-2 h-4 w-4 ${colore}`} strokeWidth={2.25} />
      <div className="font-heading text-2xl font-bold tabular-nums">{valore}</div>
      <div className="text-xs text-muted-foreground">{etichetta}</div>
    </div>
  );
}

function Pannello({ titolo, children, className }: { titolo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border bg-card p-5 shadow-md ${className ?? ""}`}>
      <h2 className="mb-4 font-heading text-sm font-bold">{titolo}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function BarraRiga({
  etichetta,
  conteggio,
  max,
  colore,
}: {
  etichetta: string;
  conteggio: number;
  max: number;
  colore: string;
}) {
  const percentuale = Math.max(4, Math.round((conteggio / max) * 100));
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-32 shrink-0 truncate text-muted-foreground">{etichetta}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${colore}`} style={{ width: `${percentuale}%` }} />
      </div>
      <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{conteggio}</span>
    </div>
  );
}
