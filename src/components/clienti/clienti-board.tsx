"use client";

import { useMemo, useState } from "react";
import { Search, Phone, MapPin, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Ticket } from "@/lib/types";

interface Cliente {
  chiave: string;
  nome: string;
  telefono: string | null;
  indirizzo: string | null;
  ticket: Ticket[];
  ultimaAttivita: string;
  attivi: number;
}

export function ClientiBoard({ tickets }: { tickets: Ticket[] }) {
  const [ricerca, setRicerca] = useState("");
  const [aperto, setAperto] = useState<string | null>(null);

  const clienti = useMemo<Cliente[]>(() => {
    const mappa = new Map<string, Cliente>();
    for (const t of tickets) {
      const chiave = `${t.cliente.trim().toLowerCase()}|${(t.telefono || "").replace(/\D/g, "")}`;
      if (!mappa.has(chiave)) {
        mappa.set(chiave, {
          chiave,
          nome: t.cliente,
          telefono: t.telefono,
          indirizzo: t.indirizzo,
          ticket: [],
          ultimaAttivita: t.data_creazione,
          attivi: 0,
        });
      }
      const c = mappa.get(chiave)!;
      c.ticket.push(t);
      if (t.stato !== "Completato" && t.stato !== "Annullato") c.attivi += 1;
      if (new Date(t.data_creazione) > new Date(c.ultimaAttivita)) c.ultimaAttivita = t.data_creazione;
    }
    return Array.from(mappa.values()).sort(
      (a, b) => new Date(b.ultimaAttivita).getTime() - new Date(a.ultimaAttivita).getTime()
    );
  }, [tickets]);

  const filtrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    if (!testo) return clienti;
    return clienti.filter(
      (c) => c.nome.toLowerCase().includes(testo) || (c.telefono || "").includes(testo)
    );
  }, [clienti, ricerca]);

  return (
    <div>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
        <input
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          placeholder="Cerca cliente o telefono..."
          className="h-9 w-64 rounded-md border bg-background pl-8 pr-3 text-sm"
        />
      </div>

      {filtrati.length === 0 && (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nessun cliente trovato.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtrati.map((c) => {
          const espanso = aperto === c.chiave;
          return (
            <div key={c.chiave} className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <button
                onClick={() => setAperto(espanso ? null : c.chiave)}
                className="flex w-full items-center gap-3 p-3 text-left text-sm"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                  {c.nome.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{c.nome}</div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {c.telefono && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" strokeWidth={2.25} />
                        {c.telefono}
                      </span>
                    )}
                    {c.indirizzo && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.25} />
                        {c.indirizzo}
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="border-primary/20 bg-accent text-accent-foreground">
                  {c.ticket.length} ticket
                </Badge>
                {c.attivi > 0 && (
                  <Badge variant="outline" className="border-warning/20 bg-warning/10 text-warning">
                    {c.attivi} attivi
                  </Badge>
                )}
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${espanso ? "rotate-180" : ""}`} strokeWidth={2.25} />
              </button>
              {espanso && (
                <div className="flex flex-col gap-1.5 border-t bg-muted/40 px-4 py-3">
                  {c.ticket.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">
                        <span className="font-mono text-muted-foreground">#{t.numero}</span> {t.categoria} — {t.problema || "—"}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {new Date(t.data_creazione).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
