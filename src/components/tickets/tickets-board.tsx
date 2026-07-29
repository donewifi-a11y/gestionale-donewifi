"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound, X, Search, ChevronRight, UserPlus, NotebookText, Send, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { aggiornaStatoTicket, assegnaTicket, aggiungiNotaTicket, getNoteTicket } from "@/app/(app)/tickets/actions";
import { urlContratto } from "@/app/(app)/segnalazioni/actions";
import type { NotaTicket, Persona, PrioritaTicket, StatoTicket, Ticket } from "@/lib/types";
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

const COLONNE: { titolo: string; stati: StatoTicket[] }[] = [
  { titolo: "Da Lavorare", stati: ["Da gestire"] },
  { titolo: "In Verifica", stati: ["In lavorazione", "In attesa"] },
  { titolo: "Lavorata", stati: ["Completato"] },
];

function iniziali(persona: Persona) {
  return persona.nome.slice(0, 2).toUpperCase();
}

export function TicketsBoard({
  tickets,
  currentPersonaId,
  persone,
}: {
  tickets: Ticket[];
  currentPersonaId: string;
  persone: Persona[];
}) {
  const router = useRouter();
  const [ricerca, setRicerca] = useState("");
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

  const filtrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    return tickets
      .filter(
        (t) =>
          (!fStato || t.stato === fStato) &&
          (!fCategoria || t.categoria === fCategoria) &&
          (!fPriorita || t.priorita === fPriorita) &&
          (!fReparto || t.reparto === fReparto) &&
          (!soloMiei || t.tecnico_assegnato === currentPersonaId) &&
          (!testo || t.cliente.toLowerCase().includes(testo) || String(t.numero).includes(testo))
      )
      .sort((a, b) => ORDINE_PRIORITA[a.priorita] - ORDINE_PRIORITA[b.priorita]);
  }, [tickets, fStato, fCategoria, fPriorita, fReparto, soloMiei, currentPersonaId, ricerca]);

  function trovaPersona(id: string | null) {
    return id ? persone.find((p) => p.id === id) ?? null : null;
  }

  async function avanzaStato(t: Ticket, e: React.MouseEvent) {
    e.stopPropagation();
    const idx = SEQUENZA_STATO.indexOf(t.stato);
    const prossimo = SEQUENZA_STATO[idx + 1];
    if (!prossimo) return;
    if (prossimo === "Completato" && !confirm(`Segnare il ticket #${t.numero} come Completato?`)) return;
    await aggiornaStatoTicket(t.id, prossimo, t.stato);
    router.refresh();
  }

  async function prendiInCarico(t: Ticket, e: React.MouseEvent) {
    e.stopPropagation();
    await assegnaTicket(t.id, currentPersonaId);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
          <input
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca cliente o numero..."
            className="h-9 w-48 rounded-md border bg-background pl-8 pr-3 text-sm"
          />
        </div>
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
        {(fStato || fCategoria || fPriorita || fReparto || soloMiei || ricerca) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setFStato("");
              setFCategoria("");
              setFPriorita("");
              setFReparto("");
              setSoloMiei(false);
              setRicerca("");
            }}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
            Azzera filtri
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLONNE.map((col) => {
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
                {items.map((t) => {
                  const assegnatario = trovaPersona(t.tecnico_assegnato);
                  const puoAvanzare = SEQUENZA_STATO.indexOf(t.stato) < SEQUENZA_STATO.length - 1;
                  return (
                    <div
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setAperto(t)}
                      onKeyDown={(e) => e.key === "Enter" && setAperto(t)}
                      className={`relative cursor-pointer overflow-hidden rounded-xl border bg-card p-3 pl-4 text-left text-sm shadow-md transition before:absolute before:inset-y-0 before:left-0 before:w-1 hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40 ${STRIPE_PRIORITA[t.priorita]}`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-semibold">{t.cliente}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">#{t.numero}</span>
                      </div>
                      <div className="mb-2 text-xs text-muted-foreground line-clamp-1">{t.categoria}</div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="outline" className={COLORE_PRIORITA[t.priorita]}>
                          {t.priorita}
                        </Badge>
                        <Badge variant="outline" className={COLORE_REPARTO[t.reparto] ?? ""}>
                          {t.reparto}
                        </Badge>

                        <div className="ml-auto flex items-center gap-1">
                          {assegnatario ? (
                            <span
                              title={assegnatario.nome}
                              className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                                assegnatario.id === currentPersonaId
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary text-secondary-foreground"
                              }`}
                            >
                              {iniziali(assegnatario)}
                            </span>
                          ) : (
                            <button
                              onClick={(e) => prendiInCarico(t, e)}
                              title="Prendi in carico"
                              className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed text-muted-foreground transition hover:border-primary hover:text-primary"
                            >
                              <UserPlus className="h-3 w-3" strokeWidth={2.5} />
                            </button>
                          )}
                          {puoAvanzare && (
                            <button
                              onClick={(e) => avanzaStato(t, e)}
                              title="Avanza allo stato successivo"
                              className="flex h-6 w-6 items-center justify-center rounded-full border text-muted-foreground transition hover:border-primary hover:bg-primary hover:text-primary-foreground"
                            >
                              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Sheet open={!!aperto} onOpenChange={(v) => !v && setAperto(null)}>
        <SheetContent>
          {aperto && (
            <DettaglioTicket
              ticket={aperto}
              persone={persone}
              currentPersonaId={currentPersonaId}
              onCambiato={(t) => setAperto(t)}
            />
          )}
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

function DettaglioTicket({
  ticket,
  persone,
  currentPersonaId,
  onCambiato,
}: {
  ticket: Ticket;
  persone: Persona[];
  currentPersonaId: string;
  onCambiato: (t: Ticket) => void;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [note, setNote] = useState<NotaTicket[]>([]);
  const [notaTesto, setNotaTesto] = useState("");
  const [invioNota, setInvioNota] = useState(false);
  const [erroreNota, setErroreNota] = useState("");
  const assegnatario = ticket.tecnico_assegnato ? persone.find((p) => p.id === ticket.tecnico_assegnato) : null;

  useEffect(() => {
    getNoteTicket(ticket.id).then(setNote);
  }, [ticket.id]);

  function trovaPersona(id: string | null) {
    return id ? persone.find((p) => p.id === id) ?? null : null;
  }

  async function inviaNota() {
    const testo = notaTesto.trim();
    if (!testo) return;
    setInvioNota(true);
    setErroreNota("");
    const risultato = await aggiungiNotaTicket(ticket.id, testo);
    setInvioNota(false);
    if (risultato.errore || !risultato.nota) {
      setErroreNota(risultato.errore || "Errore imprevisto.");
      return;
    }
    setNote((n) => [...n, risultato.nota]);
    setNotaTesto("");
  }

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
      router.refresh();
    } finally {
      setInCorso(false);
    }
  }

  async function prendiInCarico() {
    setInCorso(true);
    try {
      await assegnaTicket(ticket.id, currentPersonaId);
      onCambiato({ ...ticket, tecnico_assegnato: currentPersonaId });
      router.refresh();
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
                    ? "border-primary bg-gradient-to-b from-primary to-[color-mix(in_oklch,var(--primary),black_14%)] text-primary-foreground shadow-sm"
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

        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Assegnato a</div>
          {assegnatario ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {iniziali(assegnatario)}
              </span>
              <span className="font-medium">{assegnatario.nome}</span>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={prendiInCarico} disabled={inCorso} className="mt-1.5">
              <UserPlus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Prendi in carico
            </Button>
          )}
        </div>

        <Campo etichetta="Reparto" valore={ticket.reparto} />
        <Campo etichetta="Priorità" valore={ticket.priorita} />
        <Campo etichetta="Telefono" valore={ticket.telefono || "—"} />
        <Campo etichetta="Email" valore={ticket.email || "—"} />
        <Campo etichetta="Indirizzo" valore={ticket.indirizzo || "—"} />
        <Campo etichetta="Problema / Note" valore={ticket.problema || "—"} />
        {ticket.contratto_pdf_url && (
          <Button
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={async () => {
              const risultato = await urlContratto(ticket.contratto_pdf_url!);
              if (risultato.errore || !risultato.url) {
                alert(risultato.errore || "Errore imprevisto.");
                return;
              }
              window.open(risultato.url, "_blank", "noopener,noreferrer");
            }}
          >
            <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
            Vedi contratto
          </Button>
        )}

        <div className="border-t pt-4">
          <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <NotebookText className="h-3.5 w-3.5" strokeWidth={2.25} />
            Note e aggiornamenti
          </div>
          <div className="flex flex-col gap-2.5">
            {note.length === 0 && (
              <p className="text-xs text-muted-foreground">Nessun aggiornamento ancora.</p>
            )}
            {note.map((n) => {
              const autore = trovaPersona(n.autore_id);
              return (
                <div key={n.id} className="flex gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                    {autore ? iniziali(autore) : "?"}
                  </span>
                  <div className="flex-1 rounded-lg bg-muted/60 px-3 py-2">
                    <div className="mb-0.5 text-[10.5px] font-bold text-muted-foreground">
                      {autore?.nome || "Persona"} ·{" "}
                      {new Date(n.creato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="text-xs leading-relaxed">{n.testo}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2.5 flex gap-2">
            <input
              value={notaTesto}
              onChange={(e) => setNotaTesto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && inviaNota()}
              placeholder="Scrivi un aggiornamento su questo ticket..."
              className="h-9 flex-1 rounded-md border bg-background px-3 text-xs"
            />
            <Button size="icon" disabled={invioNota || !notaTesto.trim()} onClick={inviaNota}>
              <Send className="h-3.5 w-3.5" strokeWidth={2.5} />
            </Button>
          </div>
          {erroreNota && <p className="mt-1.5 text-xs text-critical">{erroreNota}</p>}
        </div>
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