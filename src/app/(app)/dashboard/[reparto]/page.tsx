import { notFound, redirect } from "next/navigation";
import { Gauge, TriangleAlert, Clock, Euro, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { getDatiReparto } from "@/lib/analytics";
import type { AreaAccesso } from "@/lib/types";

const SLUG_REPARTO: Record<string, AreaAccesso> = {
  "analisi-rete": "Analisi Rete",
  commerciale: "Commerciale",
  fatturazione: "Fatturazione",
};

export default async function DashboardRepartoPage({ params }: { params: Promise<{ reparto: string }> }) {
  const { reparto: slug } = await params;
  const reparto = SLUG_REPARTO[slug];
  if (!reparto) notFound();

  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  const isAdmin = personaHaAccessoAdmin(persona);
  if (!persona || (!isAdmin && persona.area_accesso !== reparto)) {
    redirect("/?errore=non-autorizzato");
  }

  const dati = await getDatiReparto(supabase, reparto);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <Gauge className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">{reparto}</h1>
          <p className="text-sm text-muted-foreground">Il colpo d&apos;occhio sul reparto.</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Kpi icona={Gauge} etichetta="Ticket attivi" valore={dati.ticketAttivi} colore="text-foreground" />
        <Kpi icona={TriangleAlert} etichetta="Urgenti" valore={dati.urgenti} colore="text-critical" />
        <Kpi icona={Clock} etichetta="Non assegnati" valore={dati.nonAssegnati} colore="text-warning" />
        <Kpi icona={CheckCircle2} etichetta="Completati mese" valore={dati.completatiQuestoMese} colore="text-success" />
        <Kpi icona={Euro} etichetta="Ricavi mese" valore={`€ ${dati.ricaviQuestoMese.toLocaleString("it-IT")}`} colore="text-success" />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5 shadow-md">
          <h2 className="mb-4 font-heading text-sm font-bold">Carico per tecnico</h2>
          <div className="flex flex-col gap-3">
            {dati.caricoTecnici.length === 0 && (
              <p className="text-sm text-muted-foreground">Nessun ticket assegnato al momento.</p>
            )}
            {dati.caricoTecnici.map(({ persona: p, conteggio }) => {
              const max = Math.max(1, ...dati.caricoTecnici.map((r) => r.conteggio));
              return (
                <div key={p.id} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 truncate text-muted-foreground">{p.nome}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, Math.round((conteggio / max) * 100))}%` }} />
                  </div>
                  <span className="w-6 shrink-0 text-right font-semibold tabular-nums">{conteggio}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-md">
          <h2 className="mb-4 font-heading text-sm font-bold">Ticket attivi (priorità Urgente in cima)</h2>
          <div className="flex flex-col gap-2">
            {dati.listaAttivi.length === 0 && <p className="text-sm text-muted-foreground">Nessun ticket attivo.</p>}
            {dati.listaAttivi.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 border-b pb-2 text-sm last:border-0 last:pb-0">
                <span className="truncate">{t.cliente}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  #{t.numero} · {t.priorita}
                </span>
              </div>
            ))}
          </div>
        </div>
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
