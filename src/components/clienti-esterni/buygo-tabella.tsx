"use client";

import { useMemo, useState } from "react";
import { Search, Zap, ChevronRight, Wallet } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatoVuoto } from "@/components/ui/stato-vuoto";
import { formattaValuta } from "@/lib/types";
import type { ClienteBuyGo } from "@/app/(app)/clienti-esterni/actions";

// ★ NUOVA (2026-08) — richiesta esplicita: i clienti Buy&Go/Buy Pro pagano
// "a consumo", attivando e pagando periodi quando vogliono invece di un
// canone fisso mensile (verificato sui dati reali incrociando profilo
// cliente e fatture — vedi getClientiBuyGo() in clienti-esterni/actions.ts).
// Qui li si vede tutti insieme con lo storico di ogni attivazione/pagamento,
// prima mescolati con tutti gli altri profili internet senza distinzione.
export function BuyGoTabella({ clienti }: { clienti: ClienteBuyGo[] }) {
  const [ricerca, setRicerca] = useState("");
  const [aperto, setAperto] = useState<ClienteBuyGo | null>(null);

  const filtrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    if (!testo) return clienti;
    return clienti.filter((c) => [c.nome, c.telefono, c.comune].filter(Boolean).some((v) => v!.toLowerCase().includes(testo)));
  }, [clienti, ricerca]);

  const totalePagatoGenerale = useMemo(() => clienti.reduce((s, c) => s + c.totalePagato, 0), [clienti]);
  const totaleAttivazioniGenerale = useMemo(() => clienti.reduce((s, c) => s + c.numeroAttivazioni, 0), [clienti]);

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4 shadow-md">
          <Zap className="mb-2 h-4 w-4 text-primary" strokeWidth={2.25} />
          <div className="font-heading text-2xl font-bold tabular-nums">{clienti.length}</div>
          <div className="text-xs text-muted-foreground">Clienti Buy&amp;Go</div>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-md">
          <div className="mb-2 h-4 w-4 text-xs font-bold text-muted-foreground">#</div>
          <div className="font-heading text-2xl font-bold tabular-nums">{totaleAttivazioniGenerale}</div>
          <div className="text-xs text-muted-foreground">Attivazioni totali</div>
        </div>
        <div className="col-span-2 rounded-2xl border bg-card p-4 shadow-md sm:col-span-1">
          <Wallet className="mb-2 h-4 w-4 text-success" strokeWidth={2.25} />
          <div className="font-heading text-2xl font-bold tabular-nums">{formattaValuta(totalePagatoGenerale)}</div>
          <div className="text-xs text-muted-foreground">Totale incassato</div>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
        <input
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          placeholder="Cerca nome, telefono, comune..."
          className="h-9 w-64 rounded-md border bg-background pl-8 pr-3 text-sm"
        />
      </div>

      {filtrati.length === 0 && (
        <StatoVuoto icona={Zap} titolo={clienti.length === 0 ? "Nessun cliente Buy&Go trovato nell'anagrafica sincronizzata." : "Nessun risultato per la ricerca."} />
      )}

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {filtrati.map((c) => (
          <button
            key={c.chiave}
            onClick={() => setAperto(c)}
            className="flex w-full items-center gap-3 border-t p-3 text-left text-sm transition first:border-t-0 hover:bg-muted/40"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{c.nome}</div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {c.comune && <span>{c.comune}</span>}
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">{c.profilo}</span>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-semibold tabular-nums">{formattaValuta(c.totalePagato)}</div>
              <div className="text-xs text-muted-foreground">
                {c.numeroAttivazioni} attivazion{c.numeroAttivazioni === 1 ? "e" : "i"}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
          </button>
        ))}
      </div>

      <Dialog open={!!aperto} onOpenChange={(v) => !v && setAperto(null)}>
        <DialogContent>{aperto && <DettaglioBuyGo cliente={aperto} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function DettaglioBuyGo({ cliente }: { cliente: ClienteBuyGo }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{cliente.nome}</DialogTitle>
        <DialogDescription>
          {cliente.profilo} — {cliente.numeroAttivazioni} attivazion{cliente.numeroAttivazioni === 1 ? "e" : "i"}, {formattaValuta(cliente.totalePagato)} incassati
          {cliente.totaleNonPagato > 0 ? `, ${formattaValuta(cliente.totaleNonPagato)} da incassare` : ""}.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5 text-sm">
        {cliente.attivazioni.length === 0 && <p className="text-sm text-muted-foreground">Nessuna fattura trovata per questo cliente.</p>}
        {cliente.attivazioni.map((a, i) => (
          <div key={i} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">
                {a.emissione ? new Date(a.emissione).toLocaleDateString("it-IT") : "—"}
                {a.tipo_pagamento ? ` · ${a.tipo_pagamento}` : ""}
              </div>
              <div className="font-mono text-[11px] text-muted-foreground">Fattura {a.numero}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-semibold tabular-nums">{formattaValuta(a.importo)}</div>
              <span className={`text-[11px] font-semibold ${a.pagata ? "text-success" : "text-critical"}`}>{a.pagata ? "Pagata" : "Non pagata"}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
