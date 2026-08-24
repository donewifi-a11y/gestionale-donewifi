"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Phone, MapPin, RefreshCw, AlertTriangle, FileText, ChevronRight, Users2, TriangleAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatoVuoto } from "@/components/ui/stato-vuoto";
import { sincronizzaAnagraficaAruba, sincronizzaFattureAruba, type ClienteInsoluto, type ClienteBuyGo } from "@/app/(app)/clienti-esterni/actions";
import { BuyGoTabella } from "@/components/clienti-esterni/buygo-tabella";
import type { ClienteEsterno } from "@/lib/types";

function nomeVisualizzato(c: ClienteEsterno): string {
  return c.ragionesociale || [c.cognome, c.nome].filter(Boolean).join(" ") || "—";
}

export function ClientiEsterniBoard({
  clienti,
  isAdmin,
  ultimaSincronizzazione,
  clientiAttivi,
  insoluti,
  clientiBuyGo,
}: {
  clienti: ClienteEsterno[];
  isAdmin: boolean;
  ultimaSincronizzazione: string | null;
  clientiAttivi: number;
  insoluti: { totale: number; numeroFatture: number; clienti: ClienteInsoluto[] } | null;
  clientiBuyGo: ClienteBuyGo[];
}) {
  const router = useRouter();
  const [ricerca, setRicerca] = useState("");
  const [mostraNonAttivi, setMostraNonAttivi] = useState(false);
  const [inCorsoAnagrafica, setInCorsoAnagrafica] = useState(false);
  const [inCorsoFatture, setInCorsoFatture] = useState(false);
  const [esito, setEsito] = useState("");
  const [esitoErrore, setEsitoErrore] = useState(false);
  // ★ NUOVA (2026-08) — richiesta esplicita: sezione dedicata per i clienti
  // Buy&Go/Buy Pro, stesso principio "vista" già usato altrove nel
  // gestionale (Materiali, Persone/Utenti, Clienti/Installazioni) invece di
  // una pagina separata.
  const [vista, setVista] = useState<"anagrafica" | "buygo">("anagrafica");

  const numeroNonAttivi = useMemo(() => clienti.filter((c) => !c.attivo).length, [clienti]);

  const filtrati = useMemo(() => {
    const base = mostraNonAttivi ? clienti : clienti.filter((c) => c.attivo);
    const testo = ricerca.trim().toLowerCase();
    if (!testo) return base;
    return base.filter((c) =>
      [nomeVisualizzato(c), c.telefono, c.codice_fiscale, c.partita_iva, c.comune]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(testo))
    );
  }, [clienti, ricerca, mostraNonAttivi]);

  async function sincronizzaAnagrafica() {
    setInCorsoAnagrafica(true);
    setEsito("");
    const risultato = await sincronizzaAnagraficaAruba();
    setInCorsoAnagrafica(false);
    setEsitoErrore(!!risultato.errore);
    setEsito(risultato.errore || `Sincronizzati ${risultato.sincronizzati} clienti.`);
    router.refresh();
  }

  async function sincronizzaFatture() {
    setInCorsoFatture(true);
    setEsito("");
    const risultato = await sincronizzaFattureAruba();
    setInCorsoFatture(false);
    setEsitoErrore(!!risultato.errore);
    setEsito(
      risultato.errore ||
        `Sincronizzate ${risultato.sincronizzati} fatture` +
          (risultato.scartate ? ` (${risultato.scartate} scartate, senza cliente corrispondente).` : ".")
    );
    router.refresh();
  }

  return (
    <div>
      <div className="mb-5 flex gap-1.5 rounded-xl bg-muted/60 p-1">
        <button
          onClick={() => setVista("anagrafica")}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
            vista === "anagrafica" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Anagrafica
        </button>
        <button
          onClick={() => setVista("buygo")}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition ${
            vista === "buygo" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Zap className="h-3.5 w-3.5" strokeWidth={2.5} />
          Buy&amp;Go
          {clientiBuyGo.length > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">{clientiBuyGo.length}</span>
          )}
        </button>
      </div>

      {vista === "buygo" ? (
        <BuyGoTabella clienti={clientiBuyGo} />
      ) : (
        <>
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4 shadow-md">
          <Users2 className="mb-2 h-4 w-4 text-primary" strokeWidth={2.25} />
          <div className="font-heading text-2xl font-bold tabular-nums">{clientiAttivi}</div>
          <div className="text-xs text-muted-foreground">Clienti attivi</div>
        </div>
        {insoluti && insoluti.numeroFatture > 0 && (
          <div className="col-span-2 rounded-2xl border border-critical/20 bg-critical/5 p-4 shadow-md sm:col-span-2">
            <div className="mb-1 flex items-center gap-1.5">
              <TriangleAlert className="h-4 w-4 text-critical" strokeWidth={2.25} />
              <span className="text-xs font-semibold uppercase tracking-wide text-critical">Fatture insolute</span>
            </div>
            <div className="font-heading text-xl font-bold tabular-nums text-critical">
              € {insoluti.totale.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-muted-foreground">
              {insoluti.numeroFatture} fatture · {insoluti.clienti.length} clienti — {insoluti.clienti.slice(0, 3).map((c) => c.nome).join(", ")}
              {insoluti.clienti.length > 3 && " ..."}
            </div>
          </div>
        )}
      </div>

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
        {numeroNonAttivi > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={mostraNonAttivi} onChange={(e) => setMostraNonAttivi(e.target.checked)} className="h-3.5 w-3.5" />
            Mostra anche i {numeroNonAttivi} non attivi
          </label>
        )}
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            {ultimaSincronizzazione && (
              <span className="text-xs text-muted-foreground">
                Ultima sincronizzazione: {new Date(ultimaSincronizzazione).toLocaleString("it-IT")}
              </span>
            )}
            <Button size="sm" variant="outline" onClick={sincronizzaAnagrafica} disabled={inCorsoAnagrafica}>
              <RefreshCw className={`h-3.5 w-3.5 ${inCorsoAnagrafica ? "animate-spin" : ""}`} strokeWidth={2.25} />
              {inCorsoAnagrafica ? "Sincronizzo..." : "Sincronizza anagrafica"}
            </Button>
            <Button size="sm" variant="outline" onClick={sincronizzaFatture} disabled={inCorsoFatture} title="Può richiedere fino a un minuto — migliaia di righe da scaricare.">
              <FileText className={`h-3.5 w-3.5 ${inCorsoFatture ? "animate-pulse" : ""}`} strokeWidth={2.25} />
              {inCorsoFatture ? "Sincronizzo fatture… (fino a 1 minuto)" : "Sincronizza fatture"}
            </Button>
          </div>
        )}
      </div>

      {/* ★ FIX — richiesta esplicita (audit grafico completo): una
      sincronizzazione riuscita restava sempre grigia/neutra, mai verde
      come il resto dei successi nel gestionale (toast, badge di stato) —
      solo l'errore aveva un colore (giallo). */}
      {esito && (
        <p
          className={`mb-4 rounded-lg p-2.5 text-sm ${
            esitoErrore ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
          }`}
        >
          {esito}
        </p>
      )}

      {clienti.length === 0 && (
        <StatoVuoto icona={Users2} titolo={isAdmin ? 'Nessun dato ancora — premi "Sincronizza anagrafica".' : "Nessun dato ancora."} />
      )}

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {filtrati.map((c) => (
          <Link
            key={c.id}
            href={`/clienti-esterni/${c.id}`}
            className="flex w-full items-center gap-3 border-t p-3 text-sm transition first:border-t-0 hover:bg-muted/40"
          >
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
            {c.attivo ? (
              <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Attivo</span>
            ) : (
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Non attivo</span>
            )}
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
          </Link>
        ))}
      </div>

      {isAdmin && clienti.length === 0 && (
        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
          Se la sincronizzazione dà errore, controlla le variabili ARUBA_BRIDGE_URL/ARUBA_BRIDGE_SECRET.
        </p>
      )}
        </>
      )}
    </div>
  );
}
