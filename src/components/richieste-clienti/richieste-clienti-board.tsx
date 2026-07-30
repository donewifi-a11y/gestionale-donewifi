"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { aggiornaStatoRichiestaCliente, urlDocumentoRichiesta } from "@/app/(app)/richieste-clienti/actions";
import type { RichiestaCliente } from "@/lib/types";

const STATI = ["Da Lavorare", "Lavorata"];

const COLORE_TIPO: Record<string, string> = {
  "Cambio IBAN": "bg-success/10 text-success border-success/20",
  "Cambio Anagrafica": "bg-success/10 text-success border-success/20",
  Trasferimento: "bg-accent text-accent-foreground border-accent",
  Subentro: "bg-accent text-accent-foreground border-accent",
  "Richiesta Dati": "bg-secondary text-secondary-foreground border-transparent",
};

export function RichiesteClientiBoard({ richieste }: { richieste: RichiestaCliente[] }) {
  const [ricerca, setRicerca] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fStato, setFStato] = useState("");
  const [aperta, setAperta] = useState<RichiestaCliente | null>(null);

  const tipi = useMemo(() => Array.from(new Set(richieste.map((r) => r.tipo_richiesta))), [richieste]);

  const filtrate = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    return richieste.filter(
      (r) =>
        (!fTipo || r.tipo_richiesta === fTipo) &&
        (!fStato || r.stato === fStato) &&
        (!testo || (r.cliente || "").toLowerCase().includes(testo))
    );
  }, [richieste, fTipo, fStato, ricerca]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
          <input
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca cliente..."
            className="h-9 w-48 rounded-md border bg-background pl-8 pr-3 text-sm"
          />
        </div>
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="">Tutti i tipi</option>
          {tipi.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={fStato} onChange={(e) => setFStato(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="">Tutti gli stati</option>
          {STATI.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {filtrate.length === 0 && (
          <p className="p-5 text-center text-sm text-muted-foreground">Nessuna richiesta.</p>
        )}
        {filtrate.map((r) => (
          <button
            key={r.id}
            onClick={() => setAperta(r)}
            className="flex w-full items-center justify-between gap-3 border-t p-3.5 text-left text-sm transition first:border-t-0 hover:bg-muted/40"
          >
            <div>
              <div className="font-semibold">{r.cliente || "—"}</div>
              <div className="text-xs text-muted-foreground">
                {new Date(r.data).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={COLORE_TIPO[r.tipo_richiesta] ?? ""}>
                {r.tipo_richiesta}
              </Badge>
              {r.stato === "Lavorata" ? (
                <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Lavorata</span>
              ) : (
                <span className="rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning">Da Lavorare</span>
              )}
            </div>
          </button>
        ))}
      </div>

      <Sheet open={!!aperta} onOpenChange={(v) => !v && setAperta(null)}>
        <SheetContent>
          {aperta && <DettaglioRichiesta richiesta={aperta} onCambiata={(r) => setAperta(r)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DettaglioRichiesta({
  richiesta,
  onCambiata,
}: {
  richiesta: RichiestaCliente;
  onCambiata: (r: RichiestaCliente) => void;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);

  async function cambiaStato(nuovo: string) {
    if (nuovo === richiesta.stato) return;
    setInCorso(true);
    try {
      await aggiornaStatoRichiestaCliente(richiesta.id, nuovo);
      onCambiata({ ...richiesta, stato: nuovo });
      router.refresh();
    } finally {
      setInCorso(false);
    }
  }

  async function apriDocumento(percorso: string) {
    const risultato = await urlDocumentoRichiesta(percorso);
    if (risultato.errore || !risultato.url) {
      alert(risultato.errore || "Errore imprevisto.");
      return;
    }
    window.open(risultato.url, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{richiesta.cliente || "Richiesta"}</SheetTitle>
        <SheetDescription>{richiesta.tipo_richiesta}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4 pb-4 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {STATI.map((s) => (
            <button
              key={s}
              disabled={inCorso}
              onClick={() => cambiaStato(s)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                s === richiesta.stato
                  ? "border-primary bg-gradient-to-b from-primary to-[color-mix(in_oklch,var(--primary),black_14%)] text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:border-primary/40"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {Object.entries(richiesta.dettagli || {}).map(([chiave, valore]) =>
          valore ? (
            <div key={chiave}>
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{chiave}</div>
              <div className="font-medium">{valore}</div>
            </div>
          ) : null
        )}

        {richiesta.documenti?.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Documenti</div>
            <div className="flex flex-col gap-1.5">
              {richiesta.documenti.map((doc, i) => (
                <Button key={i} size="sm" variant="outline" className="w-fit justify-start" onClick={() => apriDocumento(doc.percorso)}>
                  <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
                  {doc.tipo ? `${doc.tipo} — ${doc.nome}` : doc.nome}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
