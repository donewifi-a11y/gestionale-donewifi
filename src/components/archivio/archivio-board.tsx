"use client";

import { useMemo, useState } from "react";
import { Search, Ticket as TicketIcon, PhoneCall, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Segnalazione, Ticket } from "@/lib/types";

type Voce =
  | { tipo: "ticket"; data: string; item: Ticket }
  | { tipo: "segnalazione"; data: string; item: Segnalazione };

export function ArchivioBoard({ tickets, segnalazioni }: { tickets: Ticket[]; segnalazioni: Segnalazione[] }) {
  const [ricerca, setRicerca] = useState("");
  const [aperto, setAperto] = useState<string | null>(null);

  const voci = useMemo<Voce[]>(() => {
    const t: Voce[] = tickets.map((item) => ({ tipo: "ticket", data: item.data_creazione, item }));
    const s: Voce[] = segnalazioni.map((item) => ({ tipo: "segnalazione", data: item.data, item }));
    return [...t, ...s].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [tickets, segnalazioni]);

  const filtrate = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    if (!testo) return voci;
    return voci.filter((v) => {
      const nome = v.tipo === "ticket" ? v.item.cliente : v.item.nome;
      const numero = v.item.numero;
      return nome.toLowerCase().includes(testo) || String(numero).includes(testo);
    });
  }, [voci, ricerca]);

  return (
    <div>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
        <input
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          placeholder="Cerca cliente o numero..."
          className="h-9 w-64 rounded-md border bg-background pl-8 pr-3 text-sm"
        />
      </div>

      {filtrate.length === 0 && (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nessun risultato.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtrate.map((v) => {
          const chiave = `${v.tipo}-${v.item.id}`;
          const espansa = aperto === chiave;
          const nome = v.tipo === "ticket" ? v.item.cliente : v.item.nome;
          return (
            <div key={chiave} className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <button
                onClick={() => setAperto(espansa ? null : chiave)}
                className="flex w-full items-center gap-3 p-3 text-left text-sm"
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    v.tipo === "ticket" ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {v.tipo === "ticket" ? (
                    <TicketIcon className="h-4 w-4" strokeWidth={2.25} />
                  ) : (
                    <PhoneCall className="h-4 w-4" strokeWidth={2.25} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{nome}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">#{v.item.numero}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(v.data).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </div>
                </div>
                <Badge variant="outline" className={v.tipo === "ticket" && v.item.stato === "Annullato" ? "border-critical/20 bg-critical/10 text-critical" : "border-success/20 bg-success/10 text-success"}>
                  {v.tipo === "ticket" ? v.item.stato : "Trasmessa"}
                </Badge>
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${espansa ? "rotate-180" : ""}`} strokeWidth={2.25} />
              </button>
              {espansa && (
                <div className="border-t bg-muted/40 px-4 py-3">
                  {v.tipo === "ticket" ? <DettaglioTicket ticket={v.item} /> : <DettaglioSegnalazione segnalazione={v.item} />}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DettaglioTicket({ ticket }: { ticket: Ticket }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
      <Campo etichetta="Categoria" valore={ticket.categoria} />
      <Campo etichetta="Reparto" valore={ticket.reparto} />
      <Campo etichetta="Priorità" valore={ticket.priorita} />
      <Campo etichetta="Telefono" valore={ticket.telefono || "—"} />
      <Campo etichetta="Indirizzo" valore={ticket.indirizzo || "—"} />
      <Campo etichetta="Problema / Note" valore={ticket.problema || "—"} />
    </div>
  );
}

function DettaglioSegnalazione({ segnalazione }: { segnalazione: Segnalazione }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
      <Campo etichetta="Telefono" valore={segnalazione.telefono} />
      <Campo etichetta="Indirizzo" valore={`${segnalazione.via} ${segnalazione.civico}, ${segnalazione.comune}`} />
      <Campo etichetta="Tipologia" valore={segnalazione.tipologia_cliente || "—"} />
      <Campo etichetta="Profilo" valore={segnalazione.profilo_internet || "—"} />
      <Campo etichetta="Note" valore={segnalazione.note || "—"} />
    </div>
  );
}

function Campo({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{etichetta}</div>
      <div className="font-medium">{valore}</div>
    </div>
  );
}
