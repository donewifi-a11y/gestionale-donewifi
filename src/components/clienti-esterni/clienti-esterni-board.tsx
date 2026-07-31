"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Phone, MapPin, ChevronDown, RefreshCw, History, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sincronizzaAnagraficaAruba, getStoricoProfiloCliente } from "@/app/(app)/clienti-esterni/actions";
import type { ClienteEsterno, StoricoProfiloClienteEsterno } from "@/lib/types";

function nomeVisualizzato(c: ClienteEsterno): string {
  return c.ragionesociale || [c.cognome, c.nome].filter(Boolean).join(" ") || "—";
}

export function ClientiEsterniBoard({
  clienti,
  isAdmin,
  ultimaSincronizzazione,
}: {
  clienti: ClienteEsterno[];
  isAdmin: boolean;
  ultimaSincronizzazione: string | null;
}) {
  const router = useRouter();
  const [ricerca, setRicerca] = useState("");
  const [aperto, setAperto] = useState<number | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [esito, setEsito] = useState("");
  const [storico, setStorico] = useState<Record<number, StoricoProfiloClienteEsterno[]>>({});

  const filtrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    if (!testo) return clienti;
    return clienti.filter((c) =>
      [nomeVisualizzato(c), c.telefono, c.codice_fiscale, c.partita_iva, c.comune]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(testo))
    );
  }, [clienti, ricerca]);

  async function sincronizza() {
    setInCorso(true);
    setEsito("");
    const risultato = await sincronizzaAnagraficaAruba();
    setInCorso(false);
    if (risultato.errore) {
      setEsito(risultato.errore);
      return;
    }
    setEsito(`Sincronizzati ${risultato.sincronizzati} clienti.`);
    router.refresh();
  }

  async function espandi(c: ClienteEsterno) {
    const nuovo = aperto === c.id ? null : c.id;
    setAperto(nuovo);
    if (nuovo && !storico[c.id]) {
      const righe = await getStoricoProfiloCliente(c.id);
      setStorico((prev) => ({ ...prev, [c.id]: righe as StoricoProfiloClienteEsterno[] }));
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
          <input
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca nome, telefono, CF/PIVA, comune..."
            className="h-9 w-64 rounded-md border bg-background pl-8 pr-3 text-sm"
          />
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {ultimaSincronizzazione && (
              <span className="text-xs text-muted-foreground">
                Ultima sincronizzazione: {new Date(ultimaSincronizzazione).toLocaleString("it-IT")}
              </span>
            )}
            <Button size="sm" variant="outline" onClick={sincronizza} disabled={inCorso}>
              <RefreshCw className={`h-3.5 w-3.5 ${inCorso ? "animate-spin" : ""}`} strokeWidth={2.25} />
              {inCorso ? "Sincronizzo..." : "Sincronizza ora"}
            </Button>
          </div>
        )}
      </div>

      {esito && (
        <p className="mb-4 rounded-lg bg-muted/60 p-2.5 text-sm text-muted-foreground">{esito}</p>
      )}

      {clienti.length === 0 && (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {isAdmin ? 'Nessun dato ancora — premi "Sincronizza ora".' : "Nessun dato ancora."}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtrati.map((c) => {
          const espanso = aperto === c.id;
          return (
            <div key={c.id} className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <button onClick={() => espandi(c)} className="flex w-full items-center gap-3 p-3 text-left text-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                  {nomeVisualizzato(c).slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{nomeVisualizzato(c)}</div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {c.telefono && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" strokeWidth={2.25} />
                        {c.telefono}
                      </span>
                    )}
                    {c.comune && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.25} />
                        {c.comune}
                      </span>
                    )}
                  </div>
                </div>
                {c.contratto_attivo === true && (
                  <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Attivo</span>
                )}
                {c.contratto_attivo === false && (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Non attivo</span>
                )}
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${espanso ? "rotate-180" : ""}`} strokeWidth={2.25} />
              </button>
              {espanso && (
                <div className="flex flex-col gap-3 border-t bg-muted/40 px-4 py-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-muted-foreground">CF: </span>{c.codice_fiscale || "—"}</div>
                    <div><span className="text-muted-foreground">P.IVA: </span>{c.partita_iva || "—"}</div>
                    <div><span className="text-muted-foreground">Email: </span>{c.email || "—"}</div>
                    <div><span className="text-muted-foreground">Codice gestionale: </span>{c.codice_gestionale || "—"}</div>
                    <div className="col-span-2"><span className="text-muted-foreground">Indirizzo: </span>{[c.indirizzo, c.numero_civico].filter(Boolean).join(" ")}{c.cap && `, ${c.cap}`} {c.comune} {c.provincia && `(${c.provincia})`}</div>
                    <div><span className="text-muted-foreground">Contratto: </span>{c.id_contratto || "—"}</div>
                    <div><span className="text-muted-foreground">Profilo attuale: </span>{c.profilo_internet || "—"}</div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      <History className="h-3 w-3" strokeWidth={2.25} />
                      Storico cambi profilo
                    </div>
                    {!storico[c.id] && <p className="text-muted-foreground">Caricamento...</p>}
                    {storico[c.id]?.length === 0 && (
                      <p className="text-muted-foreground">Nessun cambio rilevato ancora (lo storico parte da qui in avanti).</p>
                    )}
                    {storico[c.id]?.map((s) => (
                      <div key={s.id} className="border-t py-1 first:border-t-0">
                        <span className="text-muted-foreground">{new Date(s.rilevato_il).toLocaleDateString("it-IT")}: </span>
                        {s.profilo_precedente || "—"} → {s.profilo_nuovo || "—"}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isAdmin && clienti.length === 0 && (
        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
          Se la sincronizzazione dà errore, controlla le variabili ARUBA_BRIDGE_URL/ARUBA_BRIDGE_SECRET.
        </p>
      )}
    </div>
  );
}
