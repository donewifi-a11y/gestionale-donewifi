import { Gauge, TriangleAlert, Clock, Euro, CheckCircle2, UserRound, FileText } from "lucide-react";
import { IconaCategoria } from "@/components/condivisi/icona-categoria";
import type { getDatiReparto } from "@/lib/analytics";

/** ★ ESTRATTA (2026-09-03, "meno voci di menu possibili" — artifact "Meno
 * Voci nel Menu", confermata) — prima era il corpo intero di
 * dashboard/[reparto]/page.tsx, una pagina/voce di menu a sé per ciascun
 * reparto. Estratta qui (solo il contenuto, senza header di pagina) per
 * essere riusata come un tab dentro l'unica pagina Dashboard — stessa vista
 * di prima, raggiunta da un tab invece che da una voce di menu diversa per
 * ogni reparto. */
export function SezioneDashboardReparto({ dati }: { dati: Awaited<ReturnType<typeof getDatiReparto>> }) {
  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Kpi icona={Gauge} etichetta="Ticket attivi" valore={dati.ticketAttivi} colore="text-foreground" />
        <Kpi icona={TriangleAlert} etichetta="Urgenti" valore={dati.urgenti} colore="text-critical" />
        <Kpi icona={Clock} etichetta="Non assegnati" valore={dati.nonAssegnati} colore="text-warning" />
        <Kpi icona={CheckCircle2} etichetta="Completati mese" valore={dati.completatiQuestoMese} colore="text-success" />
        <Kpi
          icona={Euro}
          etichetta="Ricavi mese"
          valore={`€ ${dati.ricaviQuestoMese.toLocaleString("it-IT")}`}
          colore="text-success"
          nota="Solo da rapportino, quasi sempre vuoto — non il fatturato reale."
        />
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5 shadow-md">
          <h2 className="mb-4 flex items-center gap-2 font-heading text-sm font-bold">
            <IconaCategoria icona={UserRound} categoria="persona" />
            Carico per tecnico
          </h2>
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
          <h2 className="mb-4 flex items-center gap-2 font-heading text-sm font-bold">
            <IconaCategoria icona={FileText} categoria="documento" />
            Ticket attivi (priorità Urgente in cima)
          </h2>
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
  nota,
}: {
  icona: typeof Gauge;
  etichetta: string;
  valore: number | string;
  colore: string;
  nota?: string;
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-md">
      <Icona className={`mb-2 h-4 w-4 ${colore}`} strokeWidth={2.25} />
      <div className="font-heading text-2xl font-bold tabular-nums">{valore}</div>
      <div className="text-xs text-muted-foreground">{etichetta}</div>
      {nota && <div className="mt-1 text-[10px] leading-snug text-muted-foreground/70">{nota}</div>}
    </div>
  );
}
