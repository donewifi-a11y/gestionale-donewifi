"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Ticket as TicketIcon, PhoneCall, ChevronDown, RotateCcw, FileText, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { riapriTicket } from "@/app/(app)/archivio/actions";
import { getRapportinoTicket } from "@/app/(app)/tickets/actions";
import { urlContratto } from "@/app/(app)/segnalazioni/actions";
import { RapportinoVista } from "@/components/tickets/rapportino";
import { useToast } from "@/components/ui/toast";
import type { RapportinoIntervento, Segnalazione, Ticket } from "@/lib/types";

type Voce =
  | { tipo: "ticket"; data: string; item: Ticket }
  | { tipo: "segnalazione"; data: string; item: Segnalazione };

export function ArchivioBoard({ tickets, segnalazioni }: { tickets: Ticket[]; segnalazioni: Segnalazione[] }) {
  const [ricerca, setRicerca] = useState("");
  const [dataDa, setDataDa] = useState("");
  const [dataA, setDataA] = useState("");
  const [aperto, setAperto] = useState<string | null>(null);

  const voci = useMemo<Voce[]>(() => {
    const t: Voce[] = tickets.map((item) => ({ tipo: "ticket", data: item.data_creazione, item }));
    const s: Voce[] = segnalazioni.map((item) => ({ tipo: "segnalazione", data: item.data, item }));
    return [...t, ...s].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [tickets, segnalazioni]);

  const filtrate = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    const daMs = dataDa ? new Date(dataDa).getTime() : null;
    const aMs = dataA ? new Date(`${dataA}T23:59:59`).getTime() : null;
    return voci.filter((v) => {
      const nome = v.tipo === "ticket" ? v.item.cliente : v.item.nome;
      const numero = v.item.numero;
      const testoOk = !testo || nome.toLowerCase().includes(testo) || String(numero).includes(testo);
      const t = new Date(v.data).getTime();
      const daOk = daMs === null || t >= daMs;
      const aOk = aMs === null || t <= aMs;
      return testoOk && daOk && aOk;
    });
  }, [voci, ricerca, dataDa, dataA]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
          <input
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca cliente o numero..."
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
          <Button size="sm" variant="ghost" onClick={() => { setDataDa(""); setDataA(""); }}>
            Azzera date
          </Button>
        )}
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
  const router = useRouter();
  const toast = useToast();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [rapportino, setRapportino] = useState<RapportinoIntervento | null>(null);

  useEffect(() => {
    if (ticket.stato === "Completato") {
      getRapportinoTicket(ticket.id).then(setRapportino);
    }
  }, [ticket.id, ticket.stato]);

  async function riapri() {
    if (!confirm(`Riaprire il ticket #${ticket.numero}? Tornerà in "Da gestire".`)) return;
    setInCorso(true);
    setErrore("");
    const risultato = await riapriTicket(ticket.id, ticket.stato);
    setInCorso(false);
    if (risultato.errore) {
      setErrore(risultato.errore);
      return;
    }
    router.refresh();
  }

  async function vediContratto() {
    if (!ticket.contratto_pdf_url) return;
    const risultato = await urlContratto(ticket.contratto_pdf_url);
    if (risultato.errore || !risultato.url) {
      toast(risultato.errore || "Errore imprevisto.");
      return;
    }
    window.open(risultato.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3">
        <Campo etichetta="Categoria" valore={ticket.categoria} />
        <Campo etichetta="Reparto" valore={ticket.reparto} />
        <Campo etichetta="Priorità" valore={ticket.priorita} />
        <Campo etichetta="Telefono" valore={ticket.telefono || "—"} />
        <Campo etichetta="Indirizzo" valore={ticket.indirizzo || "—"} />
        <Campo etichetta="Problema / Note" valore={ticket.problema || "—"} />
      </div>

      {rapportino && (
        <div className="text-xs">
          <RapportinoVista rapportino={rapportino} importoFatturato={ticket.importo_fatturato} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {ticket.contratto_pdf_url && (
          <Button size="sm" variant="outline" onClick={vediContratto}>
            <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
            Vedi contratto
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={inCorso} onClick={riapri}>
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.25} />
          {inCorso ? "Riapertura..." : "Riapri"}
        </Button>
      </div>
      {errore && (
        <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-xs text-critical">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
          {errore}
        </p>
      )}
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
