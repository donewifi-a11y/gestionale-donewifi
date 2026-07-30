import Link from "next/link";
import { Gauge, TriangleAlert, Clock, CalendarCheck2, TrendingUp, Euro, UserPlus2, Timer, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { getDatiAmministrazione, getStatistichePeriodo, REPARTI_ELENCO } from "@/lib/analytics";
import { EsportaPdfButton } from "@/components/dashboard/esporta-pdf-button";

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

const PERIODI = [
  { chiave: "7", etichetta: "Ultimi 7 giorni", giorni: 7 },
  { chiave: "30", etichetta: "Ultimi 30 giorni", giorni: 30 },
  { chiave: "90", etichetta: "Ultimi 90 giorni", giorni: 90 },
] as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; da?: string; a?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  const oraFine = params.a ? new Date(`${params.a}T23:59:59`) : new Date();
  let periodoInizio: Date;
  if (params.da) {
    periodoInizio = new Date(`${params.da}T00:00:00`);
  } else {
    const giorni = PERIODI.find((p) => p.chiave === params.periodo)?.giorni ?? 30;
    periodoInizio = new Date();
    periodoInizio.setDate(periodoInizio.getDate() - giorni);
    periodoInizio.setHours(0, 0, 0, 0);
  }
  const periodoAttivo = params.da ? "custom" : (params.periodo ?? "30");

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

  const personaCorrente = await getPersonaCorrente(supabase);
  const isAdmin = personaHaAccessoAdmin(personaCorrente);
  const amministrazione = isAdmin ? await getDatiAmministrazione(supabase) : null;
  const statistichePeriodo = isAdmin ? await getStatistichePeriodo(supabase, periodoInizio, oraFine) : null;

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
    <div id="dashboard-stampabile" className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
            <Gauge className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Il colpo d&apos;occhio sul carico di lavoro di oggi.</p>
          </div>
        </div>
        <EsportaPdfButton />
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

      {statistichePeriodo && (
        <SezionePeriodo dati={statistichePeriodo} periodoAttivo={periodoAttivo} da={params.da} a={params.a} />
      )}

      {amministrazione && <SezioneAmministrazione dati={amministrazione} />}
    </div>
  );
}

function SezionePeriodo({
  dati,
  periodoAttivo,
  da,
  a,
}: {
  dati: NonNullable<Awaited<ReturnType<typeof getStatistichePeriodo>>>;
  periodoAttivo: string;
  da?: string;
  a?: string;
}) {
  const fmtSla = (ore: number | null) => (ore === null ? "—" : ore < 24 ? `${ore} h` : `${Math.round(ore / 24)} gg`);

  return (
    <div className="mt-8 border-t pt-8 print:break-before-page">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Timer className="h-4 w-4 text-primary" strokeWidth={2.5} />
          <h2 className="font-heading text-lg font-bold">Statistiche per periodo</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {PERIODI.map((p) => (
            <Link
              key={p.chiave}
              href={`/dashboard?periodo=${p.chiave}`}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                periodoAttivo === p.chiave
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "border bg-card text-muted-foreground hover:bg-muted/60"
              }`}
            >
              {p.etichetta}
            </Link>
          ))}
          <form className="flex items-center gap-1.5">
            <input type="date" name="da" defaultValue={da} className="h-7 rounded-md border bg-background px-2 text-xs" />
            <span className="text-xs text-muted-foreground">–</span>
            <input type="date" name="a" defaultValue={a} className="h-7 rounded-md border bg-background px-2 text-xs" />
            <button
              type="submit"
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                periodoAttivo === "custom" ? "bg-primary text-primary-foreground" : "border bg-card text-muted-foreground hover:bg-muted/60"
              }`}
            >
              Applica
            </button>
          </form>
        </div>
      </div>

      <div className="mb-5 overflow-x-auto rounded-2xl border bg-card p-5 shadow-md">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="pb-2 font-semibold">Reparto</th>
              <th className="pb-2 text-right font-semibold">Aperti</th>
              <th className="pb-2 text-right font-semibold">Completati</th>
              <th className="pb-2 text-right font-semibold">Urgenti</th>
              <th className="pb-2 text-right font-semibold">SLA medio</th>
            </tr>
          </thead>
          <tbody>
            {REPARTI_ELENCO.map((r) => {
              const d = dati.perReparto[r];
              return (
                <tr key={r} className="border-b last:border-0">
                  <td className="py-2 font-medium">{r}</td>
                  <td className="py-2 text-right tabular-nums">{d.aperti}</td>
                  <td className="py-2 text-right tabular-nums">{d.completati}</td>
                  <td className="py-2 text-right tabular-nums text-critical">{d.urgenti || ""}</td>
                  <td className="py-2 text-right tabular-nums" title={`basato su ${d.slaCampione} ticket`}>
                    {fmtSla(d.slaOreMedia)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Object.entries(dati.perPriorita).map(([priorita, d]) => (
          <div key={priorita} className="rounded-2xl border bg-card p-4 shadow-md">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{priorita}</div>
            <div className="font-heading text-xl font-bold tabular-nums">{fmtSla(d.slaOreMedia)}</div>
            <div className="text-xs text-muted-foreground">SLA medio · {d.campione} ticket</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SezioneAmministrazione({ dati }: { dati: NonNullable<Awaited<ReturnType<typeof getDatiAmministrazione>>> }) {
  const maxAndamento = Math.max(1, ...dati.andamentoGiornaliero);
  const maxRicaviReparto = Math.max(1, ...Object.values(dati.ricaviPerReparto));
  const maxCompletatiReparto = Math.max(1, ...Object.values(dati.completatiPerReparto));
  const maxTipologia = Math.max(1, ...Object.values(dati.perTipologia));

  return (
    <div className="mt-8 border-t pt-8">
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" strokeWidth={2.5} />
        <h2 className="font-heading text-lg font-bold capitalize">Amministrazione — {dati.mese}</h2>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Kpi icona={UserPlus2} etichetta="Acquisizioni del mese" valore={dati.acquisizioniTotali} colore="text-primary" />
        <Kpi icona={Euro} etichetta="Ricavi del mese" valore={`€ ${dati.ricaviTotali.toLocaleString("it-IT")}`} colore="text-success" />
        <Kpi icona={Gauge} etichetta="Ticket completati" valore={dati.ticketCompletatiTotali} colore="text-foreground" />
      </div>

      <div className="mb-5 rounded-2xl border bg-card p-5 shadow-md">
        <h3 className="mb-4 font-heading text-sm font-bold">Andamento acquisizioni — giorno per giorno</h3>
        <div className="flex h-24 items-end gap-[3px]">
          {dati.andamentoGiornaliero.map((v, i) => (
            <div
              key={i}
              title={`Giorno ${i + 1}: ${v}`}
              className="flex-1 rounded-t bg-primary/70 transition hover:bg-primary"
              style={{ height: `${Math.max(4, Math.round((v / maxAndamento) * 100))}%` }}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
          <span>1</span>
          <span>{dati.giorniNelMese}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Pannello titolo="Acquisizioni per tipologia">
          {Object.entries(dati.perTipologia)
            .filter(([, v]) => v > 0)
            .map(([tipo, v]) => (
              <BarraRiga key={tipo} etichetta={tipo} conteggio={v} max={maxTipologia} colore="bg-primary" />
            ))}
        </Pannello>

        <Pannello titolo="Ricavi per reparto (€)">
          {Object.entries(dati.ricaviPerReparto).map(([reparto, v]) => (
            <BarraRiga key={reparto} etichetta={reparto} conteggio={Math.round(v)} max={maxRicaviReparto} colore="bg-success" />
          ))}
        </Pannello>

        <Pannello titolo="Ticket completati per reparto" className="md:col-span-2">
          {Object.entries(dati.completatiPerReparto).map(([reparto, v]) => (
            <BarraRiga key={reparto} etichetta={reparto} conteggio={v} max={maxCompletatiReparto} colore="bg-primary" />
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
  valore: number | string;
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
