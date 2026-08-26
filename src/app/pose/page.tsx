import { redirect } from "next/navigation";
import { HardHat, MapPin, Phone, CalendarClock, ChevronRight } from "lucide-react";
import Link from "next/link";
import { getInterventiTecnicoEsterno } from "./actions";
import { LogoutTecnicoEsternoButton } from "@/components/pose/logout-button";

// ★ NUOVA (2026-08-26) — dashboard di pose.donewifi.it: solo ciò che è
// assegnato AL tecnico collegato, niente sidebar/mondi del gestionale
// interno (proprio il punto della richiesta: "non passare dal gestionale").
//
// ★ REDESIGN (2026-08-26, richiesta esplicita: "tutto il sistema pose sarà
// usato solo da tablet e smartphone") — card intere cliccabili (non solo
// un link testuale dentro), target touch generosi, griglia a 2 colonne da
// tablet in su (`sm:grid-cols-2`) invece di un'unica colonna stretta con
// margini vuoti ai lati su schermi larghi come un iPad.
export default async function PosePage() {
  const dati = await getInterventiTecnicoEsterno();
  if (!dati) redirect("/pose/login");

  const { tecnico, tickets, appuntamenti } = dati;

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
            <HardHat className="h-6 w-6" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="font-heading text-xl font-bold tracking-tight">Ciao, {tecnico.nome}</h1>
            <p className="text-sm text-muted-foreground">I tuoi interventi di oggi</p>
          </div>
        </div>
        <LogoutTecnicoEsternoButton />
      </div>

      {appuntamenti.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Appuntamenti in programma</p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {appuntamenti.map((a) => (
              <Link
                key={a.id}
                href={`/pose/appuntamenti/${a.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm transition active:scale-[0.99] active:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold">
                    <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
                    {new Date(a.data_ora).toLocaleString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <p className="mt-1.5 truncate text-base font-medium">{a.titolo}</p>
                  {a.indirizzo && (
                    <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                      <span className="truncate">{a.indirizzo}</span>
                    </p>
                  )}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={2.25} />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Interventi da chiudere {tickets.length > 0 && `(${tickets.length})`}
        </p>
        {tickets.length === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nessun intervento assegnato al momento.
          </p>
        )}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/pose/interventi/${t.id}`}
              className="flex flex-col gap-1.5 rounded-xl border bg-card p-4 shadow-sm transition active:scale-[0.99] active:bg-muted/40"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">#{t.numero}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{t.stato}</span>
              </div>
              <p className="text-base font-semibold">{t.cliente}</p>
              {t.indirizzo && (
                <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                  <span className="truncate">{t.indirizzo}</span>
                </p>
              )}
              {t.telefono && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                  {t.telefono}
                </p>
              )}
              {t.problema && <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{t.problema}</p>}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
