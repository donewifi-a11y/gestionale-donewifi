"use client";

import { useEffect, useMemo, useState } from "react";
import { UserRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { aggiornaStatoTicket } from "@/app/(app)/tickets/actions";
import type { PrioritaTicket, StatoTicket, Ticket } from "@/lib/types";
import { REPARTI, CATEGORIE_TICKET } from "@/lib/types";

const SEQUENZA_STATO: StatoTicket[] = ["Da gestire", "In lavorazione", "In attesa", "Completato"];
// ★ le colonne mostrano prima i casi Urgenti: la priorità non si perde
// nello scroll di una colonna lunga.
const ORDINE_PRIORITA: Record<PrioritaTicket, number> = { Urgente: 0, Normale: 1, Bassa: 2 };

const COLORE_PRIORITA: Record<PrioritaTicket, string> = {
  Urgente: "bg-critical/10 text-critical border-critical/20",
  Normale: "bg-warning/10 text-warning border-warning/20",
  Bassa: "bg-success/10 text-success border-success/20",
};

const STRIPE_PRIORITA: Record<PrioritaTicket, string> = {
  Urgente: "before:bg-critical",
  Normale: "before:bg-warning",
  Bassa: "before:bg-success",
};

const COLORE_REPARTO: Record<string, string> = {
  "Analisi Rete": "bg-accent text-accent-foreground border-accent",
  Commerciale: "bg-secondary text-secondary-foreground border-transparent",
  Fatturazione: "bg-success/10 text-success border-success/20",
};

const CHIAVE_FILTRI = "ticketsFiltri";

export function TicketsBoard({ tickets, currentUserId }: { tickets: Ticket[]; currentUserId: string }) {
  const [fStato, setFStato] = useState("");
  const [fCategoria, setFCategoria] = useState("");
  const [fPriorita, setFPriorita] = useState("");
  const [fReparto, setFReparto] = useState("");
  const [soloMiei, setSoloMiei] = useState(false);
  const [aperto, setAperto] = useState<Ticket | null>(null);
  const [pronto, setPronto] = useState(false);

  // ★ filtri ricordati per utente/browser (stessa idea già applicata su
  // Hub Ticket nel gestionale precedente): non si riparte mai da zero.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(CHIAVE_FILTRI) || "{}");
      setFStato(s.stato || "");
      setFCategoria(s.categoria || "");
      setFPriorita(s.priorita || "");
      setFReparto(s.reparto || "");
      setSoloMiei(!!s.soloMiei);
    } catch {}
    setPronto(true);
  }, []);
  useEffect(() => {
    if (!pronto) return;
    localStorage.setItem(
      CHIAVE_FILTRI,
      JSON.stringify({ stato: fStato, categoria: fCategoria, priorita: fPriorita, reparto: fReparto, soloMiei })
    );
  }, [fStato, fCategoria, fPriorita, fReparto, soloMiei, pronto]);

  const filtrati = useMemo(
    () =>
      tickets
        .filter(
          (t) =>
            (!fStato || t.stato === fStato) &&
            (!fCategoria || t.categoria === fCategoria) &&
            (!fPriorita || t.priorita === fPriorita) &&
            (!fReparto || t.reparto === fReparto) &&
            (!soloMiei || t.tecnico_assegnato === currentUserId)
        )
        .sort((a, b) => ORDINE_PRIORITA[a.priorita] - ORDINE_PRIORITA[b.priorita]),
    [tickets, fStato, fCategoria, fPriorita, fReparto, soloMiei, currentUserId]
  );

  const colonne: { titolo: string; stati: StatoTicket[] }[] = [
    { titolo: "Da Lavorare", stati: ["Da gestire"] },
    { titolo: "In Verifica", stati: ["In lavorazione", "In attesa"] },
    { titolo: "Lavorata", stati: ["Completato"] },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={fStato} onChange={setFStato} placeholder="Tutti gli stati" options={SEQUENZA_STATO} />
        <Select value={fCategoria} onChange={setFCategoria} placeholder="Tutte le categorie" options={[...CATEGORIE_TICKET]} />
        <Select value={fPriorita} onChange={setFPriorita} placeholder="Tutte le priorità" options={["Urgente", "Normale", "Bassa"]} />
        <Select value={fReparto} onChange={setFReparto} placeholder="Tutti i reparti" options={[...REPARTI]} />
        <Button
          size="sm"
          variant={soloMiei ? "default" : "outline"}
          onClick={() => setSoloMiei((v) => !v)}
        >
          <UserRound className="h-3.5 w-3.5" strokeWidth={2.5} />
          Solo i miei
        </Button>
        {(fStato || fCategoria || fPriorita || fReparto || soloMiei) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFStato("");
              setFCategoria("");
              setFPriorita("");
              setFReparto("");
              setSoloMiei(false);
            }}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
            Azzera filtri
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {colonne.map((col) => {
          const items = filtrati.filter((t) => col.stati.includes(t.stato));
          return (
            <div key={col.titolo} className="rounded-2xl bg-muted/50 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="font-heading text-sm font-bold">{col.titolo}</span>
                <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground shadow-sm">
                  {items.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Nessun ticket.
                  </div>
                )}
                {items.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setAperto(t)}
                    className={`relative overflow-hidden rounded-xl border bg-card p-3 pl-4 text-left text-sm shadow-sm transition before:absolute before:inset-y-0 before:left-0 before:w-1 hover:shadow-md hover:border-primary/40 ${STRIPE_PRIORITA[t.priorita]}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-semibold">{t.cliente}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">#{t.numero}</span>
                    </div>
                    <div className="mb-2 text-xs text-muted-foreground line-clamp-1">{t.categoria}</div>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className={COLORE_PRIORITA[t.priorita]}>
                        {t.priorita}
                      </Badge>
                      <Badge variant="outline" className={COLORE_REPARTO[t.reparto] ?? ""}>
                        {t.reparto}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Sheet open={!!aperto} onOpenChange={(v) => !v && setAperto(null)}>
        <SheetContent>
          {aperto && <DettaglioTicket ticket={aperto} onCambiato={(t) => setAperto(t)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border bg-background px-3 text-sm"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function DettaglioTicket({ ticket, onCambiato }: { ticket: Ticket; onCambiato: (t: Ticket) => void }) {
  const [inCorso, setInCorso] = useState(false);

  async function cambiaStato(nuovo: StatoTicket) {
    if (nuovo === ticket.stato) return;
    if (
      nuovo === "Completato" &&
      !confirm(`Segnare il ticket #${ticket.numero} come Completato?`)
    ) {
      return;
    }
    setInCorso(true);
    try {
      await aggiornaStatoTicket(ticket.id, nuovo, ticket.stato);
      onCambiato({ ...ticket, stato: nuovo });
    } finally {
      setInCorso(false);
    }
  }

  const idx = SEQUENZA_STATO.indexOf(ticket.stato);

  return (
    <>
      <SheetHeader>
        <SheetTitle>{ticket.cliente}</SheetTitle>
        <SheetDescription>
          #{ticket.numero} · {ticket.categoria}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4 pb-4 text-sm">
        {ticket.stato === "Annullato" ? (
          <Badge variant="outline" className="w-fit">
            Annullato
          </Badge>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {SEQUENZA_STATO.map((s, i) => (
              <button
                key={s}
                disabled={inCorso}
                onClick={() => cambiaStato(s)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  i === idx
                    ? "bg-primary text-primary-foreground border-primary"
                    : i < idx
                    ? "bg-success/10 text-success border-success/20"
                    : "bg-muted text-muted-foreground hover:border-primary/40"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <Campo etichetta="Reparto" valore={ticket.reparto} />
        <Campo etichetta="Priorità" valore={ticket.priorita} />
        <Campo etichetta="Telefono" valore={ticket.telefono || "—"} />
        <Campo etichetta="Email" valore={ticket.email || "—"} />
        <Campo etichetta="Indirizzo" valore={ticket.indirizzo || "—"} />
        <Campo etichetta="Problema / Note" valore={ticket.problema || "—"} />
      </div>
    </>
  );
}

function Campo({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{etichetta}</div>
      <div className="font-medium">{valore}</div>
    </div>
  );
}