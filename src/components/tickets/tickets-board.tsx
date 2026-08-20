"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserRound, X, Search, ChevronRight, UserPlus, NotebookText, Send, FileText, FileSignature, CalendarPlus, CalendarCheck2, AlertTriangle, Trash2, Loader2, CheckCircle2, XCircle, Clock3 } from "lucide-react";
import { SuggerimentoCampo } from "@/components/ui/suggerimento-campo";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  aggiornaStatoTicket,
  assegnaTicket,
  aggiungiNotaTicket,
  getNoteTicket,
  inviaEmailApprovazioneTicket,
  inviaEmailPraticaCliente,
  inviaEmailPraticaGenerica,
  cambiaRepartoTicket,
  eliminaTicket,
} from "@/app/(app)/tickets/actions";
import { avviaPraticaSubentro, inviaLinkVecchioClienteSubentro } from "@/app/(app)/richieste-clienti/actions";
import { urlContratto } from "@/app/(app)/segnalazioni/actions";
import { creaAppuntamento, getSlotOccupatiProssimi, getAppuntamentoAttivoPerTicket, type SlotOccupato } from "@/app/(app)/calendario/actions";
import { InvioLinkCliente } from "@/components/condivisi/invio-link";
import { RapportinoForm, RapportinoVista } from "@/components/tickets/rapportino";
import { SchedaVista } from "@/components/schede/scheda-vista";
import { SchedaInstallazioneForm } from "@/components/schede/scheda-installazione-form";
import { SchedaLavorazioneForm } from "@/components/schede/scheda-lavorazione-form";
import { getSchedaLavoroPerTicket } from "@/app/(app)/calendario/actions";
import { SLUG_RICHIESTE_CLIENTE, RICHIESTE_CLIENTE_CONFIG } from "@/lib/richieste-cliente-config";
import { getRapportinoTicket } from "@/app/(app)/tickets/actions";
import { getRichiesteClientiPerTicket, urlDocumentoRichiesta } from "@/app/(app)/richieste-clienti/actions";
import { etichettaDettaglio } from "@/lib/etichette-dettagli";
import type { Appuntamento, MaterialeMagazzino, NotaTicket, Persona, PrioritaTicket, RichiestaCliente, StatoTicket, Ticket, RapportinoIntervento, SchedaLavoro, TipoServizioAppuntamento } from "@/lib/types";
import { REPARTI, CATEGORIE_TICKET, TIPI_SERVIZIO_APPUNTAMENTO, coloreReparto } from "@/lib/types";
import { CONFIG_SOTTOCATEGORIE } from "@/lib/campi-ticket";
import { urlDocumentoRapportino } from "@/app/(app)/tickets/actions";
import { useToast } from "@/components/ui/toast";
import { usePersistedState } from "@/lib/use-persisted-state";

const PRATICHE_INVIABILI = [
  { slug: "disdetta" as const, titolo: "Disdetta contratto" },
  ...SLUG_RICHIESTE_CLIENTE.map((slug) => ({ slug, titolo: RICHIESTE_CLIENTE_CONFIG[slug].titolo })),
];

// ★ collega le sottocategoria di Ticket (SOTTOCATEGORIE_TICKET) alla
// pratica pubblica corrispondente per nome — Trasferimento/Subentro/Cambio
// IBAN non hanno campi extra propri (vedi campi-ticket.ts) perché tutta la
// raccolta dati passa da qui.
const PRATICA_PER_SOTTOCATEGORIA: Record<string, (typeof PRATICHE_INVIABILI)[number]["slug"]> = {
  Trasferimento: "trasferimento",
  Subentro: "subentro",
  "Cambio IBAN": "cambio-iban",
  "Cambio Anagrafica": "cambio-anagrafica",
  Disdetta: "disdetta",
};

const SEQUENZA_STATO: StatoTicket[] = ["Da gestire", "In lavorazione", "In attesa", "Completato"];
// ★ le colonne mostrano prima i casi Urgenti: la priorità non si perde
// nello scroll di una colonna lunga.
const ORDINE_PRIORITA: Record<PrioritaTicket, number> = { Urgente: 0, Normale: 1, Bassa: 2 };

const CHIAVE_FILTRI = "ticketsFiltri";

const COLONNE: { titolo: string; stati: StatoTicket[]; vuoto: string }[] = [
  { titolo: "Da Lavorare", stati: ["Da gestire"], vuoto: "Nessun ticket da lavorare al momento" },
  { titolo: "In Verifica", stati: ["In lavorazione", "In attesa"], vuoto: "Nessun ticket in verifica al momento" },
  { titolo: "Lavorata", stati: ["Completato"], vuoto: "Nessun ticket lavorato al momento" },
];

function iniziali(persona: Persona) {
  return persona.nome.slice(0, 2).toUpperCase();
}

// ★ REDESIGN (2026-08), giro 2 — richiesta esplicita dopo aver rivisto lo
// screenshot reale: il caos non erano più i colori (già tolti al giro
// precedente) ma il testo di categoria, quasi sempre identico su ogni
// card di una colonna (es. 4 Ticket di fila con scritto "Assistenza ·
// Pianificazione installazione") — nessuna informazione nuova, solo
// ripetizione. Qui si raggruppano i Ticket per categoria/sottocategoria
// UNA VOLTA per colonna, invece che ripeterla su ogni riga — mantiene
// l'ordine con cui `items` è già stato ordinato (priorità prima, vedi
// ORDINE_PRIORITA), il gruppo compare nella posizione del suo primo Ticket.
function raggruppaPerCategoria(items: Ticket[]): { chiave: string; ticket: Ticket[] }[] {
  const gruppi: { chiave: string; ticket: Ticket[] }[] = [];
  const indice = new Map<string, number>();
  for (const t of items) {
    const chiave = t.categoria + (t.sottocategoria ? ` · ${t.sottocategoria}` : "");
    if (!indice.has(chiave)) {
      indice.set(chiave, gruppi.length);
      gruppi.push({ chiave, ticket: [] });
    }
    gruppi[indice.get(chiave)!].ticket.push(t);
  }
  return gruppi;
}

function giorniAperta(data: string) {
  const ms = Date.now() - new Date(data).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function TicketsBoard({
  tickets,
  currentPersonaId,
  persone,
  catalogoMateriali,
}: {
  tickets: Ticket[];
  currentPersonaId: string;
  persone: Persona[];
  catalogoMateriali: MaterialeMagazzino[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ricerca, setRicerca] = useState("");
  // ★ FIX — filtri ricordati per utente/browser (stessa idea già applicata
  // su Hub Ticket nel gestionale precedente): lettura/scrittura ora in
  // usePersistedState() (src/lib/use-persisted-state.ts), estratto da qui
  // e da segnalazioni-board.tsx dove la stessa logica era duplicata quasi
  // identica.
  const [filtri, aggiornaFiltri] = usePersistedState(CHIAVE_FILTRI, {
    stato: "",
    categoria: "",
    priorita: "",
    reparto: "",
    soloMiei: false,
    nonAssegnati: false,
  });
  const [aperto, setAperto] = useState<Ticket | null>(null);
  // ★ NUOVA — sollevato qui (la Scheda si apre in un Dialog centrale
  // separato dal Sheet di dettaglio Ticket, non più annidato dentro):
  // DettaglioTicket conosce già l'appuntamento collegato, lo passa su con
  // onApriScheda invece di doverlo rifetchare qui.
  const [schedaAperta, setSchedaAperta] = useState<Appuntamento | null>(null);

  // ★ apre direttamente un ticket via ?aperto=<id> — usato dalla ricerca
  // globale e dal link "vai al ticket" dopo aver trasmesso una Segnalazione.
  useEffect(() => {
    const id = searchParams.get("aperto");
    if (!id) return;
    const trovato = tickets.find((t) => t.id === id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizza con l'URL (?aperto=id), stesso caso di segnalazioni-board.tsx.
    if (trovato) setAperto(trovato);
  }, [searchParams, tickets]);

  // ★ NUOVA — richiesta esplicita: i KPI della Dashboard ("Ticket Urgenti",
  // "Non assegnati") erano numeri statici, non cliccabili — bisognava
  // uscire e ricostruire il filtro a mano. `?priorita=`/`?nonAssegnati=1`
  // applicano il filtro corrispondente al primo caricamento, stesso
  // principio del deep-link `?aperto=` sopra.
  useEffect(() => {
    const priorita = searchParams.get("priorita");
    const nonAssegnati = searchParams.get("nonAssegnati");
    if (!priorita && !nonAssegnati) return;
    aggiornaFiltri({
      ...(priorita ? { priorita } : {}),
      ...(nonAssegnati ? { nonAssegnati: true } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- va applicato solo al primo caricamento con questi parametri, non ad ogni cambio di `filtri`/`aggiornaFiltri` (che cambierebbero proprio a causa di questo effetto, creando un loop).
  }, [searchParams]);

  const filtrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    return tickets
      .filter(
        (t) =>
          (!filtri.stato || t.stato === filtri.stato) &&
          (!filtri.categoria || t.categoria === filtri.categoria) &&
          (!filtri.priorita || t.priorita === filtri.priorita) &&
          (!filtri.reparto || t.reparto === filtri.reparto) &&
          (!filtri.soloMiei || t.tecnico_assegnato === currentPersonaId) &&
          (!filtri.nonAssegnati || !t.tecnico_assegnato) &&
          (!testo || t.cliente.toLowerCase().includes(testo) || String(t.numero).includes(testo))
      )
      .sort((a, b) => ORDINE_PRIORITA[a.priorita] - ORDINE_PRIORITA[b.priorita]);
  }, [tickets, filtri, currentPersonaId, ricerca]);

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
        <Select value={filtri.stato} onChange={(v) => aggiornaFiltri({ stato: v })} placeholder="Tutti gli stati" options={SEQUENZA_STATO} />
        <Select value={filtri.categoria} onChange={(v) => aggiornaFiltri({ categoria: v })} placeholder="Tutte le categorie" options={[...CATEGORIE_TICKET]} />
        <Select value={filtri.priorita} onChange={(v) => aggiornaFiltri({ priorita: v })} placeholder="Tutte le priorità" options={["Urgente", "Normale", "Bassa"]} />
        <Select value={filtri.reparto} onChange={(v) => aggiornaFiltri({ reparto: v })} placeholder="Tutti i reparti" options={[...REPARTI]} />
        <Button
          size="sm"
          variant={filtri.soloMiei ? "default" : "outline"}
          onClick={() => aggiornaFiltri({ soloMiei: !filtri.soloMiei })}
        >
          <UserRound className="h-3.5 w-3.5" strokeWidth={2.5} />
          Solo i miei
        </Button>
        <Button
          size="sm"
          variant={filtri.nonAssegnati ? "default" : "outline"}
          onClick={() => aggiornaFiltri({ nonAssegnati: !filtri.nonAssegnati })}
        >
          <UserPlus className="h-3.5 w-3.5" strokeWidth={2.5} />
          Non assegnati
        </Button>
        {(filtri.stato || filtri.categoria || filtri.priorita || filtri.reparto || filtri.soloMiei || filtri.nonAssegnati || ricerca) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              aggiornaFiltri({ stato: "", categoria: "", priorita: "", reparto: "", soloMiei: false, nonAssegnati: false });
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
              <div className="flex flex-col gap-3">
                {items.length === 0 && (
                  <div className="flex items-center justify-center px-4 py-8 text-center text-xs text-muted-foreground/70">
                    {col.vuoto}
                  </div>
                )}
                {raggruppaPerCategoria(items).map((gruppo) => (
                  <div key={gruppo.chiave}>
                    {/* ★ l'etichetta di categoria/sottocategoria si scrive una
                    volta per gruppo invece che su ogni card — vedi
                    raggruppaPerCategoria() sopra. Il numero a destra è un
                    dato che prima non c'era da nessuna parte: quanti Ticket
                    sono fermi allo stesso identico passaggio. */}
                    <div className="mb-1 flex items-center justify-between gap-2 px-1">
                      <span className="truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground" title={gruppo.chiave}>
                        {gruppo.chiave}
                      </span>
                      <span className="shrink-0 text-[10px] font-bold tabular-nums text-muted-foreground/70">{gruppo.ticket.length}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {gruppo.ticket.map((t) => {
                        const assegnatario = trovaPersona(t.tecnico_assegnato);
                        const puoAvanzare = SEQUENZA_STATO.indexOf(t.stato) < SEQUENZA_STATO.length - 1;
                        const giorni = giorniAperta(t.data_creazione);
                        let segnale: { testo: string; critico: boolean } | null = null;
                        if (t.priorita === "Urgente") {
                          segnale = { testo: "🔴 Urgente", critico: true };
                        } else if (t.stato === "Da gestire" && giorni >= 5) {
                          segnale = { testo: `⏳ Ferma da ${giorni}g`, critico: giorni >= 10 };
                        }
                        const colore = coloreReparto(t.reparto);
                        return (
                          <div
                            key={t.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setAperto(t)}
                            onKeyDown={(e) => e.key === "Enter" && setAperto(t)}
                            className="group relative cursor-pointer rounded-lg border bg-card p-2 pr-9 text-left text-sm transition hover:border-primary/40 hover:bg-muted/30"
                          >
                            <div className="flex items-baseline gap-1.5">
                              {colore && <span title={t.reparto} className={`h-1.5 w-1.5 shrink-0 self-center rounded-full ${colore.fascia}`} />}
                              <span className="min-w-0 flex-1 truncate font-semibold">{t.cliente}</span>
                              <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">#{t.numero}</span>
                            </div>
                            {segnale && (
                              <div className={`mt-1 pl-3 text-xs font-semibold ${segnale.critico ? "text-critical" : "text-warning"}`}>{segnale.testo}</div>
                            )}

                            {/* ★ avatar (se già assegnato) visibile a riposo,
                            sostituito dalle azioni solo al passaggio del mouse —
                            non più due cerchi sempre accesi su ogni riga a riposo. */}
                            {assegnatario && (
                              <span
                                title={assegnatario.nome}
                                className={`absolute right-2.5 top-2 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold transition group-hover:opacity-0 ${
                                  assegnatario.id === currentPersonaId ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                                }`}
                              >
                                {iniziali(assegnatario)}
                              </span>
                            )}
                            <div className="absolute right-2 top-1.5 flex translate-x-1 items-center gap-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100">
                              {!assegnatario && (
                                <button
                                  onClick={(e) => prendiInCarico(t, e)}
                                  title="Prendi in carico"
                                  className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed bg-card text-muted-foreground transition hover:border-primary hover:text-primary"
                                >
                                  <UserPlus className="h-3 w-3" strokeWidth={2.5} />
                                </button>
                              )}
                              {puoAvanzare && (
                                <button
                                  onClick={(e) => avanzaStato(t, e)}
                                  title="Avanza allo stato successivo"
                                  className="flex h-6 w-6 items-center justify-center rounded-full border bg-card text-muted-foreground transition hover:border-primary hover:bg-primary hover:text-primary-foreground"
                                >
                                  <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ★ FIX — richiesta esplicita: il pannello laterale (Sheet) era
      illeggibile — troppo stretto per la quantità di dati reali di un
      Ticket. Passato a Dialog centrale, stessa larghezza e trattamento
      già usati per Segnalazioni. */}
      {/* ★ FIX — segnalato dall'utente: con la Scheda di lavoro aperta sopra
      (vedi Dialog subito sotto), questo dialog restava comunque "aperto"
      dietro — il suo velo scuro a piena pagina finiva sopra anche la X di
      questo, spenta/non cliccabile finché non si chiudeva prima la Scheda.
      `!schedaAperta` lo tiene semplicemente nascosto (non chiuso: `aperto`
      resta valorizzato) finché la Scheda è sopra — ricompare da solo se la
      Scheda viene annullata, si chiude per davvero solo al salvataggio
      riuscito (vedi onSalvato più sotto, che azzera anche `aperto`). */}
      <Dialog open={!!aperto && !schedaAperta} onOpenChange={(v) => !v && setAperto(null)}>
        <DialogContent className="sm:max-w-2xl">
          {aperto && (
            <DettaglioTicket
              key={aperto.id}
              ticket={aperto}
              persone={persone}
              currentPersonaId={currentPersonaId}
              onApriScheda={(a) => setSchedaAperta(a)}
              onCambiato={(t) => setAperto(t)}
              onEliminato={() => setAperto(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ★ NUOVA — Dialog centrale per la Scheda di lavoro, separato dal
      dettaglio Ticket: "visuale centrale" richiesta esplicitamente,
      stesso trattamento di Vista Tecnico/Calendario. Chiude anche il
      dettaglio Ticket al salvataggio: lo stato appena passato a
      "Completato" renderebbe il pannello aperto subito disallineato. */}
      <Dialog open={!!schedaAperta} onOpenChange={(v) => !v && setSchedaAperta(null)}>
        <DialogContent className="sm:max-w-xl">
          {schedaAperta && (
            schedaAperta.tipo_servizio === "Nuova installazione" ? (
              <SchedaInstallazioneForm
                appuntamentoId={schedaAperta.id}
                catalogoMateriali={catalogoMateriali}
                onAnnulla={() => setSchedaAperta(null)}
                onSalvato={() => {
                  setSchedaAperta(null);
                  setAperto(null);
                  router.refresh();
                }}
              />
            ) : (
              <SchedaLavorazioneForm
                appuntamentoId={schedaAperta.id}
                catalogoMateriali={catalogoMateriali}
                onAnnulla={() => setSchedaAperta(null)}
                onSalvato={() => {
                  setSchedaAperta(null);
                  setAperto(null);
                  router.refresh();
                }}
              />
            )
          )}
        </DialogContent>
      </Dialog>
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
  onApriScheda,
  onCambiato,
  onEliminato,
}: {
  ticket: Ticket;
  persone: Persona[];
  currentPersonaId: string;
  onApriScheda: (a: Appuntamento) => void;
  onCambiato: (t: Ticket) => void;
  onEliminato: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  // ★ NUOVA — solo un amministratore vede "Elimina Ticket" (controllo
  // comunque ripetuto lato server in eliminaTicket()): `persone` è già
  // passato a questo componente per altri usi (assegnatario), niente da
  // aggiungere per saperlo.
  const isAdmin = !!persone.find((p) => p.id === currentPersonaId)?.amministratore;
  // ★ NUOVA — stesso principio già applicato a segnalazioni-board.tsx: una
  // useTransition() indipendente per ogni azione invece di un unico
  // booleano "inCorso" condiviso, così cambiare stato non accende anche lo
  // spinner di "Elimina" (o viceversa) — spinner Loader2 + toast di
  // conferma anche sul successo, non solo sull'errore.
  const [inCorsoStato, startStato] = useTransition();
  const [inCorsoAssegna, startAssegna] = useTransition();
  const [inCorsoElimina, startElimina] = useTransition();
  const [inCorsoNota, startNota] = useTransition();
  const [note, setNote] = useState<NotaTicket[]>([]);
  const [notaTesto, setNotaTesto] = useState("");
  const [erroreNota, setErroreNota] = useState("");
  // ★ se la sottocategoria del Ticket corrisponde a una delle 5 pratiche
  // pubbliche (vedi PRATICA_PER_SOTTOCATEGORIA), il pannello "Invia una
  // pratica al cliente" parte già su quella invece che vuoto — i due
  // sistemi (campi extra interni / pratiche pubbliche) erano scollegati,
  // lo staff doveva sapere a memoria quale pratica corrispondesse.
  const [praticaScelta, setPraticaScelta] = useState<string>(() => PRATICA_PER_SOTTOCATEGORIA[ticket.sottocategoria ?? ""] ?? "");
  const [inCorsoApprovazione, startApprovazione] = useTransition();
  const [inCorsoReparto, startReparto] = useTransition();
  const [esitoApprovazione, setEsitoApprovazione] = useState("");
  const [mostraRapportinoForm, setMostraRapportinoForm] = useState(false);
  const [rapportino, setRapportino] = useState<RapportinoIntervento | null>(null);
  const [scheda, setScheda] = useState<SchedaLavoro | null>(null);
  // ★ NUOVA — richiesta esplicita: una volta pianificato un appuntamento
  // (Trasmetti → Ticket → Pianifica), non c'era alcun modo di aprire la
  // Scheda di Installazione/Lavorazione dal Ticket: solo il tecnico
  // assegnato, da Vista Tecnico, il giorno stesso dell'appuntamento.
  // `appuntamentoAttivo` è l'appuntamento "Programmato" collegato (se
  // c'è), da cui si apre lo stesso form — vedi getAppuntamentoAttivoPerTicket().
  const [appuntamentoAttivo, setAppuntamentoAttivo] = useState<Appuntamento | null>(null);
  // ★ NUOVA — richiesta esplicita: "Dettagli" / "Documenti" / "Note" invece
  // di un unico pannello lungo — i moduli inviati dal cliente, il
  // contratto e la scheda/rapportino completati erano sparsi tra vari
  // punti dello scroll, ora tutti insieme in "Documenti" con un contatore
  // sulla tab per sapere a colpo d'occhio se c'è qualcosa da guardare.
  const [tab, setTab] = useState<"dettagli" | "documenti" | "note">("dettagli");
  const [richieste, setRichieste] = useState<RichiestaCliente[]>([]);
  // ★ NUOVA (2026-08) — Sistema Subentro, doppio consenso in parallelo
  // (Opzione B): a differenza delle altre pratiche pubbliche (un solo
  // link, generato al volo), qui la pratica va prima "avviata" (crea la
  // riga richieste_clienti che aggancerà entrambe le conferme) — vedi
  // avviaPraticaSubentro/inviaLinkVecchioClienteSubentro.
  const [nomeNuovoTitolare, setNomeNuovoTitolare] = useState("");
  const [telefonoNuovoCliente, setTelefonoNuovoCliente] = useState("");
  const [emailNuovoCliente, setEmailNuovoCliente] = useState("");
  const [inCorsoAvvioSubentro, startAvvioSubentro] = useTransition();
  const [inCorsoLinkVecchio, startLinkVecchio] = useTransition();
  const [linkVecchioCliente, setLinkVecchioCliente] = useState("");
  const [esitoLinkVecchio, setEsitoLinkVecchio] = useState("");
  const assegnatario = ticket.tecnico_assegnato ? persone.find((p) => p.id === ticket.tecnico_assegnato) : null;

  useEffect(() => {
    if (ticket.stato === "Completato") {
      // ★ un Ticket completato via appuntamento (Vista Tecnico) ha una
      // Scheda di Installazione/Lavorazione al posto del rapportino
      // generico — mai entrambi per lo stesso ticket.
      getSchedaLavoroPerTicket(ticket.id).then(setScheda);
      getRapportinoTicket(ticket.id).then(setRapportino);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ramo sincrono del fetch sopra (ticket completato = nessun appuntamento ancora da pianificare/aprire), non un caso separato di "derivabile durante il render".
      setAppuntamentoAttivo(null);
    } else {
      setRapportino(null);
      setScheda(null);
      getAppuntamentoAttivoPerTicket(ticket.id).then(setAppuntamentoAttivo);
    }
    setMostraRapportinoForm(false);
    getRichiesteClientiPerTicket(ticket.id).then(setRichieste);
  }, [ticket.id, ticket.stato]);

  async function apriDocumentoRichiesta(percorso: string) {
    const risultato = await urlDocumentoRichiesta(percorso);
    if (risultato.errore || !risultato.url) {
      toast(risultato.errore || "Errore imprevisto.");
      return;
    }
    window.open(risultato.url, "_blank", "noopener,noreferrer");
  }

  const numeroDocumenti = (ticket.contratto_pdf_url ? 1 : 0) + richieste.length + (ticket.stato === "Completato" && (scheda || rapportino) ? 1 : 0);

  const linkPratica = useMemo(() => {
    if (!praticaScelta || typeof window === "undefined") return "";
    const origine = window.location.origin;
    if (praticaScelta === "disdetta") return `${origine}/disdetta?ticket=${ticket.numero}`;
    return `${origine}/richiesta-cliente/${praticaScelta}?ticketId=${ticket.id}`;
  }, [praticaScelta, ticket.numero, ticket.id]);
  const primoNomeCliente = ticket.cliente.trim().split(/\s+/)[0];

  // ★ NUOVA (2026-08) — Sistema Subentro: se una pratica esiste già per
  // questo Ticket (richieste è già caricato per la tab Documenti, vedi
  // getRichiesteClientiPerTicket nell'useEffect sopra), usiamo quella
  // invece di ripartire da zero ad ogni apertura del Ticket.
  const praticaSubentro = useMemo(() => richieste.find((r) => r.tipo_richiesta === "Subentro" && r.ticket_id === ticket.id), [richieste, ticket.id]);
  const linkNuovoClienteSubentro = useMemo(() => {
    if (!praticaSubentro || typeof window === "undefined") return "";
    return `${window.location.origin}/richiesta-cliente/subentro?ticketId=${ticket.id}&praticaId=${praticaSubentro.id}`;
  }, [praticaSubentro, ticket.id]);
  const nuovoClienteHaRisposto = !!praticaSubentro && Object.keys(praticaSubentro.dettagli || {}).length > 0;

  function avviaSubentro() {
    startAvvioSubentro(async () => {
      const risultato = await avviaPraticaSubentro(ticket.id, nomeNuovoTitolare || null);
      if (risultato.errore || !risultato.richiesta) {
        toast(risultato.errore || "Errore imprevisto.");
        return;
      }
      setRichieste((prev) => [risultato.richiesta!, ...prev]);
      toast("Pratica di Subentro avviata — invia ora i due link qui sotto.", "successo");
    });
  }

  function inviaLinkVecchio() {
    if (!praticaSubentro) return;
    startLinkVecchio(async () => {
      const risultato = await inviaLinkVecchioClienteSubentro(praticaSubentro.id, ticket.id, window.location.origin);
      if (risultato.errore || !risultato.link) {
        toast(risultato.errore || "Errore imprevisto.");
        return;
      }
      setLinkVecchioCliente(risultato.link);
      setEsitoLinkVecchio(
        risultato.email ? `Email inviata a ${risultato.email}.` : "Il Ticket non ha un'email registrata — usa WhatsApp o copia il link."
      );
      toast("Link di conferma inviato al vecchio cliente.", "successo");
    });
  }
  const messaggioPratica = `Ciao ${primoNomeCliente}, per la tua pratica Done Wifi apri questo link: ${linkPratica}`;

  function inviaApprovazione() {
    setEsitoApprovazione("");
    startApprovazione(async () => {
      const risultato = await inviaEmailApprovazioneTicket(ticket.id, window.location.origin);
      setEsitoApprovazione(risultato.errore ? risultato.errore : "Email di approvazione inviata.");
      toast(risultato.errore || "Email di approvazione inviata al cliente.", risultato.errore ? "errore" : "successo");
    });
  }

  function cambiaReparto(nuovo: (typeof REPARTI)[number]) {
    if (nuovo === ticket.reparto) return;
    startReparto(async () => {
      const risultato = await cambiaRepartoTicket(ticket.id, nuovo, ticket.reparto);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      onCambiato({ ...ticket, reparto: nuovo });
      toast(`Reparto cambiato in "${nuovo}".`, "successo");
      router.refresh();
    });
  }

  function elimina() {
    if (!confirm(`Eliminare definitivamente il Ticket #${ticket.numero} — ${ticket.cliente}? L'operazione non è reversibile.`)) return;
    startElimina(async () => {
      const risultato = await eliminaTicket(ticket.id);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      toast("Ticket eliminato.", "successo");
      onEliminato();
      router.refresh();
    });
  }

  useEffect(() => {
    getNoteTicket(ticket.id).then(setNote);
  }, [ticket.id]);

  function trovaPersona(id: string | null) {
    return id ? persone.find((p) => p.id === id) ?? null : null;
  }

  function inviaNota() {
    const testo = notaTesto.trim();
    if (!testo) return;
    setErroreNota("");
    startNota(async () => {
      const risultato = await aggiungiNotaTicket(ticket.id, testo);
      if (risultato.errore || !risultato.nota) {
        setErroreNota(risultato.errore || "Errore imprevisto.");
        toast(risultato.errore || "Errore imprevisto.");
        return;
      }
      setNote((n) => [...n, risultato.nota]);
      setNotaTesto("");
    });
  }

  function cambiaStato(nuovo: StatoTicket) {
    if (nuovo === ticket.stato) return;
    // ★ passare a Completato richiede il rapportino di chiusura invece di
    // un semplice confirm() — vedi form sotto.
    if (nuovo === "Completato") {
      setMostraRapportinoForm(true);
      return;
    }
    startStato(async () => {
      await aggiornaStatoTicket(ticket.id, nuovo, ticket.stato);
      onCambiato({ ...ticket, stato: nuovo });
      toast(`Passato a "${nuovo}".`, "successo");
      router.refresh();
    });
  }

  function prendiInCarico() {
    startAssegna(async () => {
      await assegnaTicket(ticket.id, currentPersonaId);
      onCambiato({ ...ticket, tecnico_assegnato: currentPersonaId });
      toast("Ticket preso in carico.", "successo");
      router.refresh();
    });
  }

  const idx = SEQUENZA_STATO.indexOf(ticket.stato);

  return (
    <>
      {/* ★ sticky top-0, stesso trattamento del titolo Segnalazione: resta
      visibile scorrendo il dialog invece di sparire lasciando al suo
      posto un campo qualsiasi senza etichetta. */}
      <DialogHeader className="sticky top-0 z-10 -mx-4 -mt-4 border-b bg-popover px-4 pt-4 pb-3">
        {/* ★ NUOVA — richiesta esplicita: fascia colorata per reparto in
        cima al dettaglio (stessa "C · Badge + fascia" del badge sulla
        card), riconoscibile ancora prima di leggere "Reparto" più sotto
        nella tab Dettagli. */}
        {(() => {
          const colore = coloreReparto(ticket.reparto);
          return colore ? <div className={`-mx-4 -mt-4 mb-3 h-1 rounded-t-xl ${colore.fascia}`} /> : null;
        })()}
        <DialogTitle>{ticket.cliente}</DialogTitle>
        <DialogDescription>
          #{ticket.numero} · {ticket.categoria}
          {ticket.sottocategoria && ` · ${ticket.sottocategoria}`}
        </DialogDescription>
      </DialogHeader>
      <div className="flex min-w-0 flex-col gap-4 text-sm">
        <div className="flex gap-1 border-b">
          {(
            [
              ["dettagli", "Dettagli"],
              ["documenti", `Documenti${numeroDocumenti > 0 ? ` (${numeroDocumenti})` : ""}`],
              ["note", `Note${note.length > 0 ? ` (${note.length})` : ""}`],
            ] as const
          ).map(([valore, etichetta]) => (
            <button
              key={valore}
              type="button"
              onClick={() => setTab(valore)}
              className={`-mb-px border-b-2 px-3 py-1.5 text-xs font-bold transition ${
                tab === valore ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {etichetta}
            </button>
          ))}
        </div>

        {tab === "dettagli" && (
        <div key="dettagli" className="flex flex-col gap-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
        {ticket.stato === "Annullato" ? (
          <StatusBadge status="Annullato" className="w-fit" />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {SEQUENZA_STATO.map((s, i) => (
              <button
                key={s}
                disabled={inCorsoStato}
                onClick={() => cambiaStato(s)}
                className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${
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

        {/* ★ NUOVA — appuntamento pianificato ma non ancora completato: la
        Scheda si apre da qui (non serve più essere il tecnico assegnato,
        né aspettare il giorno dell'appuntamento su Vista Tecnico) — in un
        popup centrale separato (vedi TicketsBoard), "visuale centrale"
        richiesta esplicitamente. */}
        {ticket.stato !== "Completato" && appuntamentoAttivo && (
          <div className="rounded-xl border bg-card p-3 shadow-sm">
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <CalendarCheck2 className="h-3.5 w-3.5" strokeWidth={2.25} />
              Appuntamento pianificato
            </p>
            <p className="mb-2.5 text-sm font-medium">
              {new Date(appuntamentoAttivo.data_ora).toLocaleString("it-IT", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {" — "}
              {appuntamentoAttivo.tipo_servizio}
            </p>
            <Button size="sm" onClick={() => onApriScheda(appuntamentoAttivo)}>
              <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
              Apri scheda di lavoro
            </Button>
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
            <Button size="sm" variant="outline" onClick={prendiInCarico} disabled={inCorsoAssegna} className="mt-1.5 min-h-11">
              {inCorsoAssegna ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <UserPlus className="h-3.5 w-3.5" strokeWidth={2.5} />}
              {inCorsoAssegna ? "Assegnazione…" : "Prendi in carico"}
            </Button>
          )}
        </div>

        <div>
          <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Reparto
            <SuggerimentoCampo testo="Il reparto responsabile di questo Ticket — cambialo se la pratica va gestita da un altro reparto (es. da Commerciale ad Analisi Rete per l'installazione)." />
          </div>
          <select
            value={ticket.reparto}
            disabled={inCorsoReparto}
            onChange={(e) => cambiaReparto(e.target.value as (typeof REPARTI)[number])}
            className="mt-1 h-9 rounded-md border bg-background px-2 text-xs font-medium disabled:opacity-60"
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
        {ticket.sottocategoria && <CampiMancanti sottocategoria={ticket.sottocategoria} dettagli={ticket.dettagli_extra} />}

        {/* ★ FIX — un Ticket nato da una Segnalazione trasmessa è quasi
        sempre una prima installazione, ma il tipo di servizio non lo
        deduceva mai da solo: il menu partiva sempre su "Lavorazione
        tecnica" come per qualunque altro Ticket, rischiando la Scheda
        sbagliata sul campo se chi pianifica non se ne accorgeva. */}
        <PianificaAppuntamento
          ticket={ticket}
          persone={persone}
          tipoServizioIniziale={ticket.segnalazione_id ? "Nuova installazione" : "Lavorazione tecnica"}
        />
        </div>
        )}

        {/* ★ NUOVA — richiesta esplicita: contratto, scheda/rapportino
        completati e moduli inviati dal cliente (Cambio IBAN/Anagrafica/
        Trasferimento/Subentro) erano sparsi in punti diversi dello scroll
        (o del tutto assenti, per i moduli) — ora tutti insieme qui, un
        solo posto per "tutta la carta" del Ticket. */}
        {tab === "documenti" && (
        <div key="documenti" className="flex flex-col gap-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
        {ticket.stato === "Completato" && scheda && <SchedaVista scheda={scheda} />}
        {ticket.stato === "Completato" && !scheda && rapportino && (
          <RapportinoVista rapportino={rapportino} importoFatturato={ticket.importo_fatturato} />
        )}

        {ticket.contratto_pdf_url && (
          <Button
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={async () => {
              const risultato = await urlContratto(ticket.contratto_pdf_url!);
              if (risultato.errore || !risultato.url) {
                toast(risultato.errore || "Errore imprevisto.");
                return;
              }
              window.open(risultato.url, "_blank", "noopener,noreferrer");
            }}
          >
            <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
            Vedi contratto
          </Button>
        )}

        {richieste.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <FileSignature className="h-3.5 w-3.5" strokeWidth={2.25} />
              Moduli ricevuti dal cliente
            </div>
            <div className="flex flex-col gap-2">
              {richieste.map((r) => (
                <div key={r.id} className="rounded-lg border bg-card p-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-bold">{r.tipo_richiesta}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(r.data).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {Object.entries(r.dettagli || {}).map(([chiave, valore]) =>
                      valore ? (
                        <div key={chiave} className="text-xs">
                          <span className="text-muted-foreground">{etichettaDettaglio(chiave)}: </span>
                          <span className="font-medium break-words">{valore}</span>
                        </div>
                      ) : null
                    )}
                  </div>
                  {r.documenti?.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {r.documenti.map((doc, i) => (
                        <Button
                          key={i}
                          size="sm"
                          variant="outline"
                          className="h-auto w-full justify-start py-1.5 whitespace-normal"
                          onClick={() => apriDocumentoRichiesta(doc.percorso)}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                          <span className="text-left break-all">{doc.tipo ? `${doc.tipo} — ${doc.nome}` : doc.nome}</span>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <FileSignature className="h-3.5 w-3.5" strokeWidth={2.25} />
            Invia una pratica al cliente
          </div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Manda al cliente un link a un modulo pubblico da compilare (es. cambio IBAN, trasloco) — i dati inviati compaiono poi qui, nella tab Documenti.
          </p>
          <select
            value={praticaScelta}
            onChange={(e) => setPraticaScelta(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-xs"
          >
            <option value="">Scegli una pratica...</option>
            {PRATICHE_INVIABILI.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.titolo}
                {PRATICA_PER_SOTTOCATEGORIA[ticket.sottocategoria ?? ""] === p.slug ? " (consigliata)" : ""}
              </option>
            ))}
          </select>
          {praticaScelta === "subentro" ? (
            <div className="mt-2.5">
              <SubentroDoppioConsenso
                praticaSubentro={praticaSubentro}
                nuovoClienteHaRisposto={nuovoClienteHaRisposto}
                nomeNuovoTitolare={nomeNuovoTitolare}
                setNomeNuovoTitolare={setNomeNuovoTitolare}
                inCorsoAvvioSubentro={inCorsoAvvioSubentro}
                avviaSubentro={avviaSubentro}
                linkVecchioCliente={linkVecchioCliente}
                esitoLinkVecchio={esitoLinkVecchio}
                inCorsoLinkVecchio={inCorsoLinkVecchio}
                inviaLinkVecchio={inviaLinkVecchio}
                ticketTelefono={ticket.telefono}
                linkNuovoClienteSubentro={linkNuovoClienteSubentro}
                telefonoNuovoCliente={telefonoNuovoCliente}
                setTelefonoNuovoCliente={setTelefonoNuovoCliente}
                emailNuovoCliente={emailNuovoCliente}
                setEmailNuovoCliente={setEmailNuovoCliente}
                nomeCliente={ticket.cliente}
              />
            </div>
          ) : (
            praticaScelta && (
              <div className="mt-2.5">
                <InvioLinkCliente
                  url={linkPratica}
                  telefono={ticket.telefono}
                  email={ticket.email}
                  messaggio={messaggioPratica}
                  onInviaEmail={() => inviaEmailPraticaCliente(ticket.id, praticaScelta, linkPratica)}
                />
              </div>
            )
          )}

          {ticket.email && (
            <div className="mt-3 border-t pt-3">
              <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Intervento risolto da remoto?
                <SuggerimentoCampo testo="Manda al cliente un link email monouso: un suo click conferma che l'intervento è stato risolto, senza dover fissare un appuntamento in loco." />
              </p>
              <Button size="sm" variant="outline" disabled={inCorsoApprovazione} onClick={inviaApprovazione} className="min-h-11">
                {inCorsoApprovazione && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />}
                {inCorsoApprovazione ? "Invio in corso…" : "Invia email di approvazione"}
              </Button>
              {esitoApprovazione && <p className="mt-1.5 text-xs text-muted-foreground">{esitoApprovazione}</p>}
            </div>
          )}
        </div>
        </div>
        )}

        {tab === "note" && (
        <div key="note" className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
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
            <Button size="icon" className="h-11 w-11 shrink-0" disabled={inCorsoNota || !notaTesto.trim()} onClick={inviaNota}>
              {inCorsoNota ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Send className="h-3.5 w-3.5" strokeWidth={2.5} />}
            </Button>
          </div>
          {erroreNota && <p className="mt-1.5 text-xs text-critical">{erroreNota}</p>}
        </div>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={elimina}
            disabled={inCorsoElimina}
            className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-critical/30 px-3 py-3 text-xs font-semibold text-critical transition hover:bg-critical/10 disabled:opacity-50"
          >
            {inCorsoElimina ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />}
            {inCorsoElimina ? "Eliminazione in corso…" : "Elimina Ticket"}
          </button>
        )}
      </div>
    </>
  );
}

// ★ NUOVA (2026-08) — Sistema Subentro, Opzione B (doppio consenso in
// parallelo — proposta approvata, vedi README): sostituisce il singolo
// InvioLinkCliente usato dalle altre pratiche pubbliche con due tracce
// indipendenti — il VECCHIO cliente (contatto già noto, quello del
// Ticket) conferma solo sì/no la cessione; il NUOVO cliente (contatto
// ancora sconosciuto al sistema, l'operatore lo digita qui) compila dati e
// documenti nel modulo pubblico esistente. Le due possono rispondere in
// qualsiasi ordine — nessuna delle due blocca l'altra.
function SubentroDoppioConsenso({
  praticaSubentro,
  nuovoClienteHaRisposto,
  nomeNuovoTitolare,
  setNomeNuovoTitolare,
  inCorsoAvvioSubentro,
  avviaSubentro,
  linkVecchioCliente,
  esitoLinkVecchio,
  inCorsoLinkVecchio,
  inviaLinkVecchio,
  ticketTelefono,
  linkNuovoClienteSubentro,
  telefonoNuovoCliente,
  setTelefonoNuovoCliente,
  emailNuovoCliente,
  setEmailNuovoCliente,
  nomeCliente,
}: {
  praticaSubentro: RichiestaCliente | undefined;
  nuovoClienteHaRisposto: boolean;
  nomeNuovoTitolare: string;
  setNomeNuovoTitolare: (v: string) => void;
  inCorsoAvvioSubentro: boolean;
  avviaSubentro: () => void;
  linkVecchioCliente: string;
  esitoLinkVecchio: string;
  inCorsoLinkVecchio: boolean;
  inviaLinkVecchio: () => void;
  ticketTelefono: string | null;
  linkNuovoClienteSubentro: string;
  telefonoNuovoCliente: string;
  setTelefonoNuovoCliente: (v: string) => void;
  emailNuovoCliente: string;
  setEmailNuovoCliente: (v: string) => void;
  nomeCliente: string;
}) {
  if (!praticaSubentro) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
        <div>
          <Label htmlFor="nomeNuovoTitolare">Nome del nuovo titolare (facoltativo)</Label>
          <Input
            id="nomeNuovoTitolare"
            value={nomeNuovoTitolare}
            onChange={(e) => setNomeNuovoTitolare(e.target.value)}
            placeholder="Se già lo conosci — comparirà nel link di conferma"
            className="mt-1 h-9 text-xs"
          />
        </div>
        <Button size="sm" onClick={avviaSubentro} disabled={inCorsoAvvioSubentro} className="min-h-9">
          {inCorsoAvvioSubentro ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <FileSignature className="h-3.5 w-3.5" strokeWidth={2.25} />}
          {inCorsoAvvioSubentro ? "Avvio in corso…" : "Avvia pratica di Subentro"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Crea la pratica: dopo puoi inviare separatamente il link di conferma al vecchio cliente e il modulo dati al nuovo.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <StatoTraccia
        etichetta="Vecchio cliente"
        stato={praticaSubentro.vecchio_cliente_confermato_il ? "ok" : praticaSubentro.vecchio_cliente_rifiutato_il ? "no" : "attesa"}
        testoOk="Cessione confermata"
        testoNo="Non ha confermato"
        testoAttesa="In attesa di conferma"
      />
      <div className="rounded-lg border bg-muted/40 p-3">
        <p className="mb-2 text-[11px] text-muted-foreground">
          Link di sola conferma (nessun dato da inserire) — verso il contatto già registrato sul Ticket.
        </p>
        <Button size="sm" variant="outline" onClick={inviaLinkVecchio} disabled={inCorsoLinkVecchio} className="min-h-9 w-full">
          {inCorsoLinkVecchio ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Send className="h-3.5 w-3.5" strokeWidth={2.25} />}
          {inCorsoLinkVecchio ? "Invio…" : linkVecchioCliente ? "Invia di nuovo" : "Invia link di conferma al vecchio cliente"}
        </Button>
        {esitoLinkVecchio && <p className="mt-1.5 text-[11px] text-muted-foreground">{esitoLinkVecchio}</p>}
        {linkVecchioCliente && (
          <div className="mt-2">
            {/* ★ solo WhatsApp/copia: l'email è già stata inviata dal
            pulsante sopra (stesso link) — un secondo pulsante Email qui
            manderebbe una seconda email identica invece di aprire un vero
            client locale, inutile. */}
            <InvioLinkCliente
              url={linkVecchioCliente}
              telefono={ticketTelefono}
              email={null}
              messaggio={`Ciao, conferma la cessione del contratto Done Wifi: ${linkVecchioCliente}`}
              onInviaEmail={async () => ({ errore: null })}
            />
          </div>
        )}
      </div>

      <StatoTraccia
        etichetta="Nuovo cliente"
        stato={nuovoClienteHaRisposto ? "ok" : "attesa"}
        testoOk="Dati e documenti ricevuti"
        testoNo=""
        testoAttesa="In attesa dei dati"
      />
      <div className="rounded-lg border bg-muted/40 p-3">
        <p className="mb-2 text-[11px] text-muted-foreground">Modulo dati + documenti — il contatto del nuovo titolare non è ancora noto al sistema, inseriscilo qui.</p>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <Input
            value={telefonoNuovoCliente}
            onChange={(e) => setTelefonoNuovoCliente(e.target.value)}
            placeholder="Telefono nuovo cliente"
            className="h-9 text-xs"
          />
          <Input
            value={emailNuovoCliente}
            onChange={(e) => setEmailNuovoCliente(e.target.value)}
            placeholder="Email nuovo cliente"
            type="email"
            className="h-9 text-xs"
          />
        </div>
        <InvioLinkCliente
          url={linkNuovoClienteSubentro}
          telefono={telefonoNuovoCliente || null}
          email={emailNuovoCliente || null}
          messaggio={`Ciao, per completare il subentro sul contratto ${nomeCliente} apri questo link: ${linkNuovoClienteSubentro}`}
          onInviaEmail={() => inviaEmailPraticaGenerica(emailNuovoCliente, nomeNuovoTitolare, "Dati per il Subentro", linkNuovoClienteSubentro, "Commerciale")}
        />
      </div>
    </div>
  );
}

function StatoTraccia({
  etichetta,
  stato,
  testoOk,
  testoNo,
  testoAttesa,
}: {
  etichetta: string;
  stato: "ok" | "no" | "attesa";
  testoOk: string;
  testoNo: string;
  testoAttesa: string;
}) {
  const config = {
    ok: { icona: CheckCircle2, classi: "bg-success/10 text-success", testo: testoOk },
    no: { icona: XCircle, classi: "bg-critical/10 text-critical", testo: testoNo },
    attesa: { icona: Clock3, classi: "bg-muted text-muted-foreground", testo: testoAttesa },
  }[stato];
  const Icona = config.icona;
  return (
    <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${config.classi}`}>
      <Icona className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
      {etichetta} — {config.testo}
    </div>
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
// ★ FIX — il percorso rapido "Nuovo Ticket" di Vista Tecnico crea Ticket
// "Nuovo contratto"/altre sottocategoria con campi extra obbligatori senza
// raccoglierli (form ridotto apposta per restare rapido sul campo), e
// finora nulla segnalava che mancassero — l'ufficio se ne accorgeva solo
// aprendo il Ticket e notando l'assenza. Banner generico, vale per
// qualunque sottocategoria con campi obbligatori non ancora compilati, non
// solo per quella nata da Vista Tecnico.
function CampiMancanti({ sottocategoria, dettagli }: { sottocategoria: string; dettagli: Record<string, string> }) {
  const config = CONFIG_SOTTOCATEGORIE[sottocategoria];
  if (!config) return null;
  const mancanti = config.campi.filter((c) => c.obbligatorio && c.tipo !== "file" && !dettagli?.[c.id]?.trim());
  if (mancanti.length === 0) return null;
  return (
    <p className="flex items-start gap-1.5 rounded-lg bg-warning/10 p-2.5 text-xs text-warning">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
      Campi obbligatori per &quot;{sottocategoria}&quot; ancora da completare: {mancanti.map((c) => c.label).join(", ")}.
    </p>
  );
}

function DettagliExtra({ sottocategoria, dettagli }: { sottocategoria: string; dettagli: Record<string, string> }) {
  const config = CONFIG_SOTTOCATEGORIE[sottocategoria];
  const toast = useToast();

  async function apriAllegato() {
    const percorso = dettagli._allegato;
    if (!percorso) return;
    const risultato = await urlDocumentoRapportino(percorso);
    if (risultato.errore || !risultato.url) {
      toast(risultato.errore || "Errore imprevisto.");
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
export function PianificaAppuntamento({
  ticket,
  persone,
  tipoServizioIniziale = "Lavorazione tecnica",
  apertaSubito = false,
  tecnicoIniziale,
}: {
  ticket: Ticket;
  persone: Persona[];
  tipoServizioIniziale?: TipoServizioAppuntamento;
  apertaSubito?: boolean;
  tecnicoIniziale?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [aperto, setAperto] = useState(apertaSubito);
  const [slot, setSlot] = useState<SlotOccupato[]>([]);
  const [inCorso, startTransizione] = useTransition();
  const [errore, setErrore] = useState("");
  const [fatto, setFatto] = useState(false);

  useEffect(() => {
    if (aperto) getSlotOccupatiProssimi().then(setSlot);
  }, [aperto]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const data = String(dati.get("data") || "");
    const ora = String(dati.get("ora") || "");
    if (!data || !ora) return setErrore("Imposta data e ora.");

    startTransizione(async () => {
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
      if (risultato.errore) {
        setErrore(risultato.errore);
        return;
      }
      setFatto(true);
      toast("Appuntamento fissato.", "successo");
      router.refresh();
    });
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
        <select name="tipo_servizio" defaultValue={tipoServizioIniziale} className="h-8 rounded-md border bg-background px-2 text-xs">
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
        <select name="tecnico" defaultValue={tecnicoIniziale ?? ticket.tecnico_assegnato ?? ""} className="h-8 rounded-md border bg-background px-2 text-xs">
          <option value="">Nessun tecnico</option>
          {persone.map((p) => (
            <option key={p.id} value={p.id}>{p.nome}</option>
          ))}
        </select>
        {errore && <p className="text-xs text-critical">{errore}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={inCorso} className="min-h-11 flex-1">
            {inCorso && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />}
            {inCorso ? "Fisso in corso…" : "Assegna e fissa"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAperto(false)}>
            Annulla
          </Button>
        </div>
      </form>
    </div>
  );
}
