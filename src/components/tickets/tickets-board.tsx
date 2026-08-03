"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserRound, X, Search, ChevronRight, UserPlus, NotebookText, Send, FileText, FileSignature, CalendarPlus, CalendarCheck2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  aggiornaStatoTicket,
  assegnaTicket,
  aggiungiNotaTicket,
  getNoteTicket,
  inviaEmailApprovazioneTicket,
  cambiaRepartoTicket,
} from "@/app/(app)/tickets/actions";
import { urlContratto } from "@/app/(app)/segnalazioni/actions";
import { creaAppuntamento, getSlotOccupatiProssimi, type SlotOccupato } from "@/app/(app)/calendario/actions";
import { InvioLinkCliente } from "@/components/condivisi/invio-link";
import { RapportinoForm, RapportinoVista } from "@/components/tickets/rapportino";
import { SchedaVista } from "@/components/schede/scheda-vista";
import { getSchedaLavoroPerTicket } from "@/app/(app)/calendario/actions";
import { SLUG_RICHIESTE_CLIENTE, RICHIESTE_CLIENTE_CONFIG } from "@/lib/richieste-cliente-config";
import { getRapportinoTicket } from "@/app/(app)/tickets/actions";
import type { NotaTicket, Persona, PrioritaTicket, StatoTicket, Ticket, RapportinoIntervento, SchedaLavoro, TipoServizioAppuntamento } from "@/lib/types";
import { REPARTI, CATEGORIE_TICKET, TIPI_SERVIZIO_APPUNTAMENTO } from "@/lib/types";
import { CONFIG_SOTTOCATEGORIE } from "@/lib/campi-ticket";
import { urlDocumentoRapportino } from "@/app/(app)/tickets/actions";

const PRATICHE_INVIABILI = [
  { slug: "disdetta" as const, titolo: "Disdetta contratto" },
  ...SLUG_RICHIESTE_CLIENTE.map((slug) => ({ slug, titolo: RICHIESTE_CLIENTE_CONFIG[slug].titolo })),
];

const SEQUENZA_STATO: StatoTicket[] = ["Da gestire", "In lavorazione", "In attesa", "Completato"];
// ★ le colonne mostrano prima i casi Urgenti: la priorità non si perde
// nello scroll di una colonna lunga.
const ORDINE_PRIORITA: Record<PrioritaTicket, number> = { Urgente: 0, Normale: 1, Bassa: 2 };

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

const COLONNE: { titolo: string; stati: StatoTicket[]; vuoto: string }[] = [
  { titolo: "Da Lavorare", stati: ["Da gestire"], vuoto: "Nessun ticket da lavorare al momento" },
  { titolo: "In Verifica", stati: ["In lavorazione", "In attesa"], vuoto: "Nessun ticket in verifica al momento" },
  { titolo: "Lavorata", stati: ["Completato"], vuoto: "Nessun ticket lavorato al momento" },
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
  const searchParams = useSearchParams();
  const [ricerca, setRicerca] = useState("");
  const [fStato, setFStato] = useState("");
  const [fCategoria, setFCategoria] = useState("");
  const [fPriorita, setFPriorita] = useState("");
  const [fReparto, setFReparto] = useState("");
  const [soloMiei, setSoloMiei] = useState(false);
  const [aperto, setAperto] = useState<Ticket | null>(null);
  const [pronto, setPronto] = useState(false);

  // ★ apre direttamente un ticket via ?aperto=<id> — usato dalla ricerca
  // globale e dal link "vai al ticket" dopo aver trasmesso una Segnalazione.
  useEffect(() => {
    const id = searchParams.get("aperto");
    if (!id) return;
    const trovato = tickets.find((t) => t.id === id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizza con l'URL (?aperto=id), stesso caso di segnalazioni-board.tsx.
    if (trovato) setAperto(trovato);
  }, [searchParams, tickets]);

  // ★ filtri ricordati per utente/browser (stessa idea già applicata su
  // Hub Ticket nel gestionale precedente): non si riparte mai da zero.
  // Letto in un effetto e non nel lazy initializer perché il componente è
  // renderizzato anche lato server, dove localStorage non esiste — vedi
  // stesso ragionamento in segnalazioni-board.tsx.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(CHIAVE_FILTRI) || "{}");
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // ★ passare a Completato richiede il rapportino di chiusura: si apre il
    // dettaglio invece di aggiornare subito lo stato da qui.
    if (prossimo === "Completato") {
      setAperto(t);
      return;
    }
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
                  <div className="flex items-center justify-center px-4 py-8 text-center text-xs text-muted-foreground/70">
                    {col.vuoto}
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
                      <div className="mb-2 text-xs text-muted-foreground line-clamp-1">
                        {t.categoria}
                        {t.sottocategoria && ` · ${t.sottocategoria}`}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusBadge status={t.priorita} />
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
  const [praticaScelta, setPraticaScelta] = useState("");
  const [inCorsoApprovazione, setInCorsoApprovazione] = useState(false);
  const [inCorsoReparto, setInCorsoReparto] = useState(false);
  const [esitoApprovazione, setEsitoApprovazione] = useState("");
  const [mostraRapportinoForm, setMostraRapportinoForm] = useState(false);
  const [rapportino, setRapportino] = useState<RapportinoIntervento | null>(null);
  const [scheda, setScheda] = useState<SchedaLavoro | null>(null);
  const assegnatario = ticket.tecnico_assegnato ? persone.find((p) => p.id === ticket.tecnico_assegnato) : null;

  useEffect(() => {
    if (ticket.stato === "Completato") {
      // ★ un Ticket completato via appuntamento (Vista Tecnico) ha una
      // Scheda di Installazione/Lavorazione al posto del rapportino
      // generico — mai entrambi per lo stesso ticket.
      getSchedaLavoroPerTicket(ticket.id).then((s) => setScheda((s as SchedaLavoro) ?? null));
      getRapportinoTicket(ticket.id).then((r) => setRapportino((r as RapportinoIntervento) ?? null));
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ramo sincrono del fetch sopra (ticket non completato = nessun rapportino/scheda da caricare), non un caso separato di "derivabile durante il render".
      setRapportino(null);
      setScheda(null);
    }
    setMostraRapportinoForm(false);
  }, [ticket.id, ticket.stato]);

  const linkPratica = useMemo(() => {
    if (!praticaScelta || typeof window === "undefined") return "";
    const origine = window.location.origin;
    if (praticaScelta === "disdetta") return `${origine}/disdetta?ticket=${ticket.numero}`;
    return `${origine}/richiesta-cliente/${praticaScelta}?ticketId=${ticket.id}`;
  }, [praticaScelta, ticket.numero, ticket.id]);
  const primoNomeCliente = ticket.cliente.trim().split(/\s+/)[0];
  const messaggioPratica = `Ciao ${primoNomeCliente}, per la tua pratica Done Wifi apri questo link: ${linkPratica}`;

  async function inviaApprovazione() {
    setInCorsoApprovazione(true);
    setEsitoApprovazione("");
    const risultato = await inviaEmailApprovazioneTicket(ticket.id, window.location.origin);
    setInCorsoApprovazione(false);
    setEsitoApprovazione(risultato.errore ? risultato.errore : "Email di approvazione inviata.");
  }

  async function cambiaReparto(nuovo: (typeof REPARTI)[number]) {
    if (nuovo === ticket.reparto) return;
    setInCorsoReparto(true);
    const risultato = await cambiaRepartoTicket(ticket.id, nuovo, ticket.reparto);
    setInCorsoReparto(false);
    if (risultato.errore) {
      alert(risultato.errore);
      return;
    }
    onCambiato({ ...ticket, reparto: nuovo });
    router.refresh();
  }

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
    // ★ passare a Completato richiede il rapportino di chiusura invece di
    // un semplice confirm() — vedi form sotto.
    if (nuovo === "Completato") {
      setMostraRapportinoForm(true);
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
          {ticket.sottocategoria && ` · ${ticket.sottocategoria}`}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4 pb-4 text-sm">
        {ticket.stato === "Annullato" ? (
          <StatusBadge status="Annullato" className="w-fit" />
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

        {mostraRapportinoForm && (
          <RapportinoForm
            ticketId={ticket.id}
            ticketNumero={ticket.numero}
            statoVecchio={ticket.stato}
            onAnnulla={() => setMostraRapportinoForm(false)}
            onSalvato={() => {
              setMostraRapportinoForm(false);
              onCambiato({ ...ticket, stato: "Completato" });
              router.refresh();
            }}
          />
        )}

        {ticket.stato === "Completato" && scheda && <SchedaVista scheda={scheda} />}
        {ticket.stato === "Completato" && !scheda && rapportino && (
          <RapportinoVista rapportino={rapportino} importoFatturato={ticket.importo_fatturato} />
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

        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Reparto</div>
          <select
            value={ticket.reparto}
            disabled={inCorsoReparto}
            onChange={(e) => cambiaReparto(e.target.value as (typeof REPARTI)[number])}
            className="mt-1 h-8 rounded-md border bg-background px-2 text-xs font-medium"
          >
            {REPARTI.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <Campo etichetta="Priorità" valore={ticket.priorita} />
        <Campo etichetta="Telefono" valore={ticket.telefono || "—"} />
        <Campo etichetta="Email" valore={ticket.email || "—"} />
        <Campo etichetta="Indirizzo" valore={ticket.indirizzo || "—"} />
        <Campo etichetta="Problema / Note" valore={ticket.problema || "—"} />
        {ticket.sottocategoria && Object.keys(ticket.dettagli_extra || {}).length > 0 && (
          <DettagliExtra sottocategoria={ticket.sottocategoria} dettagli={ticket.dettagli_extra} />
        )}
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

        <PianificaAppuntamento ticket={ticket} persone={persone} />

        <div className="border-t pt-4">
          <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <FileSignature className="h-3.5 w-3.5" strokeWidth={2.25} />
            Invia una pratica al cliente
          </div>
          <select
            value={praticaScelta}
            onChange={(e) => setPraticaScelta(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-xs"
          >
            <option value="">Scegli una pratica...</option>
            {PRATICHE_INVIABILI.map((p) => (
              <option key={p.slug} value={p.slug}>{p.titolo}</option>
            ))}
          </select>
          {praticaScelta && (
            <div className="mt-2.5">
              <InvioLinkCliente
                url={linkPratica}
                telefono={ticket.telefono}
                email={ticket.email}
                messaggio={messaggioPratica}
                oggetto={`Done Wifi — ${PRATICHE_INVIABILI.find((p) => p.slug === praticaScelta)?.titolo ?? "pratica"}`}
              />
            </div>
          )}

          {ticket.email && (
            <div className="mt-3 border-t pt-3">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Intervento risolto da remoto?
              </p>
              <Button size="sm" variant="outline" disabled={inCorsoApprovazione} onClick={inviaApprovazione}>
                {inCorsoApprovazione ? "Invio..." : "Invia email di approvazione"}
              </Button>
              {esitoApprovazione && <p className="mt-1.5 text-xs text-muted-foreground">{esitoApprovazione}</p>}
            </div>
          )}
        </div>

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
function DettagliExtra({ sottocategoria, dettagli }: { sottocategoria: string; dettagli: Record<string, string> }) {
  const config = CONFIG_SOTTOCATEGORIE[sottocategoria];

  async function apriAllegato() {
    const percorso = dettagli._allegato;
    if (!percorso) return;
    const risultato = await urlDocumentoRapportino(percorso);
    if (risultato.errore || !risultato.url) {
      alert(risultato.errore || "Errore imprevisto.");
      return;
    }
    window.open(risultato.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Dettagli — {sottocategoria}
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        {Object.entries(dettagli)
          .filter(([chiave]) => chiave !== "_allegato" && chiave !== "_allegatoNome")
          .map(([chiave, valore]) => {
            const label = config?.campi.find((c) => c.id === chiave)?.label ?? chiave;
            return (
              <div key={chiave}>
                <span className="font-semibold">{label}: </span>
                {valore}
              </div>
            );
          })}
        {dettagli._allegato && (
          <button onClick={apriAllegato} className="w-fit text-primary underline-offset-2 hover:underline">
            📎 {dettagli._allegatoNome || "Vedi allegato"}
          </button>
        )}
      </div>
    </div>
  );
}

/** ★ NUOVA — pianifica un appuntamento senza uscire dal Ticket: mostra gli
 * slot già occupati nei prossimi 14 giorni e permette di "Assegnare e
 * fissare" in un click, tecnico e indirizzo già precompilati dal ticket. */
function PianificaAppuntamento({ ticket, persone }: { ticket: Ticket; persone: Persona[] }) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [slot, setSlot] = useState<SlotOccupato[]>([]);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [fatto, setFatto] = useState(false);

  useEffect(() => {
    if (aperto) getSlotOccupatiProssimi().then(setSlot);
  }, [aperto]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const data = String(dati.get("data") || "");
    const ora = String(dati.get("ora") || "");
    if (!data || !ora) return setErrore("Imposta data e ora.");

    setInCorso(true);
    const risultato = await creaAppuntamento({
      titolo: `${ticket.categoria}${ticket.sottocategoria ? ` — ${ticket.sottocategoria}` : ""} · ${ticket.cliente}`,
      indirizzo: ticket.indirizzo || "",
      dataOra: new Date(`${data}T${ora}`).toISOString(),
      durataMinuti: Number(dati.get("durata") || 60),
      tecnicoId: String(dati.get("tecnico") || ""),
      ticketId: ticket.id,
      note: "",
      tipoServizio: String(dati.get("tipo_servizio") || "Lavorazione tecnica") as TipoServizioAppuntamento,
    });
    setInCorso(false);
    if (risultato.errore) return setErrore(risultato.errore);
    setFatto(true);
    router.refresh();
  }

  if (!aperto) {
    return (
      <Button size="sm" variant="outline" className="w-fit" onClick={() => setAperto(true)}>
        <CalendarPlus className="h-3.5 w-3.5" strokeWidth={2.25} />
        Pianifica appuntamento
      </Button>
    );
  }

  if (fatto) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-medium text-success">
        <CalendarCheck2 className="h-3.5 w-3.5" strokeWidth={2.25} />
        Appuntamento fissato — visibile in Calendario.
      </p>
    );
  }

  const slotPerGiorno = slot.reduce<Record<string, SlotOccupato[]>>((acc, s) => {
    const giorno = s.data_ora.slice(0, 10);
    (acc[giorno] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <CalendarPlus className="h-3.5 w-3.5" strokeWidth={2.25} />
        Pianifica appuntamento
      </p>

      {Object.keys(slotPerGiorno).length > 0 && (
        <div className="mb-3 max-h-28 overflow-y-auto rounded-lg bg-muted/50 p-2 text-xs">
          <p className="mb-1 font-semibold text-muted-foreground">Slot già occupati (prossimi 14 giorni)</p>
          {Object.entries(slotPerGiorno).map(([giorno, items]) => (
            <div key={giorno} className="mb-1">
              <span className="font-semibold">
                {new Date(`${giorno}T00:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}:
              </span>{" "}
              {items
                .map((s) => {
                  const tecnico = persone.find((p) => p.id === s.tecnico_id)?.nome;
                  const ora = new Date(s.data_ora).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
                  return `${ora}${tecnico ? ` (${tecnico})` : ""}`;
                })
                .join(", ")}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <select name="tipo_servizio" defaultValue="Lavorazione tecnica" className="h-8 rounded-md border bg-background px-2 text-xs">
          {TIPI_SERVIZIO_APPUNTAMENTO.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <div className="grid grid-cols-3 gap-2">
          <input type="date" name="data" required className="h-8 rounded-md border bg-background px-2 text-xs" />
          <input type="time" name="ora" required className="h-8 rounded-md border bg-background px-2 text-xs" />
          <select name="durata" defaultValue="60" className="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="30">30 min</option>
            <option value="60">1 ora</option>
            <option value="90">1h30</option>
            <option value="120">2 ore</option>
          </select>
        </div>
        <select name="tecnico" defaultValue={ticket.tecnico_assegnato ?? ""} className="h-8 rounded-md border bg-background px-2 text-xs">
          <option value="">Nessun tecnico</option>
          {persone.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
        {errore && <p className="text-xs text-critical">{errore}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={inCorso} className="flex-1">
            {inCorso ? "Fisso..." : "Assegna e fissa"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAperto(false)}>
            Annulla
          </Button>
        </div>
      </form>
    </div>
  );
}
