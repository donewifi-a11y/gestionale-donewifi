"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { UserRound, X, Search, ChevronRight, UserPlus, NotebookText, Send, FileText, FileSignature, CalendarPlus, CalendarClock, CalendarCheck2, AlertTriangle, Trash2, Loader2, BookmarkPlus, Check } from "lucide-react";
import { CONFIG_STATO_TRACCIA, type StatoTraccia as TipoStatoTraccia } from "@/lib/stato-traccia";
import { SuggerimentoCampo } from "@/components/ui/suggerimento-campo";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  aggiornaStatoTicket,
  assegnaTicket,
  assegnaTicketTecnicoEsterno,
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
import { IconaCategoria } from "@/components/condivisi/icona-categoria";
import { RapportinoForm, RapportinoVista } from "@/components/tickets/rapportino";
import { SchedaVista } from "@/components/schede/scheda-vista";
import { SchedaInstallazioneForm } from "@/components/schede/scheda-installazione-form";
import { SchedaLavorazioneForm } from "@/components/schede/scheda-lavorazione-form";
import { getSchedaLavoroPerTicket } from "@/app/(app)/calendario/actions";
import { RICHIESTE_CLIENTE_CONFIG, messaggioWhatsappPratica } from "@/lib/richieste-cliente-config";
import { getRapportinoTicket } from "@/app/(app)/tickets/actions";
import { getRichiesteClientiPerTicket, urlDocumentoRichiesta } from "@/app/(app)/richieste-clienti/actions";
import { PulsanteDocumento } from "@/components/condivisi/pulsante-documento";
import { SegnalePulsante, entroOreDa } from "@/components/condivisi/segnale-pulsante";
import { etichettaDettaglio } from "@/lib/etichette-dettagli";
import type { Appuntamento, MaterialeMagazzino, NotaTicket, Persona, PrioritaTicket, RichiestaCliente, StatoTicket, Ticket, RapportinoIntervento, SchedaLavoro, TipoServizioAppuntamento } from "@/lib/types";
import { REPARTI, CATEGORIE_TICKET, TIPI_SERVIZIO_APPUNTAMENTO, INTERVENTI_RAPIDI, coloreReparto, coloreGruppo, tipoServizioDaTicket, titoloAppuntamento, stimaComuneDaIndirizzo } from "@/lib/types";
import { CONFIG_SOTTOCATEGORIE } from "@/lib/campi-ticket";
import { urlDocumentoRapportino } from "@/app/(app)/tickets/actions";
import { useToast } from "@/components/ui/toast";
import { usePersistedState } from "@/lib/use-persisted-state";

// ★ FIX (2026-08, controllo d'oro) — Trasferimento/Cambio IBAN/Cambio
// Anagrafica non passano più da qui: si avviano dalla scheda del Cliente
// Esterno (vedi NuovaPraticaClienteEsterno), non serve più un Ticket per
// loro (proposta "Pratiche cliente senza Ticket"). Tenerle anche qui
// sarebbe stato un secondo modo di fare la stessa cosa — esattamente il
// doppione da evitare. Restano solo Subentro (ha un flusso a doppio
// consenso costruito apposta su Ticket) e Disdetta (mai stata legata a
// questo problema, resta una pagina di istruzioni).
const PRATICHE_INVIABILI = [
  { slug: "disdetta" as const, titolo: "Disdetta contratto" },
  { slug: "subentro" as const, titolo: RICHIESTE_CLIENTE_CONFIG.subentro.titolo },
];

// ★ collega le sottocategoria di Ticket (SOTTOCATEGORIE_TICKET) alla
// pratica pubblica corrispondente per nome — solo Subentro/Disdetta restano
// avviabili da qui (vedi nota sopra); Trasferimento/Cambio IBAN/Cambio
// Anagrafica come sottocategoria Ticket restano scelte valide per
// classificare un intervento di assistenza legato al tema, ma non
// suggeriscono più automaticamente un invio pratica da questo pannello.
const PRATICA_PER_SOTTOCATEGORIA: Record<string, (typeof PRATICHE_INVIABILI)[number]["slug"]> = {
  Subentro: "subentro",
  Disdetta: "disdetta",
};

const SEQUENZA_STATO: StatoTicket[] = ["Da gestire", "In lavorazione", "In attesa", "Completato"];
// ★ le colonne mostrano prima i casi Urgenti: la priorità non si perde
// nello scroll di una colonna lunga.
const ORDINE_PRIORITA: Record<PrioritaTicket, number> = { Urgente: 0, Normale: 1, Bassa: 2 };

/**
 * ★ NUOVA (2026-09-04, richiesta esplicita: "mi piace il sistema di
 * rilevamento della disdetta" — proposta emersa parlando di tendenze UX
 * 2026) — un solo segnale, l'unico che con i volumi reali di oggi (35
 * ticket in tutto il gestionale) trova davvero qualcosa: un cliente
 * tornato più di una volta per un problema di Assistenza è un segnale di
 * insoddisfazione più concreto di un numero "ferma da N giorni". Niente
 * IA/punteggio nascosto: una regola sola, trasparente, verificabile a
 * occhio — 2 o più Ticket "Analisi Rete" per lo stesso numero di
 * telefono, senza finestra temporale (con questi volumi, "negli ultimi 90
 * giorni" non troverebbe mai nulla; da restringere quando i ticket
 * cresceranno). Un secondo segnale valutato con l'utente — il calo del
 * segnale radio tra una Scheda e la successiva — è stato scartato per ora:
 * solo 4 Schede in tutto il database hanno un RSSI registrato, non
 * abbastanza nemmeno per un solo confronto vero.
 */
function normalizzaTelefono(t: string | null | undefined): string {
  return (t ?? "").replace(/\D/g, "").slice(-9);
}

const CHIAVE_FILTRI = "ticketsFiltri";

/**
 * ★ NUOVA (2026-09-04, richiesta esplicita: "studia le ultime tendenze
 * ui/ux... fammi con artifact delle proposte" → artifact "Proposte UX
 * 2026", proposta ⑤, "io farei tutto") — il filtro "Solo mie" era già
 * ricordato per browser (usePersistedState sopra), ma una combinazione più
 * specifica ("Urgenti scoperti": priorità + non assegnati insieme) andava
 * ricostruita a mano ogni volta. Tre viste integrate (sempre uguali) più
 * la possibilità di salvarne di proprie con un nome — stesso principio di
 * persistenza già scritto per i filtri, non un sistema nuovo da mantenere.
 */
type FiltriTicket = { stato: string; categoria: string; priorita: string; reparto: string; soloMiei: boolean; nonAssegnati: boolean };
const FILTRI_VUOTI: FiltriTicket = { stato: "", categoria: "", priorita: "", reparto: "", soloMiei: false, nonAssegnati: false };
const VISTE_INTEGRATE: { id: string; nome: string; filtri: FiltriTicket }[] = [
  { id: "tutti", nome: "Tutti", filtri: FILTRI_VUOTI },
  { id: "le-mie", nome: "Le mie", filtri: { ...FILTRI_VUOTI, soloMiei: true } },
  { id: "urgenti-scoperti", nome: "Urgenti scoperti", filtri: { ...FILTRI_VUOTI, priorita: "Urgente", nonAssegnati: true } },
];
const CHIAVE_VISTE_SALVATE = "ticketsVisteSalvate";
interface VistaSalvata {
  id: string;
  nome: string;
  filtri: FiltriTicket;
}

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
// ripetizione. Qui si raggruppano i Ticket per categoria UNA VOLTA per
// colonna, invece che ripeterla su ogni riga — mantiene l'ordine con cui
// `items` è già stato ordinato (priorità prima, vedi ORDINE_PRIORITA), il
// gruppo compare nella posizione del suo primo Ticket.
// ★ REDESIGN (2026-09), giro 3 — richiesta esplicita "è troppo caotico
// così, non ci capisco più nulla" su uno screenshot con una sezione per
// ogni combinazione categoria+sottocategoria (spesso una sola card
// dentro): raggruppare per sola categoria dimezza le sezioni; la
// sottocategoria non sparisce, torna a essere una piccola etichetta sulla
// card stessa (vedi il render più sotto) invece di generare una sezione a sé.
function raggruppaPerCategoria(items: Ticket[]): { chiave: string; ticket: Ticket[] }[] {
  const gruppi: { chiave: string; ticket: Ticket[] }[] = [];
  const indice = new Map<string, number>();
  for (const t of items) {
    const chiave = t.categoria;
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
  tecniciEsterni,
  appuntamentiProgrammati,
}: {
  tickets: Ticket[];
  currentPersonaId: string;
  persone: Persona[];
  catalogoMateriali: MaterialeMagazzino[];
  /** ★ NUOVA (2026-08-26) — sistema pose.donewifi.it: elenco tecnici
   * esterni attivi, per assegnare un Ticket a uno di loro invece che a un
   * tecnico interno (vedi "Assegnato a" in DettaglioTicket sotto). */
  tecniciEsterni: { id: string; nome: string; cognome: string | null }[];
  /** ★ NUOVA (2026-09-04, richiesta esplicita: "devo vedere dai ticket
   * quando sono pianificati e devo avere l'etichetta che lo dice") — un
   * appuntamento "Programmato" per Ticket, se c'è (letto in blocco dalla
   * pagina, vedi tickets/page.tsx — non serve un fetch per ogni card). */
  appuntamentiProgrammati: { id: string; ticket_id: string | null; data_ora: string; tipo_servizio: TipoServizioAppuntamento }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ★ FIX (2026-08-31, controllo d'oro usabilità) — avanzaStato/prendiInCarico
  // sotto ignoravano del tutto l'esito del server: un rifiuto (permessi, riga
  // già cambiata da un altro) passava inosservato, l'utente restava convinto
  // che l'azione fosse andata a buon fine.
  const toast = useToast();
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
  // ★ NUOVA — vedi VISTE_INTEGRATE sopra: l'elenco delle viste proprie
  // dell'utente, ricordate per browser come i filtri stessi.
  const [visteSalvate, aggiornaVisteSalvate] = usePersistedState(CHIAVE_VISTE_SALVATE, { elenco: [] as VistaSalvata[] });

  function applicaVista(v: FiltriTicket) {
    aggiornaFiltri(v);
  }

  function salvaVistaAttuale() {
    const nome = prompt('Nome per questa vista (es. "Urgenti Fatturazione"):');
    if (!nome?.trim()) return;
    const nuova: VistaSalvata = { id: crypto.randomUUID(), nome: nome.trim(), filtri: { ...filtri } };
    aggiornaVisteSalvate({ elenco: [...visteSalvate.elenco, nuova] });
    toast(`Vista "${nome.trim()}" salvata.`, "successo");
  }

  function eliminaVista(v: VistaSalvata, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Eliminare la vista "${v.nome}"?`)) return;
    aggiornaVisteSalvate({ elenco: visteSalvate.elenco.filter((x) => x.id !== v.id) });
  }
  const [aperto, setAperto] = useState<Ticket | null>(null);
  // ★ NUOVA — sollevato qui (la Scheda si apre in un Dialog centrale
  // separato dal Sheet di dettaglio Ticket, non più annidato dentro):
  // DettaglioTicket conosce già l'appuntamento collegato, lo passa su con
  // onApriScheda invece di doverlo rifetchare qui.
  const [schedaAperta, setSchedaAperta] = useState<Appuntamento | null>(null);
  // ★ NUOVA (2026-09-04, artifact "Proposte UX 2026", proposta ③, "io farei
  // tutto") — selezione multipla per riassegnare più Ticket in un colpo
  // solo (es. dopo un giro di smistamento mattutino), invece di aprirli e
  // chiuderli uno alla volta. Solo la riassegnazione tecnico è inclusa
  // nelle azioni bulk: "segna completato" non lo è di proposito, richiede
  // sempre un rapportino di chiusura per ciascun Ticket (vedi avanzaStato
  // sotto) — bypassarlo in blocco creerebbe Ticket "Completati" senza mai
  // aver registrato cosa è stato fatto.
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [inCorsoBulk, startBulk] = useTransition();

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

  // ★ NUOVA — vedi normalizzaTelefono() sopra: calcolato una volta sola su
  // TUTTI i Ticket (non solo quelli filtrati/visibili in bacheca ora),
  // altrimenti un cliente ripetuto sparirebbe dal segnale appena si
  // applica un filtro che ne nasconde uno dei due ticket.
  const ticketRipetutiPerTelefono = useMemo(() => {
    const gruppi = new Map<string, number[]>();
    for (const t of tickets) {
      if (t.reparto !== "Analisi Rete") continue;
      const chiave = normalizzaTelefono(t.telefono);
      if (!chiave) continue;
      const lista = gruppi.get(chiave);
      if (lista) lista.push(t.numero);
      else gruppi.set(chiave, [t.numero]);
    }
    for (const [chiave, numeri] of gruppi) {
      if (numeri.length < 2) gruppi.delete(chiave);
    }
    return gruppi;
  }, [tickets]);

  // ★ NUOVA — vedi appuntamentiProgrammati sopra: mappa per accesso O(1)
  // dalla card, il più vicino nel tempo se per assurdo ce ne fosse più di
  // uno per lo stesso Ticket (non dovrebbe capitare nel flusso normale, ma
  // meglio non presumerlo).
  const appuntamentoPerTicket = useMemo(() => {
    const mappa = new Map<string, { data_ora: string; tipo_servizio: TipoServizioAppuntamento }>();
    for (const a of appuntamentiProgrammati) {
      if (!a.ticket_id) continue;
      const esistente = mappa.get(a.ticket_id);
      if (!esistente || new Date(a.data_ora) < new Date(esistente.data_ora)) mappa.set(a.ticket_id, a);
    }
    return mappa;
  }, [appuntamentiProgrammati]);

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
    const risultato = await aggiornaStatoTicket(t.id, prossimo, t.stato);
    if (risultato.errore) {
      toast(risultato.errore);
      return;
    }
    toast(`Passato a "${prossimo}".`, "successo");
    router.refresh();
  }

  async function prendiInCarico(t: Ticket, e: React.MouseEvent) {
    e.stopPropagation();
    const risultato = await assegnaTicket(t.id, currentPersonaId);
    if (risultato.errore) {
      toast(risultato.errore);
      return;
    }
    router.refresh();
  }

  function alternaSelezione(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelezionati((cur) => {
      const nuovo = new Set(cur);
      if (nuovo.has(id)) nuovo.delete(id);
      else nuovo.add(id);
      return nuovo;
    });
  }

  function assegnaBulk(personaId: string) {
    if (!personaId || selezionati.size === 0) return;
    startBulk(async () => {
      const risultati = await Promise.all([...selezionati].map((id) => assegnaTicket(id, personaId)));
      const errori = risultati.filter((r) => r.errore);
      if (errori.length > 0) toast(`${errori.length} su ${risultati.length} non riassegnati: ${errori[0].errore}`);
      else toast(`${risultati.length} ticket riassegnati.`, "successo");
      setSelezionati(new Set());
      router.refresh();
    });
  }

  // ★ NUOVA (2026-09-04, artifact "Proposte UX 2026", proposta ②, "io
  // farei tutto") — prima, un Ticket già assegnato si poteva riassegnare
  // solo aprendo il dettaglio: "Prendi in carico" sulla card copriva solo
  // il caso "non ancora assegnato a nessuno". Un menu a tendina diretto
  // sulla card copre anche il caso più comune — spostare un Ticket già
  // preso da un tecnico a un altro — senza aprire nulla.
  async function riassegnaInline(t: Ticket, personaId: string, e: React.ChangeEvent<HTMLSelectElement> | React.MouseEvent) {
    e.stopPropagation();
    const risultato = await assegnaTicket(t.id, personaId || null);
    if (risultato.errore) {
      toast(risultato.errore);
      return;
    }
    toast(personaId ? "Tecnico riassegnato." : "Tecnico rimosso.", "successo");
    router.refresh();
  }

  return (
    <div>
      {/* ★ NUOVA — "viste" (③ integrate + quelle salvate dall'utente):
      applicano l'intera combinazione di filtri con un click, invece di
      ricostruirla a mano ogni volta con i menu a tendina sotto. Evidenziata
      quella che corrisponde esattamente ai filtri attivi ora, nessuna se la
      combinazione è "libera" (impostata a mano, non salvata). */}
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        {VISTE_INTEGRATE.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => applicaVista(v.filtri)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              JSON.stringify(filtri) === JSON.stringify(v.filtri) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-primary/40"
            }`}
          >
            {v.nome}
          </button>
        ))}
        {visteSalvate.elenco.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => applicaVista(v.filtri)}
            className={`group flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              JSON.stringify(filtri) === JSON.stringify(v.filtri) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:border-primary/40"
            }`}
          >
            {v.nome}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => eliminaVista(v, e)}
              onKeyDown={(e) => e.key === "Enter" && eliminaVista(v, e as unknown as React.MouseEvent)}
              aria-label={`Elimina vista "${v.nome}"`}
              title="Elimina vista"
              className="opacity-40 transition hover:opacity-100"
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={salvaVistaAttuale}
          title="Salva la combinazione di filtri attuale come vista"
          className="flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
        >
          <BookmarkPlus className="h-3 w-3" strokeWidth={2.5} />
          Salva vista attuale
        </button>
      </div>

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

      {/* ★ NUOVA — barra azioni bulk: compare solo quando c'è una
      selezione, zero ingombro il resto del tempo. Vedi nota su
      selezionati/assegnaBulk sopra sul perché "segna completato" non è
      un'azione bulk. */}
      {selezionati.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-xl bg-foreground px-3.5 py-2.5 text-background shadow-md">
          <span className="text-xs font-bold">
            {selezionati.size} ticket selezionat{selezionati.size === 1 ? "o" : "i"}
          </span>
          <select
            defaultValue=""
            disabled={inCorsoBulk}
            onChange={(e) => assegnaBulk(e.target.value)}
            className="h-8 rounded-md border-none bg-background/15 px-2 text-xs font-semibold text-background outline-none disabled:opacity-60"
          >
            <option value="" disabled>Assegna a…</option>
            {persone.map((p) => (
              <option key={p.id} value={p.id} className="text-foreground">{p.nome}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={inCorsoBulk}
            onClick={() => setSelezionati(new Set())}
            className="ml-auto flex items-center gap-1 text-xs font-semibold text-background/70 transition hover:text-background disabled:opacity-60"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
            Deseleziona
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLONNE.map((col) => {
          const items = filtrati.filter((t) => col.stati.includes(t.stato));
          return (
            <div key={col.titolo} className="rounded-2xl bg-muted/50 p-3">
              <div className="mb-1 flex items-center justify-between px-1">
                <span className="font-heading text-sm font-bold">{col.titolo}</span>
                <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground shadow-sm">
                  {items.length}
                </span>
              </div>
              {/* ★ NUOVA (2026-09) — richiesta esplicita "andrebbe ripulito
              ogni tot giorni per non riempire": la colonna ora mostra solo
              i Ticket completati negli ultimi GIORNI_CONSERVAZIONE_LAVORATA
              giorni (vedi tickets/page.tsx). Una riga qui spiega dove sono
              finiti gli altri, invece di lasciar credere che siano persi. */}
              {col.titolo === "Lavorata" && (
                <Link href="/archivio" className="mb-2 block px-1 text-[11px] text-muted-foreground/70 hover:text-primary hover:underline">
                  Ultimi 14 giorni — lo storico completo è in Archivio →
                </Link>
              )}
              <div className="flex flex-col gap-3">
                {items.length === 0 && (
                  <div className="flex items-center justify-center px-4 py-8 text-center text-xs text-muted-foreground/70">
                    {col.vuoto}
                  </div>
                )}
                {raggruppaPerCategoria(items).map((gruppo) => {
                  // ★ NUOVA — richiesta esplicita: distinzione di colore tra
                  // un'etichetta di gruppo e l'altra (prima erano tutte lo
                  // stesso grigio) — coloreGruppo() assegna una tinta fissa
                  // e stabile per stringa, non un giudizio di reparto/stato.
                  const coloreG = coloreGruppo(gruppo.chiave);
                  return (
                  <div key={gruppo.chiave}>
                    {/* ★ l'etichetta di categoria/sottocategoria si scrive una
                    volta per gruppo invece che su ogni card — vedi
                    raggruppaPerCategoria() sopra. Il numero a destra è un
                    dato che prima non c'era da nessuna parte: quanti Ticket
                    sono fermi allo stesso identico passaggio. */}
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span
                        className={`min-w-0 truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${coloreG.sfondo} ${coloreG.testo}`}
                        title={gruppo.chiave}
                      >
                        {gruppo.chiave}
                      </span>
                      <span className="shrink-0 text-[10px] font-bold tabular-nums text-muted-foreground/70">{gruppo.ticket.length}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {gruppo.ticket.map((t) => {
                        const assegnatario = trovaPersona(t.tecnico_assegnato);
                        const puoAvanzare = SEQUENZA_STATO.indexOf(t.stato) < SEQUENZA_STATO.length - 1;
                        const giorni = giorniAperta(t.data_creazione);
                        // ★ NUOVA (2026-08-27, richiesta esplicita: "rivedere il
                        // sistema di notificazione come pulsa la notifica di
                        // documenti ricevuti" → "estenderlo agli altri 6 eventi-
                        // cliente") — stesso trattamento già in uso in
                        // Segnalazioni per "Dati ricevuti": un badge che pulsa
                        // finché l'evento è fresco, poi si ferma da solo (vedi
                        // entroOreDa() — nessun campo "visto" da spuntare a
                        // mano). Due casi coperti qui: un Ticket appena
                        // arrivato (dal Portale, o creato in automatico
                        // all'approvazione di un contratto) ancora da
                        // assegnare, e la conferma del cliente che un
                        // intervento risolto da remoto funziona davvero.
                        const altriTicketStessoCliente = (ticketRipetutiPerTelefono.get(normalizzaTelefono(t.telefono)) ?? []).filter((n) => n !== t.numero);
                        let segnale: { testo: string; critico: boolean; pulsante?: boolean } | null = null;
                        if (t.priorita === "Urgente") {
                          segnale = { testo: "🔴 Urgente", critico: true };
                        } else if (altriTicketStessoCliente.length > 0) {
                          // ★ NUOVA — vedi ticketRipetutiPerTelefono sopra:
                          // un cliente tornato più volte per Assistenza,
                          // segnale di insoddisfazione più concreto di un
                          // ticket semplicemente "fermo da giorni".
                          segnale = { testo: `⚠️ Cliente tornato — anche #${altriTicketStessoCliente.join(", #")}`, critico: false };
                        } else if (t.confermato_cliente_il && entroOreDa(t.confermato_cliente_il, 48)) {
                          segnale = { testo: "✓ Cliente ha confermato l'intervento", critico: false, pulsante: true };
                        } else if (!t.tecnico_assegnato && !t.tecnico_esterno_id && entroOreDa(t.data_creazione, 2)) {
                          segnale = { testo: "🆕 Nuovo — non ancora preso in carico", critico: false, pulsante: true };
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
                            className="group relative flex cursor-pointer items-start gap-1.5 rounded-lg border bg-card p-2 pr-9 text-left text-sm transition hover:border-primary/40 hover:bg-muted/30"
                          >
                            {/* ★ NUOVA — checkbox di selezione (proposta ③,
                            azioni bulk): elemento vero del flex, non
                            sovrapposto al pallino reparto — a riposo
                            invisibile (`opacity-0`), visibile passando il
                            mouse sulla card o se già selezionata, per non
                            appesantire la card quando non si sta selezionando
                            nulla. */}
                            <button
                              type="button"
                              onClick={(e) => alternaSelezione(t.id, e)}
                              aria-label={selezionati.has(t.id) ? "Deseleziona" : "Seleziona"}
                              className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition ${
                                selezionati.has(t.id)
                                  ? "border-primary bg-primary text-primary-foreground opacity-100"
                                  : "border-border bg-card text-transparent opacity-0 group-hover:opacity-100"
                              }`}
                            >
                              <Check className="h-2.5 w-2.5" strokeWidth={3} />
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-1.5">
                                {colore && <span title={t.reparto} className={`h-1.5 w-1.5 shrink-0 self-center rounded-full ${colore.fascia}`} />}
                                <span className="min-w-0 flex-1 truncate font-semibold">{t.cliente}</span>
                                <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">#{t.numero}</span>
                              </div>
                              {/* ★ NUOVA (2026-09), giro 3 — la sottocategoria
                              non ha più una sezione tutta sua (vedi
                              raggruppaPerCategoria sopra): torna qui, come
                              piccola etichetta discreta sotto il nome, non
                              come titolo di sezione. */}
                              {t.sottocategoria && <div className="truncate text-[11px] text-muted-foreground/80">{t.sottocategoria}</div>}
                              {segnale && segnale.pulsante ? (
                                <div className="mt-1">
                                  <SegnalePulsante testo={segnale.testo} tono="successo" pulsante />
                                </div>
                              ) : (
                                segnale && (
                                  <div className={`mt-1 pl-3 text-xs font-semibold ${segnale.critico ? "text-critical" : "text-warning"}`}>{segnale.testo}</div>
                                )
                              )}
                              {/* ★ NUOVA (2026-09-04, richiesta esplicita:
                              "devo vedere dai ticket quando sono pianificati
                              e devo avere l'etichetta che lo dice") — prima
                              l'unico modo di saperlo era aprire il Ticket
                              (DettaglioTicket lo scopre con un fetch a
                              parte). Etichetta sempre visibile, non un
                              segnale d'allarme come gli altri sopra — un
                              fatto, non un avviso.
                              ★ ESTESA (2026-09-04, richiesta esplicita:
                              "puoi correggere e metterli su quelli già
                              pianificati" — dato reale trovato controllando
                              questa modifica: alcuni appuntamenti restano
                              "Programmato" con data ormai passata, mai
                              segnati completati/annullati) — data passata =
                              colore d'avviso invece del grigio neutro,
                              stesso principio di "Ferma da Ng" sopra: un
                              appuntamento pianificato per ieri e mai
                              aggiornato è a tutti gli effetti un problema
                              da controllare, non un fatto qualunque. */}
                              {appuntamentoPerTicket.has(t.id) && (() => {
                                const app = appuntamentoPerTicket.get(t.id)!;
                                const passato = new Date(app.data_ora) < new Date();
                                // ★ REDESIGN (2026-09), giro 3 — richiesta
                                // esplicita "è troppo caotico, non ci capisco
                                // più nulla" su card con "Cliente tornato" +
                                // "Pianificato (scaduto)" impilati, due righe
                                // colorate ad allarme una sopra l'altra.
                                // Stesso principio già in uso in Segnalazioni:
                                // un solo segnale acceso per card. Se c'è già
                                // un `segnale` sopra, questa riga resta un
                                // fatto neutro (grigio) — la data è comunque
                                // sempre visibile, non sparisce nulla, solo
                                // non compete più per l'attenzione. Senza
                                // altri segnali, uno scaduto resta comunque
                                // in giallo/arancio: è l'unica cosa da notare.
                                const evidenziato = passato && !segnale;
                                return (
                                  <div className={`mt-1 flex items-center gap-1 text-[11px] font-semibold ${evidenziato ? "text-warning" : "text-muted-foreground"}`}>
                                    <IconaCategoria icona={CalendarClock} categoria="tempo" dimensione="sm" />
                                    {passato ? "Pianificato (scaduto) — " : "Pianificato — "}
                                    {new Date(app.data_ora).toLocaleString("it-IT", {
                                      day: "2-digit",
                                      month: "2-digit",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </div>
                                );
                              })()}
                            </div>

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
                                  aria-label="Prendi in carico"
                                  className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed bg-card text-muted-foreground transition hover:border-primary hover:text-primary"
                                >
                                  <UserPlus className="h-3 w-3" strokeWidth={2.5} />
                                </button>
                              )}
                              {/* ★ NUOVA — riassegna un Ticket già preso senza
                              aprire il dettaglio (vedi riassegnaInline sopra):
                              select "invisibile" (nessun bordo a riposo),
                              solo un'icona persona a fare da indizio, per non
                              appesantire una card già stretta. */}
                              {assegnatario && (
                                <label
                                  title="Riassegna"
                                  onClick={(e) => e.stopPropagation()}
                                  className="flex h-6 items-center gap-0.5 rounded-full border bg-card px-1 text-muted-foreground transition hover:border-primary hover:text-primary"
                                >
                                  <UserPlus className="h-3 w-3 shrink-0" strokeWidth={2.5} />
                                  <select
                                    value={t.tecnico_assegnato ?? ""}
                                    onChange={(e) => riassegnaInline(t, e.target.value, e)}
                                    onClick={(e) => e.stopPropagation()}
                                    aria-label="Riassegna tecnico"
                                    className="max-w-14 truncate border-none bg-transparent text-[10px] font-semibold outline-none"
                                  >
                                    <option value="">Nessuno</option>
                                    {persone.map((p) => (
                                      <option key={p.id} value={p.id}>{p.nome}</option>
                                    ))}
                                  </select>
                                </label>
                              )}
                              {puoAvanzare && (
                                <button
                                  onClick={(e) => avanzaStato(t, e)}
                                  title="Avanza allo stato successivo"
                                  aria-label="Avanza allo stato successivo"
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
                  );
                })}
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
              tecniciEsterni={tecniciEsterni}
              currentPersonaId={currentPersonaId}
              altriTicketStessoCliente={(ticketRipetutiPerTelefono.get(normalizzaTelefono(aperto.telefono)) ?? []).filter((n) => n !== aperto.numero)}
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
  tecniciEsterni,
  currentPersonaId,
  altriTicketStessoCliente,
  onApriScheda,
  onCambiato,
  onEliminato,
}: {
  ticket: Ticket;
  persone: Persona[];
  tecniciEsterni: { id: string; nome: string; cognome: string | null }[];
  currentPersonaId: string;
  /** ★ NUOVA — vedi ticketRipetutiPerTelefono in TicketsBoard: numeri degli
   * altri Ticket "Analisi Rete" dello stesso cliente (telefono), se ce ne
   * sono almeno uno — un cliente tornato più volte per assistenza. */
  altriTicketStessoCliente: number[];
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
  // ★ NUOVA (2026-08-26) — alternativo ad `assegnatario`: mai valorizzati
  // insieme (assegnaTicket()/assegnaTicketTecnicoEsterno() azzerano sempre
  // l'altro campo), vedi commento sulle due action in tickets/actions.ts.
  const assegnatarioEsterno = ticket.tecnico_esterno_id ? tecniciEsterni.find((t) => t.id === ticket.tecnico_esterno_id) : null;
  const [inCorsoAssegnaEsterno, startAssegnaEsterno] = useTransition();

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

  const numeroDocumenti = (ticket.contratto_pdf_url ? 1 : 0) + richieste.length + (ticket.stato === "Completato" && (scheda || rapportino) ? 1 : 0);

  const linkPratica = useMemo(() => {
    if (!praticaScelta || typeof window === "undefined") return "";
    const origine = window.location.origin;
    if (praticaScelta === "disdetta") return `${origine}/disdetta?ticket=${ticket.numero}`;
    return `${origine}/richiesta-cliente/${praticaScelta}?ticketId=${ticket.id}`;
  }, [praticaScelta, ticket.numero, ticket.id]);
  const titoloPraticaScelta = PRATICHE_INVIABILI.find((p) => p.slug === praticaScelta)?.titolo ?? "";

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
  const messaggioPratica = praticaScelta ? messaggioWhatsappPratica(ticket.cliente, titoloPraticaScelta, linkPratica) : "";

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
      const risultato = await aggiornaStatoTicket(ticket.id, nuovo, ticket.stato);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      onCambiato({ ...ticket, stato: nuovo });
      toast(`Passato a "${nuovo}".`, "successo");
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

        {/* ★ NUOVA — vedi ticketRipetutiPerTelefono in TicketsBoard: un
        cliente tornato più volte per Assistenza, visibile qui indipendente
        da quale tab è aperta — non solo un pallino sulla card della
        bacheca, il contesto completo (quali Ticket) proprio dove si sta
        già lavorando questo cliente. */}
        {altriTicketStessoCliente.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-xs font-semibold text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
            Cliente tornato per Assistenza — anche Ticket #{altriTicketStessoCliente.join(", #")}.
          </p>
        )}

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
            <p className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <IconaCategoria icona={CalendarCheck2} categoria="tempo" dimensione="sm" />
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
          <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <IconaCategoria icona={UserRound} categoria="persona" dimensione="sm" />
            Assegnato a
          </div>
          {/* ★ SEMPLIFICATA (2026-08-27, richiesta esplicita — revisione
          Ticket via artifact: "due meccanismi separati" → "semplifica") —
          prima "Prendi in carico" (solo se stesso) e l'assegnazione a un
          tecnico esterno erano due controlli diversi, e non esisteva alcun
          modo di assegnare a UN COLLEGA (solo a sé stessi o a un esterno).
          Un solo select copre tutti i casi: te stesso (scorciatoia in
          cima), un collega, o un tecnico esterno — stessa logica di
          "assegnato/rimuovi" per entrambi i tipi invece di due rami
          diversi con lo stesso bottone "Rimuovi" duplicato due volte. */}
          {assegnatario || assegnatarioEsterno ? (
            <div className="mt-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                    assegnatarioEsterno ? "bg-servizio-installazione text-white" : "bg-primary text-primary-foreground"
                  }`}
                >
                  {assegnatarioEsterno ? assegnatarioEsterno.nome.slice(0, 2).toUpperCase() : iniziali(assegnatario!)}
                </span>
                <span className="font-medium">
                  {assegnatarioEsterno ? `${assegnatarioEsterno.nome} ${assegnatarioEsterno.cognome ?? ""}`.trim() : assegnatario!.nome}
                </span>
                {assegnatarioEsterno && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">esterno</span>
                )}
              </div>
              <button
                type="button"
                disabled={inCorsoAssegna || inCorsoAssegnaEsterno}
                onClick={() =>
                  startAssegna(async () => {
                    const risultato = await assegnaTicket(ticket.id, null);
                    if (risultato.errore) {
                      toast(risultato.errore);
                      return;
                    }
                    onCambiato({ ...ticket, tecnico_assegnato: null, tecnico_esterno_id: null });
                  })
                }
                className="text-xs text-muted-foreground hover:text-critical disabled:opacity-60"
              >
                Rimuovi
              </button>
            </div>
          ) : (
            <select
              defaultValue=""
              disabled={inCorsoAssegna || inCorsoAssegnaEsterno}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                if (v === "io") {
                  startAssegna(async () => {
                    const risultato = await assegnaTicket(ticket.id, currentPersonaId);
                    if (risultato.errore) {
                      toast(risultato.errore);
                      return;
                    }
                    onCambiato({ ...ticket, tecnico_assegnato: currentPersonaId, tecnico_esterno_id: null });
                  });
                } else if (v.startsWith("p:")) {
                  const id = v.slice(2);
                  startAssegna(async () => {
                    const risultato = await assegnaTicket(ticket.id, id);
                    if (risultato.errore) {
                      toast(risultato.errore);
                      return;
                    }
                    onCambiato({ ...ticket, tecnico_assegnato: id, tecnico_esterno_id: null });
                  });
                } else {
                  const id = v.slice(2);
                  startAssegnaEsterno(async () => {
                    const risultato = await assegnaTicketTecnicoEsterno(ticket.id, id);
                    if (risultato.errore) {
                      toast(risultato.errore);
                      return;
                    }
                    onCambiato({ ...ticket, tecnico_esterno_id: id, tecnico_assegnato: null });
                  });
                }
              }}
              className="mt-1.5 h-9 w-full rounded-md border bg-background px-2 text-xs disabled:opacity-60"
            >
              <option value="">Assegna a...</option>
              <option value="io">Io{persone.find((p) => p.id === currentPersonaId) ? ` (${persone.find((p) => p.id === currentPersonaId)!.nome})` : ""}</option>
              {persone.filter((p) => p.attivo && p.id !== currentPersonaId).length > 0 && (
                <optgroup label="Staff">
                  {persone
                    .filter((p) => p.attivo && p.id !== currentPersonaId)
                    .map((p) => (
                      <option key={p.id} value={`p:${p.id}`}>{p.nome}</option>
                    ))}
                </optgroup>
              )}
              {tecniciEsterni.length > 0 && (
                <optgroup label="Tecnici esterni">
                  {tecniciEsterni.map((t) => (
                    <option key={t.id} value={`e:${t.id}`}>
                      {t.nome} {t.cognome}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
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
        sbagliata sul campo se chi pianifica non se ne accorgeva.
        ★ FIX (2026-08-28, bug reale segnalato DUE VOLTE: "stai trattando le
        nuove installazioni come interventi in loco") — prima guardava solo
        `categoria === "Commerciale" || segnalazione_id`: un Ticket
        categoria "Assistenza" con sottocategoria "Pianificazione
        installazione" (trovato reale in produzione, appuntamenti già con
        la Scheda sbagliata aperta sul campo) non passava da nessuno dei
        due. Ora usa `tipoServizioDaTicket()` (lib/types.ts), unica fonte
        condivisa anche con Calendario → FormNuovoAppuntamento invece di
        due condizioni copiate e disallineate; `segnalazione_id` resta
        come controllo aggiuntivo di sicurezza. */}
        <PianificaAppuntamento
          ticket={ticket}
          persone={persone}
          tipoServizioIniziale={
            tipoServizioDaTicket(ticket.categoria, ticket.sottocategoria) === "Nuova installazione" || ticket.segnalazione_id
              ? "Nuova installazione"
              : "Lavorazione tecnica"
          }
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
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <IconaCategoria icona={FileSignature} categoria="documento" dimensione="sm" />
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
                        <PulsanteDocumento
                          key={i}
                          percorso={doc.percorso}
                          nome={doc.nome}
                          etichetta={doc.tipo ? `${doc.tipo} — ${doc.nome}` : doc.nome}
                          onOttieniUrl={urlDocumentoRichiesta}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <IconaCategoria icona={FileSignature} categoria="documento" dimensione="sm" />
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
            <Button size="icon" className="h-11 w-11 shrink-0" disabled={inCorsoNota || !notaTesto.trim()} onClick={inviaNota} title="Invia nota" aria-label="Invia nota">
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
  stato: TipoStatoTraccia;
  testoOk: string;
  testoNo: string;
  testoAttesa: string;
}) {
  const { icona: Icona, classi } = CONFIG_STATO_TRACCIA[stato];
  const testo = { ok: testoOk, no: testoNo, attesa: testoAttesa }[stato];
  return (
    <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${classi}`}>
      <Icona className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
      {etichetta} — {testo}
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
  // ★ NUOVA (2026-09-03, "rivedere completamente il calendario e come si
  // vede come titolo sia su google che sul calendario del gestionale") —
  // prima il titolo qui era sempre `categoria — sottocategoria · cliente`
  // (es. "Assistenza — Guasto rete · Mario Rossi", gergo interno del
  // ticket, non diceva cosa fare sul posto) e non riceveva mai il
  // selettore "Tipo di intervento" aggiunto in Calendario → "Nuovo
  // Appuntamento": stesso concetto, risultato diverso a seconda di dove si
  // pianificava. Ora titoloAppuntamento() decide il titolo in un solo
  // punto, usato da entrambi.
  const [tipoServizio, setTipoServizio] = useState<TipoServizioAppuntamento>(tipoServizioIniziale);
  const [tipoIntervento, setTipoIntervento] = useState("");
  // ★ NUOVA (2026-09-03, "va bene la c" — comune nel titolo, formato "C"
  // dell'artifact "Comune in Titolo") — precompilato da una stima
  // sull'indirizzo del Ticket (vedi stimaComuneDaIndirizzo()), resta un
  // testo libero modificabile prima di "Assegna e fissa".
  const [comune, setComune] = useState(() => stimaComuneDaIndirizzo(ticket.indirizzo));

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
    // ★ NUOVA (2026-09-03, richiesta esplicita dopo un caso reale — "Sarre —
    // Vania Luberto", pianificato senza scegliere il tipo di intervento —
    // "non si vede il tipo di lavorazione") — stesso obbligo già aggiunto a
    // Calendario → "Nuovo Appuntamento": per una Lavorazione tecnica va
    // scelto per forza, non basta più lasciarlo "Non specificato".
    if (tipoServizio === "Lavorazione tecnica" && !tipoIntervento) return setErrore("Scegli il tipo di intervento (Cambio CPE, Ripuntamento…).");

    startTransizione(async () => {
      const risultato = await creaAppuntamento({
        titolo: titoloAppuntamento(tipoServizio, tipoIntervento, comune, ticket.cliente),
        indirizzo: ticket.indirizzo || "",
        dataOra: new Date(`${data}T${ora}`).toISOString(),
        durataMinuti: Number(dati.get("durata") || 60),
        tecnicoId: String(dati.get("tecnico") || ""),
        ticketId: ticket.id,
        note: "",
        tipoServizio,
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
      <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <IconaCategoria icona={CalendarPlus} categoria="tempo" dimensione="sm" />
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
        <select
          name="tipo_servizio"
          value={tipoServizio}
          onChange={(e) => setTipoServizio(e.target.value as TipoServizioAppuntamento)}
          className="h-8 rounded-md border bg-background px-2 text-xs"
        >
          {TIPI_SERVIZIO_APPUNTAMENTO.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        {tipoServizio === "Lavorazione tecnica" && (
          <select
            name="tipo_intervento"
            required
            value={tipoIntervento}
            onChange={(e) => setTipoIntervento(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option value="">— Scegli il tipo di intervento —</option>
            {INTERVENTI_RAPIDI.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          name="comune"
          value={comune}
          onChange={(e) => setComune(e.target.value)}
          placeholder="Comune (facoltativo)"
          className="h-8 rounded-md border bg-background px-2 text-xs"
        />
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
