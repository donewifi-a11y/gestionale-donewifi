import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin, User, Users } from "lucide-react";
import { getCalendarioSquadra } from "../actions";
import { getTecnicoEsternoCorrente } from "@/lib/tecnico-esterno";
import { COLORE_SERVIZIO } from "@/lib/types";

// ★ NUOVA (2026-08-26, richiesta esplicita: "poter consultare il calendario
// generale") — tutti gli appuntamenti della squadra (staff interno + tecnici
// esterni) nei prossimi 14 giorni, raggruppati per giorno. Sola lettura —
// vedi il commento su getCalendarioSquadra() in app/pose/actions.ts.
export default async function CalendarioPosePage() {
  const tecnico = await getTecnicoEsternoCorrente();
  if (!tecnico) redirect("/pose/login");

  const appuntamenti = await getCalendarioSquadra(14);

  const gruppi = new Map<string, typeof appuntamenti>();
  for (const a of appuntamenti) {
    const chiave = new Date(a.data_ora).toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long" });
    if (!gruppi.has(chiave)) gruppi.set(chiave, []);
    gruppi.get(chiave)!.push(a);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-4 py-6">
      <Link href="/pose" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
        I tuoi interventi
      </Link>

      <div className="flex items-center gap-3">
        <div
          style={{ background: "linear-gradient(135deg, #2D6CFF, #7C4DFF)" }}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
        >
          <Users className="h-6 w-6" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="text-xl font-extrabold tracking-tight [font-family:var(--font-pose-display)]">Calendario squadra</h1>
          <p className="text-sm text-muted-foreground">Tutti gli appuntamenti, prossimi 14 giorni — anche degli altri tecnici.</p>
        </div>
      </div>

      {appuntamenti.length === 0 && (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          <CalendarDays className="mx-auto mb-2 h-6 w-6" strokeWidth={2} />
          Nessun appuntamento programmato nei prossimi 14 giorni.
        </p>
      )}

      <div className="flex flex-col gap-6">
        {Array.from(gruppi.entries()).map(([giorno, righe]) => (
          <div key={giorno} className="flex flex-col gap-2.5">
            <p className="px-1 text-xs font-bold tracking-wide text-muted-foreground uppercase [font-family:var(--font-pose-mono)]">{giorno}</p>
            <div className="flex flex-col gap-2.5">
              {righe.map((a) => {
                const colore = COLORE_SERVIZIO[a.tipo_servizio];
                return (
                  <div
                    key={a.id}
                    className={`rounded-2xl border-2 bg-card p-4 shadow-sm ${a.mio ? "border-[#2D6CFF]" : "border-border"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${colore.sfondo} ${colore.testo}`}>{a.tipo_servizio}</span>
                      <span className="font-mono text-sm font-bold text-muted-foreground">
                        {new Date(a.data_ora).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="mt-2 text-base font-bold">{a.titolo}</p>
                    {a.indirizzo && (
                      <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                        {a.indirizzo}
                      </p>
                    )}
                    <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold">
                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.25} />
                      {a.assegnatoA ?? "Non assegnato"}
                      {a.mio && <span className="rounded-full bg-[#EAF0FF] px-2 py-0.5 text-[10.5px] font-bold text-[#1848C7]">Tu</span>}
                      {!a.mio && a.assegnatoEsterno && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">esterno</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
