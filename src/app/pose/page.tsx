import { redirect } from "next/navigation";
import { HardHat, MapPin, Phone, CalendarClock, ChevronRight, Users, AlertTriangle, HelpCircle } from "lucide-react";
import Link from "next/link";
import { getInterventiTecnicoEsterno } from "./actions";
import { LogoutTecnicoEsternoButton } from "@/components/pose/logout-button";
import { PrendiInCaricoButton } from "@/components/pose/prendi-in-carico-button";

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

  const { tecnico, tickets, appuntamenti, appuntamentiNonAssegnati } = dati;

  // ★ NUOVA (2026-08-28, richiesta esplicita: "una sezione in cui ci sono
  // le installazioni da fare rapporto di lavoro quando non completate") —
  // getInterventiTecnicoEsterno() ora porta anche gli appuntamenti con una
  // data ormai passata (prima sparivano del tutto, vedi il commento lì).
  // Qui si dividono in due sezioni invece di lasciarli mescolati per data:
  // "In ritardo" salta all'occhio per primo, con un trattamento diverso
  // (rosso, sopra tutto) da "In programma" (i normali appuntamenti futuri).
  const oggiInizio = new Date();
  oggiInizio.setHours(0, 0, 0, 0);
  const appuntamentiInRitardo = appuntamenti.filter((a) => new Date(a.data_ora) < oggiInizio);
  const appuntamentiInProgramma = appuntamenti.filter((a) => new Date(a.data_ora) >= oggiInizio);

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

      {/* ★ NUOVA (2026-08-26, richiesta esplicita: "poter consultare il
      calendario generale") — tutti gli appuntamenti della squadra, non solo
      i propri (elencati sotto). */}
      <Link
        href="/pose/calendario"
        style={{ background: "linear-gradient(90deg, #2D6CFF, #7C4DFF)" }}
        className="flex h-16 items-center gap-3 rounded-2xl px-5 text-white shadow-md active:scale-[0.99]"
      >
        <Users className="h-6 w-6 shrink-0" strokeWidth={2.25} />
        <span className="flex-1 text-base font-bold">Calendario squadra</span>
        <ChevronRight className="h-5 w-5 shrink-0" strokeWidth={2.25} />
      </Link>

      {appuntamentiInRitardo.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-2xl border-2 border-critical/30 bg-critical/5 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-critical">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2.25} />
            In ritardo — rapporto non ancora fatto
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {appuntamentiInRitardo.map((a) => (
              <Link
                key={a.id}
                href={`/pose/appuntamenti/${a.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-critical/20 bg-card p-4 shadow-sm transition active:scale-[0.99] active:bg-muted/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-critical">
                    <CalendarClock className="h-4 w-4 shrink-0" strokeWidth={2.25} />
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

      {appuntamentiInProgramma.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Appuntamenti in programma</p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {appuntamentiInProgramma.map((a) => (
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

      {/* ★ NUOVA (2026-08-28, "mancano un po' di pose da fare") — appuntamenti
      "Programmato" senza nessun tecnico assegnato: prima invisibili
      ovunque, anche a chi era pronto a farli. Chiunque su pose li vede e
      può prenderli in carico da qui, senza passare dal gestionale
      principale (vedi getInterventiTecnicoEsterno() in actions.ts). */}
      {appuntamentiNonAssegnati.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-2xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <HelpCircle className="h-4 w-4 shrink-0" strokeWidth={2.25} />
            Da assegnare — nessun tecnico ancora
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {appuntamentiNonAssegnati.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
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
                <PrendiInCaricoButton appuntamentoId={a.id} />
              </div>
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
