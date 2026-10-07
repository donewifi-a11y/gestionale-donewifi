"use client";

import { useMemo, useState } from "react";
import { Search, ChevronDown, HardHat, Wrench, FileSignature } from "lucide-react";
import { SchedaVista } from "@/components/schede/scheda-vista";
import { RapportinoVista } from "@/components/tickets/rapportino";
import { StatoVuoto } from "@/components/ui/stato-vuoto";
import { IconaCategoria } from "@/components/condivisi/icona-categoria";
import type { RigaScheda, RigaRapportino } from "@/app/(app)/rapporti-lavoro/actions";

type Vista = "installazioni" | "lavorazioni";

/**
 * ★ NUOVA (2026-09-04, richiesta esplicita con screenshot: "avrei bisogno
 * di migliorare questo. non si capisce che lavorazioni erano e lo trovo
 * caotico") — ogni riga mostrava solo "Ticket #NN · data · Rapportino",
 * nessun indizio su COSA fosse stato fatto: bisognava aprire ogni riga una
 * per una per scoprirlo. Il dato c'era già, semplicemente non veniva
 * mostrato: `lavori_svolti` del Rapportino (testo libero, spesso
 * dettagliato — "Cpe cambiata.", "Migliorato il puntamento della cpe") o
 * `interventi_eseguiti`/`esito` della Scheda di Lavorazione tecnica.
 */
function descrizioneLavorazione(r: RigaLavorazione): string {
  if (r.fonte === "scheda" && r.scheda) {
    if (r.scheda.interventi_eseguiti?.length) return r.scheda.interventi_eseguiti.join(", ");
    return r.scheda.esito || "Lavorazione tecnica";
  }
  if (r.fonte === "rapportino" && r.rapportino) {
    return r.rapportino.lavori_svolti?.trim() || r.rapportino.esito || "Rapportino";
  }
  return "";
}

interface RigaLavorazione {
  chiave: string;
  creatoIl: string;
  cliente: string | null;
  ticketNumero: number | null;
  fonte: "scheda" | "rapportino";
  scheda?: RigaScheda;
  rapportino?: RigaRapportino;
}

/** ★ NUOVA (2026-09-03, richiesta esplicita: "deve esserci un tab con i
 * rapporti di lavoro divisi per tipologia e devo poter consultare tutto
 * quello inserito, tutti i dati e foto") — due tab: Installazioni (Schede
 * di Installazione) e Lavorazioni (Schede di Lavorazione Tecnica +
 * Rapportini — due flussi diversi per lo stesso concetto, il tecnico non
 * dovrebbe doversi ricordare quale dei due ha usato per trovare un
 * intervento). Stesso pattern "pillola" già uniformato nel resto del
 * gestionale, righe espandibili con la stessa vista di sola lettura già
 * usata nel Ticket (SchedaVista/RapportinoVista) — nessun componente
 * nuovo per il dettaglio, solo un nuovo posto da cui raggiungerlo. */
export function RapportiLavoroBoard({ schede, rapportini, isAdmin }: { schede: RigaScheda[]; rapportini: RigaRapportino[]; isAdmin: boolean }) {
  const [vista, setVista] = useState<Vista>("installazioni");
  const [ricerca, setRicerca] = useState("");
  // ★ FIX (2026-10-07, audit d'oro gestionale) — questo tab (secondo
  // dell'Archivio) aveva una ricerca testuale propria ma NESSUN filtro
  // data, a differenza del tab "Ticket e Segnalazioni" accanto: un
  // operatore che imposta un periodo lì e passa qui si ritrovava senza
  // filtro data e con la ricerca azzerata — due logiche diverse nella
  // stessa pagina. Stesso pattern Da/A, stesso default "ultimi 3 mesi".
  const treMesiFa = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  }, []);
  const [dataDa, setDataDa] = useState(treMesiFa);
  const [dataA, setDataA] = useState("");
  const [aperta, setAperta] = useState<string | null>(null);

  const installazioni = useMemo(() => schede.filter((s) => s.tipo === "Nuova installazione"), [schede]);

  const lavorazioni = useMemo<RigaLavorazione[]>(() => {
    const daSchede: RigaLavorazione[] = schede
      .filter((s) => s.tipo === "Lavorazione tecnica")
      .map((s) => ({ chiave: `scheda-${s.id}`, creatoIl: s.creato_il, cliente: s.ticket?.cliente ?? null, ticketNumero: s.ticket?.numero ?? null, fonte: "scheda", scheda: s }));
    const daRapportini: RigaLavorazione[] = rapportini.map((r) => ({
      chiave: `rapportino-${r.id}`,
      creatoIl: r.creato_il,
      cliente: r.ticket?.cliente ?? null,
      ticketNumero: r.ticket?.numero ?? null,
      fonte: "rapportino",
      rapportino: r,
    }));
    return [...daSchede, ...daRapportini].sort((a, b) => new Date(b.creatoIl).getTime() - new Date(a.creatoIl).getTime());
  }, [schede, rapportini]);

  const daMs = dataDa ? new Date(dataDa).getTime() : null;
  const aMs = dataA ? new Date(`${dataA}T23:59:59`).getTime() : null;
  function dentroPeriodo(dataIso: string): boolean {
    const t = new Date(dataIso).getTime();
    return (daMs === null || t >= daMs) && (aMs === null || t <= aMs);
  }

  const installazioniFiltrate = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    return installazioni.filter(
      (s) => (!testo || s.ticket?.cliente.toLowerCase().includes(testo) || String(s.ticket?.numero ?? "").includes(testo)) && dentroPeriodo(s.creato_il)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dentroPeriodo/daMs/aMs dipendono solo da dataDa/dataA, già in deps
  }, [installazioni, ricerca, dataDa, dataA]);

  const lavorazioniFiltrate = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    return lavorazioni.filter(
      (r) => (!testo || (r.cliente ?? "").toLowerCase().includes(testo) || String(r.ticketNumero ?? "").includes(testo)) && dentroPeriodo(r.creatoIl)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dentroPeriodo/daMs/aMs dipendono solo da dataDa/dataA, già in deps
  }, [lavorazioni, ricerca, dataDa, dataA]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border bg-card p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setVista("installazioni")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${vista === "installazioni" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}
          >
            <HardHat className="h-3.5 w-3.5" strokeWidth={2.25} />
            Installazioni ({installazioni.length})
          </button>
          <button
            type="button"
            onClick={() => setVista("lavorazioni")}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${vista === "lavorazioni" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Wrench className="h-3.5 w-3.5" strokeWidth={2.25} />
            Lavorazioni ({lavorazioni.length})
          </button>
        </div>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
          <input
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca cliente o numero Ticket..."
            className="h-9 w-56 rounded-md border bg-background pl-8 pr-3 text-sm"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          Da
          <input type="date" value={dataDa} onChange={(e) => setDataDa(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          A
          <input type="date" value={dataA} onChange={(e) => setDataA(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm" />
        </label>
        {(dataDa || dataA) && (
          <button type="button" onClick={() => { setDataDa(""); setDataA(""); }} className="text-xs font-semibold text-primary hover:underline">
            Mostra tutto lo storico
          </button>
        )}
      </div>

      {vista === "installazioni" ? (
        installazioniFiltrate.length === 0 ? (
          <StatoVuoto icona={FileSignature} titolo="Nessuna Scheda di Installazione trovata." />
        ) : (
          <div className="flex flex-col gap-2">
            {installazioniFiltrate.map((s) => {
              const espansa = aperta === `scheda-${s.id}`;
              return (
                <div key={s.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                  <button
                    onClick={() => setAperta(espansa ? null : `scheda-${s.id}`)}
                    className="flex w-full items-center gap-3 p-3 text-left text-sm"
                  >
                    <IconaCategoria icona={HardHat} categoria="documento" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{s.ticket?.cliente ?? "Cliente sconosciuto"}</div>
                      {/* ★ NUOVA — stessa coerenza applicata a "Lavorazioni":
                      cosa è stato installato, non solo quando. */}
                      <div className="mt-0.5 truncate text-xs font-medium text-foreground/80">
                        {[s.modello_cpe, s.supporto].filter(Boolean).join(" su ") || "Nuova installazione"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {s.ticket ? `Ticket #${s.ticket.numero}` : "Ticket non trovato"} · {new Date(s.creato_il).toLocaleDateString("it-IT")}
                      </div>
                    </div>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${espansa ? "rotate-180" : ""}`} strokeWidth={2.25} />
                  </button>
                  {espansa && (
                    <div className="border-t bg-muted/40 px-3 py-3">
                      <SchedaVista scheda={s} modificabile={isAdmin} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : lavorazioniFiltrate.length === 0 ? (
        <StatoVuoto icona={FileSignature} titolo="Nessuna Scheda di Lavorazione o Rapportino trovato." />
      ) : (
        <div className="flex flex-col gap-2">
          {lavorazioniFiltrate.map((r) => {
            const espansa = aperta === r.chiave;
            return (
              <div key={r.chiave} className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <button onClick={() => setAperta(espansa ? null : r.chiave)} className="flex w-full items-center gap-3 p-3 text-left text-sm">
                  <IconaCategoria icona={Wrench} categoria="documento" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{r.cliente ?? "Cliente sconosciuto"}</span>
                      <span className="shrink-0 rounded-full bg-servizio-lavorazione-bg px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-servizio-lavorazione">
                        {r.fonte === "scheda" ? "Scheda" : "Rapportino"}
                      </span>
                    </div>
                    {/* ★ NUOVA — vedi descrizioneLavorazione() sopra: la parte
                    che rispondeva a "che lavorazioni erano", prima assente. */}
                    <div className="mt-0.5 truncate text-xs font-medium text-foreground/80">{descrizioneLavorazione(r)}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {r.ticketNumero ? `Ticket #${r.ticketNumero}` : "Ticket non trovato"} · {new Date(r.creatoIl).toLocaleDateString("it-IT")}
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${espansa ? "rotate-180" : ""}`} strokeWidth={2.25} />
                </button>
                {espansa && (
                  <div className="border-t bg-muted/40 px-3 py-3">
                    {r.fonte === "scheda" && r.scheda ? (
                      <SchedaVista scheda={r.scheda} modificabile={isAdmin} />
                    ) : r.rapportino ? (
                      <RapportinoVista rapportino={r.rapportino} importoFatturato={r.rapportino.ticket?.importoFatturato} />
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
