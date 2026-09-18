"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { UserRound, X, Search, ChevronRight, UserPlus, CalendarPlus, CalendarClock, CalendarCheck2, AlertTriangle, Loader2, BookmarkPlus, Check } from "lucide-react";
import { tempoRelativo } from "@/lib/tempo-relativo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/hooks/use-confirm";
import {
  aggiornaStatoTicket,
  assegnaTicket,
  assegnaTicketTecnicoEsterno,
  aggiungiNotaTicket,
  getNoteTicket,
  inviaEmailApprovazioneTicket,
  inviaEmailPraticaCliente,
  cambiaRepartoTicket,
  eliminaTicket,
  fissaDataDismissioneDisdetta,
} from "@/app/(app)/tickets/actions";
import {
  avviaPraticaSubentro,
  inviaLinkVecchioClienteSubentro,
  salvaContattoNuovoTitolareSubentro,
  completaSubentro,
  caricaContrattoSubentro,
  inviaEmailApprovazioneContrattoSubentro,
} from "@/app/(app)/richieste-clienti/actions";
import { urlContratto } from "@/app/(app)/segnalazioni/actions";
import { creaAppuntamento, getSlotOccupatiProssimi, getAppuntamentoAttivoPerTicket, getAntenneRiservatePerTicket, type SlotOccupato } from "@/app/(app)/calendario/actions";
import { IconaCategoria } from "@/components/condivisi/icona-categoria";
import { SezioneStatoTicket } from "@/components/tickets/sezione-stato-ticket";
import { SezioneAssegnazioneTicket } from "@/components/tickets/sezione-assegnazione";
import { SezioneDocumentiTicket } from "@/components/tickets/sezione-documenti-ticket";
import { SezioneNoteTicket } from "@/components/tickets/sezione-note-ticket";
import { SchedaInstallazioneForm } from "@/components/schede/scheda-installazione-form";
import { SchedaLavorazioneForm } from "@/components/schede/scheda-lavorazione-form";
import { getSchedaLavoroPerTicket } from "@/app/(app)/calendario/actions";
import { messaggioWhatsappPratica, CHIAVE_BOZZA_CONTATTO_SUBENTRO } from "@/lib/richieste-cliente-config";
import { getRapportinoTicket } from "@/app/(app)/tickets/actions";
import { getRichiesteClientiPerTicket } from "@/app/(app)/richieste-clienti/actions";
import { SegnalePulsante, entroOreDa } from "@/components/condivisi/segnale-pulsante";
import type { Appuntamento, MaterialeMagazzino, NotaTicket, Persona, PrioritaTicket, RichiestaCliente, StatoTicket, Ticket, RapportinoIntervento, SchedaLavoro, TipoServizioAppuntamento } from "@/lib/types";
import { REPARTI, CATEGORIE_TICKET, TIPI_SERVIZIO_APPUNTAMENTO, INTERVENTI_RAPIDI, coloreReparto, coloreGruppo, titoloAppuntamento, stimaComuneDaIndirizzo } from "@/lib/types";
import { CONFIG_SOTTOCATEGORIE } from "@/lib/campi-ticket";
import { urlDocumentoRapportino } from "@/app/(app)/tickets/actions";
import { useToast } from "@/components/ui/toast";
import { usePersistedState } from "@/lib/use-persisted-state";

// ★ FIX (2026-08, controllo d'oro) — Trasferimento/Cambio IBAN/Cambio
// Anagrafica non passano più da qui: si avviano dalla scheda del Cliente
// Esterno (vedi NuovaPraticaClienteEsterno), non serve più un Ticket per
// loro (proposta "Pratiche cliente senza Ticket"). Tenerle anche qui
// sarebbe stato un secondo modo di fare la stessa cosa — esattamente il
// doppione da evitare. Resta solo Disdetta (mai stata legata a questo
// problema, resta una pagina di istruzioni).
//
// ★ TOLTA (2026-09, "è un macello, va riorganizzata e semplificata" —
// vedi l'artifact "Il Processo del Subentro") — Subentro viveva qui in
// mezzo, una voce tra le altre in un menu a tendina generico "manda un
// link" — ma ha un flusso completamente diverso (doppio consenso, non un
// solo link) e se ne accorgeva solo chi già sapeva che esisteva. Ha ora
// una sezione propria, sempre visibile, subito sotto (vedi
// SubentroDoppioConsenso più in basso nel render).
const PRATICHE_INVIABILI = [{ slug: "disdetta" as const, titolo: "Disdetta contratto" }];

// ★ collega le sottocategoria di Ticket (SOTTOCATEGORIE_TICKET) alla
// pratica pubblica corrispondente per nome — solo Disdetta resta
// avviabile da qui (vedi nota sopra); Trasferimento/Cambio IBAN/Cambio
// Anagrafica/Subentro come sottocategoria Ticket restano scelte valide
// per classificare un intervento legato al tema, ma non suggeriscono più
// automaticamente un invio pratica da questo pannello.
const PRATICA_PER_SOTTOCATEGORIA: Record<string, (typeof PRATICHE_INVIABILI)[number]["slug"]> = {
  Disdetta: "disdetta",
};

export const SEQUENZA_STATO: StatoTicket[] = ["Da gestire", "In lavorazione", "In attesa", "Completato"];
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

export function iniziali(persona: Persona) {
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
// ★ AFFINATA (2026-09-15, seguito diretto — screenshot del redesign:
// "fatico ancora, troppe scritte e troppi nomi assieme") — quando tutte
// le card di un gruppo condividono la stessa sottocategoria (es. 5 Ticket
// "Disdetta" di fila sotto "AMMINISTRATIVA"), scriverla identica su ogni
// riga è la stessa parola ripetuta N volte senza motivo. `sottocategoriaComune`
// la porta una volta sola nell'intestazione del gruppo; il render toglie
// la riga per-card solo in quel caso (resta per-card quando il gruppo
// mischia sottocategorie diverse, dove serve davvero a distinguerle).
function raggruppaPerCategoria(items: Ticket[]): { chiave: string; sottocategoriaComune: string | null; ticket: Ticket[] }[] {
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
  return gruppi.map((g) => {
    const prime = g.ticket[0]?.sottocategoria ?? null;
    const comune = prime && g.ticket.every((t) => t.sottocategoria === prime) ? prime : null;
    return { ...g, sottocategoriaComune: comune };
  });
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
  // ★ FIX (2026-09-18, audit — backlog "prompt()/confirm() nativi del
  // browser") — window.prompt()/confirm() sostituiti con dialog del
  // progetto: nomeVistaAperto gestisce l'input testuale (useConfirm non
  // copre quel caso, solo sì/no), confirmEliminaVista la conferma.
  const [nomeVistaAperto, setNomeVistaAperto] = useState(false);
  const [nomeVistaBozza, setNomeVistaBozza] = useState("");
  const { confirm: confirmEliminaVista, ConfirmDialog: DialogEliminaVista } = useConfirm();

  function applicaVista(v: FiltriTicket) {
    aggiornaFiltri(v);
  }

  function salvaVistaAttuale() {
    setNomeVistaBozza("");
    setNomeVistaAperto(true);
  }

  function confermaSalvaVista() {
    const nome = nomeVistaBozza.trim();
    if (!nome) return;
    const nuova: VistaSalvata = { id: crypto.randomUUID(), nome, filtri: { ...filtri } };
    aggiornaVisteSalvate({ elenco: [...visteSalvate.elenco, nuova] });
    toast(`Vista "${nome}" salvata.`, "successo");
    setNomeVistaAperto(false);
  }

  async function eliminaVista(v: VistaSalvata, e: React.MouseEvent) {
    e.stopPropagation();
    if (!(await confirmEliminaVista({ titolo: "Eliminare la vista?", descrizione: `Eliminare la vista "${v.nome}"?`, distruttivo: true }))) return;
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
  // ★ FIX (2026-09-18, audit modulo Ticket) — "Prendi in carico", "Avanza
  // stato" e "Riassegna" sulla card non avevano alcun loading state, a
  // differenza delle stesse azioni nel dettaglio: un doppio click (facile
  // su un pulsante piccolo, hover-only) poteva inviare due richieste in
  // sequenza prima che la UI si aggiornasse. Un Set di id Ticket "in corso"
  // invece di un booleano unico, così un'azione su una card non disabilita
  // anche i pulsanti di tutte le altre.
  const [ticketInCorso, setTicketInCorso] = useState<Set<string>>(new Set());

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

  function segnaInCorso(id: string, valore: boolean) {
    setTicketInCorso((cur) => {
      const nuovo = new Set(cur);
      if (valore) nuovo.add(id);
      else nuovo.delete(id);
      return nuovo;
    });
  }

  async function avanzaStato(t: Ticket, e: React.MouseEvent) {
    e.stopPropagation();
    if (ticketInCorso.has(t.id)) return;
    const idx = SEQUENZA_STATO.indexOf(t.stato);
    const prossimo = SEQUENZA_STATO[idx + 1];
    if (!prossimo) return;
    // ★ passare a Completato richiede il rapportino di chiusura: si apre il
    // dettaglio invece di aggiornare subito lo stato da qui.
    if (prossimo === "Completato") {
      setAperto(t);
      return;
    }
    segnaInCorso(t.id, true);
    const risultato = await aggiornaStatoTicket(t.id, prossimo, t.stato);
    segnaInCorso(t.id, false);
    if (risultato.errore) {
      toast(risultato.errore);
      return;
    }
    toast(`Passato a "${prossimo}".`, "successo");
    router.refresh();
  }

  async function prendiInCarico(t: Ticket, e: React.MouseEvent) {
    e.stopPropagation();
    if (ticketInCorso.has(t.id)) return;
    segnaInCorso(t.id, true);
    const risultato = await assegnaTicket(t.id, currentPersonaId);
    segnaInCorso(t.id, false);
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
    if (ticketInCorso.has(t.id)) return;
    segnaInCorso(t.id, true);
    const risultato = await assegnaTicket(t.id, personaId || null);
    segnaInCorso(t.id, false);
    if (risultato.errore) {
      toast(risultato.errore);
      return;
    }
    toast(personaId ? "Tecnico riassegnato." : "Tecnico rimosso.", "successo");
    router.refresh();
  }

  return (
    <div>
      <DialogEliminaVista />
      <Dialog open={nomeVistaAperto} onOpenChange={setNomeVistaAperto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Salva vista</DialogTitle>
            <DialogDescription>Nome per questa vista (es. &quot;Urgenti Fatturazione&quot;)</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={nomeVistaBozza}
            onChange={(e) => setNomeVistaBozza(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confermaSalvaVista()}
            placeholder="Nome vista"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNomeVistaAperto(false)}>
              Annulla
            </Button>
            <Button onClick={confermaSalvaVista} disabled={!nomeVistaBozza.trim()}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
              onKeyDown={(e) => {
                // ★ FIX (2026-09-18, audit modulo Ticket) — mancava Space,
                // il tasto standard per attivare un elemento con
                // role="button" da tastiera (Enter da solo non basta per
                // seguire la convenzione nativa di un vero <button>).
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  eliminaVista(v, e as unknown as React.MouseEvent);
                }
              }}
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
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={`min-w-0 shrink-0 truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${coloreG.sfondo} ${coloreG.testo}`}
                          title={gruppo.chiave}
                        >
                          {gruppo.chiave}
                        </span>
                        {/* ★ NUOVA — vedi sottocategoriaComune in
                        raggruppaPerCategoria(): quando tutte le card qui
                        sotto condividono la stessa sottocategoria, si dice
                        una volta sola qui invece che ripeterla identica su
                        ogni riga. */}
                        {gruppo.sottocategoriaComune && (
                          <span className="min-w-0 truncate text-[10px] font-semibold text-muted-foreground" title={gruppo.sottocategoriaComune}>
                            · {gruppo.sottocategoriaComune}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[10px] font-bold tabular-nums text-muted-foreground/70">{gruppo.ticket.length}</span>
                    </div>
                    {/* ★ gap-2 invece di gap-1.5 (2026-09-15, "alleggerire il
                    colpo visivo") — un po' più di respiro tra le card, ora
                    che i segnali sono chip strette invece di righe intere:
                    prima la densità serviva a compensare le righe lunghe,
                    ora affollerebbe solo lo spazio senza motivo. */}
                    <div className="flex flex-col gap-2">
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
                        // ★ REDESIGN (2026-09-15, richiesta esplicita: "voglio
                        // anche alleggerire il colpo visivo perché così è
                        // caotico e mi viene ansia a guardare" — proposta con
                        // artifact "Bacheca Ticket, Ridisegnata", principio
                        // "un solo colore per il vero allarme") — niente più
                        // emoji nel testo del segnale (un 🔴/⚠️/⏳ colorato è
                        // già un secondo modo di dire "attenzione", oltre al
                        // colore del chip che lo mostra): il colore/forma del
                        // chip basta da solo, il testo resta neutro anche
                        // quando `critico` è vero.
                        // ★ AFFINATA (2026-09-15, seguito diretto — screenshot
                        // dopo il redesign: "così?" — "Cliente tornato"
                        // restava arancione come "Scaduto", pur non essendo
                        // un'urgenza A TEMPO ma solo un segnale da notare)
                        // — `tono` sostituisce `critico`: solo ciò che è
                        // davvero urgente ORA prende un colore (arancio
                        // "avviso", rosso pieno solo per l'urgenza vera);
                        // "Cliente tornato" diventa un fatto neutro come
                        // "Pianificato", non un allarme — lo stesso principio
                        // dell'artifact ("un solo colore per il vero
                        // allarme"), applicato fino in fondo.
                        let segnale: { testo: string; tono: "critico" | "avviso" | "neutro"; pulsante?: boolean } | null = null;
                        if (t.priorita === "Urgente") {
                          segnale = { testo: "Urgente", tono: "critico" };
                        } else if (altriTicketStessoCliente.length > 0) {
                          // ★ NUOVA — vedi ticketRipetutiPerTelefono sopra:
                          // un cliente tornato più volte per Assistenza,
                          // segnale di insoddisfazione più concreto di un
                          // ticket semplicemente "fermo da giorni".
                          segnale = { testo: `Cliente tornato — anche #${altriTicketStessoCliente.join(", #")}`, tono: "neutro" };
                        } else if (t.confermato_cliente_il && entroOreDa(t.confermato_cliente_il, 48)) {
                          segnale = { testo: "✓ Cliente ha confermato l'intervento", tono: "neutro", pulsante: true };
                        } else if (!t.tecnico_assegnato && !t.tecnico_esterno_id && entroOreDa(t.data_creazione, 2)) {
                          segnale = { testo: "🆕 Nuovo — non ancora preso in carico", tono: "neutro", pulsante: true };
                        } else if (t.stato === "Da gestire" && giorni >= 5) {
                          segnale = { testo: `Ferma da ${giorni}g`, tono: giorni >= 10 ? "critico" : "avviso" };
                        }
                        const colore = coloreReparto(t.reparto);
                        return (
                          <div
                            key={t.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setAperto(t)}
                            onKeyDown={(e) => e.key === "Enter" && setAperto(t)}
                            className="group relative flex cursor-pointer items-start gap-1.5 rounded-lg border bg-card p-2.5 pr-9 text-left text-sm transition hover:border-primary/40 hover:bg-muted/30"
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
                            {/* ★ REDESIGN (2026-09-17, richiesta esplicita: "le
                            card Kanban... mostrino esclusivamente Nome/Titolo
                            in grassetto, un'etichetta di stato colorata molto
                            sottile e l'ultimo aggiornamento... sposta tutti gli
                            altri dettagli (indirizzi, ID lunghi, reparti
                            secondari) all'interno di un tooltip") — reparto
                            (già solo un pallino colorato) e indirizzo non
                            compaiono più come testo sulla card.
                            ★ FIX (2026-09-17, seguito diretto — screenshot:
                            "senza titoli non si capisce nulla") — la
                            sottocategoria (il vero motivo del Ticket: Disdetta,
                            Trasferimento, ecc.) era finita anche lei nel solo
                            tooltip: troppo, senza di lei una card a riposo
                            (senza segnale acceso) non diceva più nulla di cosa
                            fosse il Ticket. Torna visibile sotto il nome, come
                            prima del redesign — resta invece nel tooltip tutto
                            ciò che è davvero secondario (reparto, indirizzo).
                            ★ FIX (2026-09-17, richiesta esplicita: "sostituisci
                            l'attributo HTML nativo title... con il componente
                            tooltip Radix... in modo da avere un'anteprima
                            coerente, pulita") — l'attributo `title` nativo del
                            browser (nessuno stile, ritardo non configurabile,
                            invisibile su touch) sostituito dal componente
                            condiviso già in uso altrove nel gestionale. */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-baseline gap-1.5">
                                    {colore && <span aria-hidden className={`h-1.5 w-1.5 shrink-0 self-center rounded-full ${colore.fascia}`} />}
                                    <span className="min-w-0 flex-1 truncate font-semibold">{t.cliente}</span>
                                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">#{t.numero}</span>
                                  </div>
                                  {/* ★ FIX (2026-09-17, seguito diretto —
                                  "mancano ancora dei dettagli" / "ad alcuni
                                  non si vede ancora la descrizione") — prima
                                  la sottocategoria spariva dalla card quando
                                  coincideva con quella già scritta una volta
                                  sola nell'header del gruppo
                                  (`gruppo.sottocategoriaComune`): risultato,
                                  alcune card la mostravano e altre no, a
                                  seconda del gruppo in cui capitavano —
                                  incoerente e, scorrendo la colonna, sembrava
                                  proprio che mancasse. Ora sempre visibile
                                  quando c'è; se il Ticket non ha nemmeno una
                                  sottocategoria (Assistenza generica), il
                                  problema descritto dal cliente fa da
                                  descrizione di ripiego — meglio quello che
                                  restare senza alcun testo sotto il nome. */}
                                  {(t.sottocategoria || t.problema) && (
                                    <div className="truncate text-[11px] text-muted-foreground/80">{t.sottocategoria || t.problema}</div>
                                  )}
                              {/* ★ un'unica etichetta di stato (mai più due
                              impilate: prima il segnale operativo, se non
                              c'è la pianificazione dell'appuntamento — non
                              insieme) più l'ultimo aggiornamento, sempre
                              presente, sulla stessa riga. */}
                              <div className="mt-1 flex items-center gap-1.5 text-[10px]">
                                {segnale ? (
                                  segnale.pulsante ? (
                                    <SegnalePulsante testo={segnale.testo} tono="successo" pulsante />
                                  ) : (
                                    <span
                                      className={`inline-flex min-w-0 max-w-[65%] items-center rounded-full px-1.5 py-0.5 font-semibold ${
                                        segnale.tono === "critico"
                                          ? "bg-critical text-critical-foreground"
                                          : segnale.tono === "avviso"
                                            ? "bg-warning/10 text-warning"
                                            : "bg-muted text-muted-foreground"
                                      }`}
                                    >
                                      <span className="truncate">{segnale.testo}</span>
                                    </span>
                                  )
                                ) : (
                                  appuntamentoPerTicket.has(t.id) &&
                                  (() => {
                                    const app = appuntamentoPerTicket.get(t.id)!;
                                    const passato = new Date(app.data_ora) < new Date();
                                    return (
                                      <span
                                        className={`inline-flex min-w-0 max-w-[65%] items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold ${
                                          passato ? "bg-warning/10 text-warning" : "bg-muted text-muted-foreground"
                                        }`}
                                      >
                                        <IconaCategoria icona={CalendarClock} categoria="tempo" dimensione="sm" />
                                        <span className="truncate">
                                          {passato ? "Scaduto — " : "Pianificato — "}
                                          {new Date(app.data_ora).toLocaleString("it-IT", {
                                            day: "2-digit",
                                            month: "2-digit",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                          })}
                                        </span>
                                      </span>
                                    );
                                  })()
                                )}
                                <span className="shrink-0 text-muted-foreground/60">agg. {tempoRelativo(t.aggiornato_il)}</span>
                              </div>
                                </div>
                              </TooltipTrigger>
                              {(t.reparto || t.indirizzo) && (
                                <TooltipContent side="top" align="start">
                                  {[t.reparto, t.indirizzo].filter(Boolean).join(" · ")}
                                </TooltipContent>
                              )}
                            </Tooltip>

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
                                  disabled={ticketInCorso.has(t.id)}
                                  title="Prendi in carico"
                                  aria-label="Prendi in carico"
                                  className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed bg-card text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-60"
                                >
                                  {ticketInCorso.has(t.id) ? (
                                    <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />
                                  ) : (
                                    <UserPlus className="h-3 w-3" strokeWidth={2.5} />
                                  )}
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
                                    disabled={ticketInCorso.has(t.id)}
                                    aria-label="Riassegna tecnico"
                                    className="max-w-14 truncate border-none bg-transparent text-[10px] font-semibold outline-none disabled:opacity-60"
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
                                  disabled={ticketInCorso.has(t.id)}
                                  title="Avanza allo stato successivo"
                                  aria-label="Avanza allo stato successivo"
                                  className="flex h-6 w-6 items-center justify-center rounded-full border bg-card text-muted-foreground transition hover:border-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-60"
                                >
                                  {ticketInCorso.has(t.id) ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
                                  )}
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
      Ticket. Passato a Dialog centrale, poi a un Drawer laterale largo
      (vedi sotto), stessa larghezza e trattamento già usati per Segnalazioni.
      ★ REDESIGN (2026-09-17, richiesta esplicita: "l'apertura al centro
      dello schermo interrompe il flusso di lavoro... un Drawer laterale a
      scorrimento da destra... lasciando intravedere lo sfondo della
      Kanban") — da Dialog centrale a Drawer (components/ui/drawer.tsx):
      stessa idea del vecchio Sheet, ma largo abbastanza da restare leggibile
      con i dati reali di un Ticket (56% dello schermo, non stretto come lo
      Sheet originale). */}
      {/* ★ FIX — segnalato dall'utente: con la Scheda di lavoro aperta sopra
      (vedi Dialog subito sotto), questo pannello restava comunque "aperto"
      dietro — il suo velo finiva sopra anche la X di questo, spenta/non
      cliccabile finché non si chiudeva prima la Scheda. `!schedaAperta` lo
      tiene semplicemente nascosto (non chiuso: `aperto` resta valorizzato)
      finché la Scheda è sopra — ricompare da solo se la Scheda viene
      annullata, si chiude per davvero solo al salvataggio riuscito (vedi
      onSalvato più sotto, che azzera anche `aperto`). */}
      <Drawer open={!!aperto && !schedaAperta} onOpenChange={(v) => !v && setAperto(null)}>
        <DrawerContent>
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
        </DrawerContent>
      </Drawer>

      {/* ★ NUOVA — Dialog centrale per la Scheda di lavoro, separato dal
      dettaglio Ticket: "visuale centrale" richiesta esplicitamente,
      stesso trattamento di Vista Tecnico/Calendario. Chiude anche il
      dettaglio Ticket al salvataggio: lo stato appena passato a
      "Completato" renderebbe il pannello aperto subito disallineato. */}
      <Dialog open={!!schedaAperta} onOpenChange={(v) => !v && setSchedaAperta(null)}>
        <DialogContent className="sm:max-w-xl">
          {schedaAperta &&
            // ★ FIX (2026-09-18, audit modulo Ticket, debito tecnico) — i
            // due `onSalvato` erano codice duplicato quasi identico (stesso
            // toast, stesso reset di stato, stesso refresh): estratto qui
            // una volta sola invece di mantenerne due copie allineate a mano.
            (() => {
              const chiudiSchedaSalvata = () => {
                // ★ FIX (2026-09-16, bug reale segnalato: "quando si
                // chiudono i ticket non escono popup di conferma") — il
                // salvataggio riusciva e il popup si chiudeva, ma nessun
                // toast confermava che il Ticket fosse stato davvero
                // completato — stesso standard di successo già in uso
                // ovunque altro nel gestionale, mancante qui.
                toast(aperto ? `Ticket #${aperto.numero} completato.` : "Ticket completato.", "successo");
                setSchedaAperta(null);
                setAperto(null);
                router.refresh();
              };
              return schedaAperta.tipo_servizio === "Nuova installazione" ? (
                <SchedaInstallazioneForm
                  appuntamentoId={schedaAperta.id}
                  catalogoMateriali={catalogoMateriali}
                  onAnnulla={() => setSchedaAperta(null)}
                  onSalvato={chiudiSchedaSalvata}
                />
              ) : (
                <SchedaLavorazioneForm
                  appuntamentoId={schedaAperta.id}
                  catalogoMateriali={catalogoMateriali}
                  onAnnulla={() => setSchedaAperta(null)}
                  onSalvato={chiudiSchedaSalvata}
                />
              );
            })()}
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
  const { confirm: confirmElimina, ConfirmDialog: DialogConfermaElimina } = useConfirm();
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
  // punti dello scroll, ora tutti insieme in "Documenti".
  // ★ RIMOSSE LE TAB (2026-09-10, "la a" — proposta A dell'artifact "Il
  // Ticket, Senza Tab") — Dettagli/Documenti/Note sono ora sezioni sempre
  // visibili in un'unica pagina che scorre, non più viste separate da
  // scegliere: niente più stato `tab` da tenere.
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
  const [inCorsoCompletamentoSubentro, startCompletamentoSubentro] = useTransition();
  // ★ NUOVA (2026-09, "il contratto nuovo approvato solo da nuovo" — vedi
  // l'artifact "Il Subentro Fino all'Installazione") — carica/invia il
  // contratto della pratica di Subentro, stesso schema già in uso per
  // l'allegato dei campi extra di creaTicket() (presigned upload URL).
  const [inCorsoContrattoSubentro, startContrattoSubentro] = useTransition();
  const [inCorsoInvioContrattoSubentro, startInvioContrattoSubentro] = useTransition();
  // ★ NUOVA (2026-09-10, richiesta esplicita: "fatturazione... deve dare i
  // tempi per la dismissione e una volta fatto deve essere inoltrato al
  // reparto analisi di rete... per il ritiro degli apparati") — vedi
  // sezione "Disdetta" più sotto e fissaDataDismissioneDisdetta()
  // (tickets/actions.ts).
  const [dataDismissione, setDataDismissione] = useState("");
  const [inCorsoDismissione, startDismissione] = useTransition();
  const [erroreDismissione, setErroreDismissione] = useState("");
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

  // ★ FIX (2026-09-18, audit modulo Ticket) — contava anche le pratiche di
  // Subentro, ma la sezione "Moduli ricevuti dal cliente" qui sotto le
  // esclude apposta (hanno una sezione propria, "Subentro"): un Ticket con
  // solo una pratica Subentro avviata mostrava "Documenti (1)" seguito da
  // nessun contenuto in "Moduli ricevuti" — l'etichetta sembrava rotta.
  const numeroDocumenti =
    (ticket.contratto_pdf_url ? 1 : 0) +
    richieste.filter((r) => r.tipo_richiesta !== "Subentro").length +
    (ticket.stato === "Completato" && (scheda || rapportino) ? 1 : 0);

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
  // ★ FIX (2026-09, bug reale trovato con un test vero) — esclude la
  // bozza di contatto salvata onBlur (vedi CHIAVE_BOZZA_CONTATTO_SUBENTRO):
  // senza questo confine "il nuovo cliente ha risposto" risultava vero
  // appena l'operatore scriveva telefono/email, prima ancora che il nuovo
  // cliente aprisse il link.
  const nuovoClienteHaRisposto =
    !!praticaSubentro && Object.keys(praticaSubentro.dettagli || {}).filter((c) => c !== CHIAVE_BOZZA_CONTATTO_SUBENTRO).length > 0;

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

  // ★ NUOVA (2026-09, "è un macello, va riorganizzata e semplificata" —
  // passo 2 della proposta) — salva telefono/email del nuovo cliente
  // appena si esce dal campo, non solo al momento di inviare il link:
  // prima si perdevano ricaricando la pagina prima di premere "invia".
  function salvaContattoBozza() {
    if (!praticaSubentro) return;
    salvaContattoNuovoTitolareSubentro(praticaSubentro.id, telefonoNuovoCliente, emailNuovoCliente);
  }

  // ★ NUOVA — passo 5 della proposta: chiude la pratica con un pulsante
  // invece che spostando a mano la card tra le colonne di stato — il
  // server rifiuta se le due tracce non sono davvero complete.
  function completaSubentroClick() {
    if (!praticaSubentro) return;
    startCompletamentoSubentro(async () => {
      const risultato = await completaSubentro(praticaSubentro.id);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      setRichieste((prev) => prev.map((r) => (r.id === praticaSubentro.id ? { ...r, stato: "Lavorata" } : r)));
      toast("Subentro chiuso — trasferimento completato.", "successo");
    });
  }

  /** ★ NUOVA — vedi commento sullo stato sopra: presigned upload URL,
   * stesso schema già in uso per l'allegato dei campi extra di
   * creaTicket() — mai un File dentro il corpo di una Server Action. */
  function caricaContrattoSubentroClick(file: File | null) {
    if (!praticaSubentro || !file) return;
    if (file.type !== "application/pdf") {
      toast("Il contratto deve essere un file PDF.");
      return;
    }
    startContrattoSubentro(async () => {
      try {
        const rispostaUrl = await fetch("/api/richieste-clienti/upload-contratto-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ praticaId: praticaSubentro.id, nomeFile: file.name }),
        });
        const risultatoUrl = await rispostaUrl.json();
        if (!rispostaUrl.ok) throw new Error(risultatoUrl.errore || "Errore preparazione upload.");

        const supabase = createClient();
        const { error: erroreUpload } = await supabase.storage.from("documenti").uploadToSignedUrl(risultatoUrl.percorso, risultatoUrl.token, file);
        if (erroreUpload) throw new Error(erroreUpload.message);

        const risultato = await caricaContrattoSubentro(praticaSubentro.id, risultatoUrl.percorso, file.name);
        if (risultato.errore) throw new Error(risultato.errore);

        setRichieste((prev) =>
          prev.map((r) =>
            r.id === praticaSubentro.id
              ? { ...r, contratto_pdf_url: risultatoUrl.percorso, contratto_inviato_approvazione_il: null, contratto_approvato_nuovo_cliente_il: null }
              : r
          )
        );
        toast("Contratto caricato.", "successo");
      } catch (err) {
        toast(err instanceof Error ? err.message : "Errore imprevisto durante il caricamento.");
      }
    });
  }

  function inviaContrattoSubentroClick() {
    if (!praticaSubentro) return;
    startInvioContrattoSubentro(async () => {
      const risultato = await inviaEmailApprovazioneContrattoSubentro(praticaSubentro.id, ticket.id, window.location.origin);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      setRichieste((prev) =>
        prev.map((r) => (r.id === praticaSubentro.id ? { ...r, contratto_inviato_approvazione_il: new Date().toISOString() } : r))
      );
      toast("Contratto inviato per approvazione al nuovo cliente.", "successo");
    });
  }

  const messaggioPratica = praticaScelta ? messaggioWhatsappPratica(ticket.cliente, titoloPraticaScelta, linkPratica) : "";

  // ★ FIX (2026-09-18, audit modulo Ticket) — l'esito veniva mostrato due
  // volte con due meccanismi diversi (testo permanente sotto il pulsante +
  // toast), stesso messaggio duplicato — nessun'altra azione di questo
  // pannello lo fa: solo toast, come tutte le altre.
  function inviaApprovazione() {
    startApprovazione(async () => {
      const risultato = await inviaEmailApprovazioneTicket(ticket.id, window.location.origin);
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

  // ★ NUOVA (2026-09-10) — vedi la sezione "Disdetta" più sotto.
  function fissaDismissione() {
    if (!dataDismissione) {
      setErroreDismissione("Indica la data di dismissione.");
      return;
    }
    setErroreDismissione("");
    startDismissione(async () => {
      const risultato = await fissaDataDismissioneDisdetta(ticket.id, dataDismissione);
      if (risultato.errore) {
        setErroreDismissione(risultato.errore);
        toast(risultato.errore);
        return;
      }
      onCambiato({ ...ticket, reparto: "Analisi Rete", data_dismissione_disdetta: dataDismissione });
      toast("Dismissione fissata — passato ad Analisi Rete.", "successo");
      router.refresh();
    });
  }

  async function elimina() {
    if (
      !(await confirmElimina({
        titolo: "Eliminare il Ticket?",
        descrizione: `Eliminare definitivamente il Ticket #${ticket.numero} — ${ticket.cliente}? L'operazione non è reversibile.`,
        testoConferma: "Elimina",
        distruttivo: true,
      }))
    )
      return;
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

  return (
    <>
      <DialogConfermaElimina />
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
      {/* ★ FIX (2026-09-18, richiesta esplicita dopo uno screenshot:
      "dove vedi completato è attaccato alla riga") — l'intestazione sopra
      è sticky con un bordo in fondo (`border-b`), ma questo contenuto non
      aveva alcuno spazio proprio all'inizio: il primo elemento (qui lo
      stato del Ticket, es. "Completato — 4° di 4 passi") toccava subito
      il bordo invece di staccarsene come ogni altro spazio del pannello.
      `pt-4` pareggia il `pb-3` dell'intestazione qui sopra.
      ★ FIX (2026-09-18, seguito diretto — screenshot: "dove è scritto in
      lavorazione con i passaggi vorrei più spazio dalla riga sopra") —
      pt-4 non bastava ancora, alzato a pt-6. */}
      <div className="flex min-w-0 flex-col gap-5 pt-6 text-sm">
        {/* ★ RIMOSSE (2026-09-10, "la a" — proposta A dell'artifact "Il
        Ticket, Senza Tab", risposta a "troppi stati/tab da tenere a
        mente") — Dettagli/Documenti/Note erano 3 viste che nascondevano
        contenuto finché non ci si clicca sopra: bisognava ricordarsi che
        una Nota o un contratto esistevano prima di andare a cercarli. Ora
        è un'unica pagina che scorre, sempre nello stesso ordine — ogni
        sezione compare solo se ha davvero qualcosa da mostrare, MA senza
        più bisogno di un clic o di una tab da tenere a mente per saperlo.
        `numeroDocumenti` resta solo per l'etichetta della sezione. */}

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

        {/* ★ FIX (2026-09-18, seguito diretto — screenshot: "qui è il
        problema", tra "In lavorazione — 2° di 4 passi" e "Assegnato a")
        — gap-4 (16px) tra i blocchi di questa sezione (stato, assegnato/
        reparto, contatti, pianifica appuntamento...) restava comunque
        troppo stretto: alzato a gap-6, stesso principio già applicato
        allo spazio sotto l'intestazione qui sopra. */}
        <div className="flex flex-col gap-6">
        {/* ★ RIDISEGNATA (2026-09, "vecchia e confusionaria... troppi
        pulsanti e possibilità" — richiesta esplicita dopo l'artifact "Il
        Ticket Ripensato", trend 2026 "strategic minimalism"/"progressive
        disclosure") — 4 pulsanti sempre visibili (di cui 3 inutili la
        maggior parte delle volte, essendo lo stato corrente uno solo)
        diventano un unico controllo compatto, colorato come lo stato
        attuale (stessa mappa di StatusBadge, mai una seconda scelta di
        colori da mantenere allineata). */}
        {/* ★ RIDISEGNATA (2026-09-10, "si facciamo anche quello" —
        proposta B dell'artifact "Il Ticket, Senza Tab") — lo stato era
        una parola da riconoscere e ricollocare a memoria in un ordine di
        4 possibili; qui diventa un tracciato a segmenti, letto come
        POSIZIONE ("3° di 4 passi") invece che come nome da conoscere a
        memoria — stesso valore esatto di prima (SEQUENZA_STATO non
        cambia), stesso `cambiaStato()`, resta cliccabile un passo alla
        volta come i pulsanti originali (prima del redesign a <select>). */}
        <SezioneStatoTicket
          ticket={ticket}
          inCorsoStato={inCorsoStato}
          cambiaStato={cambiaStato}
          mostraRapportinoForm={mostraRapportinoForm}
          onAnnullaRapportino={() => setMostraRapportinoForm(false)}
          onRapportinoSalvato={() => {
            // ★ FIX (2026-09-16, bug reale segnalato: "quando si chiudono
            // i ticket non escono popup di conferma") — stesso bug del
            // gemello in TicketsBoard (Scheda di Installazione/
            // Lavorazione): il rapportino si salvava, il popup si
            // chiudeva, ma nessun toast confermava la chiusura.
            toast(`Ticket #${ticket.numero} completato.`, "successo");
            setMostraRapportinoForm(false);
            onCambiato({ ...ticket, stato: "Completato" });
            router.refresh();
          }}
          appuntamentoAttivo={appuntamentoAttivo}
          onApriScheda={onApriScheda}
        />

        {/* ★ RIORDINATA (2026-09, "ancora incasinato. riordinato" —
        seconda passata dopo screenshot del popup reale) — "chi se ne
        occupa" (assegnazione/reparto) prima di "come contattarlo"
        (telefono/email/indirizzo), a sua volta prima dell'azione
        (pianifica): dall'alto in basso, identità → responsabilità →
        contesto → azione, invece dell'ordine precedente che infilava
        l'azione tra i contatti senza un perché. Stessa griglia/stessa
        logica di prima, solo spostata. */}
        <SezioneAssegnazioneTicket
          ticket={ticket}
          persone={persone}
          tecniciEsterni={tecniciEsterni}
          currentPersonaId={currentPersonaId}
          assegnatario={assegnatario}
          assegnatarioEsterno={assegnatarioEsterno}
          inCorsoAssegna={inCorsoAssegna}
          inCorsoAssegnaEsterno={inCorsoAssegnaEsterno}
          onAssegnaValore={(v) => {
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
          onRimuoviAssegnazione={() =>
            startAssegna(async () => {
              const risultato = await assegnaTicket(ticket.id, null);
              if (risultato.errore) {
                toast(risultato.errore);
                return;
              }
              onCambiato({ ...ticket, tecnico_assegnato: null, tecnico_esterno_id: null });
            })
          }
          cambiaReparto={cambiaReparto}
          inCorsoReparto={inCorsoReparto}
          appuntamentoAttivo={appuntamentoAttivo}
          isAdmin={isAdmin}
          inCorsoElimina={inCorsoElimina}
          onElimina={elimina}
          dettagliExtra={
            ticket.sottocategoria && Object.keys(ticket.dettagli_extra || {}).length > 0 ? (
              <DettagliExtra sottocategoria={ticket.sottocategoria} dettagli={ticket.dettagli_extra} />
            ) : null
          }
          campiMancanti={ticket.sottocategoria ? <CampiMancanti sottocategoria={ticket.sottocategoria} dettagli={ticket.dettagli_extra} /> : null}
        />
        </div>

        <div className="h-px bg-border" />

        <SezioneDocumentiTicket
          ticket={ticket}
          numeroDocumenti={numeroDocumenti}
          scheda={scheda}
          rapportino={rapportino}
          isAdmin={isAdmin}
          onVediContratto={async () => {
            const risultato = await urlContratto(ticket.contratto_pdf_url!);
            if (risultato.errore || !risultato.url) {
              toast(risultato.errore || "Errore imprevisto.");
              return;
            }
            window.open(risultato.url, "_blank", "noopener,noreferrer");
          }}
          richieste={richieste}
          praticaSubentro={praticaSubentro}
          subentro={{
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
            ticketTelefono: ticket.telefono,
            linkNuovoClienteSubentro,
            telefonoNuovoCliente,
            setTelefonoNuovoCliente,
            emailNuovoCliente,
            setEmailNuovoCliente,
            nomeCliente: ticket.cliente,
            salvaContattoBozza,
            inCorsoCompletamentoSubentro,
            completaSubentroClick,
            inCorsoContrattoSubentro,
            caricaContrattoSubentroClick,
            inCorsoInvioContrattoSubentro,
            inviaContrattoSubentroClick,
            ticketCompletato: ticket.stato === "Completato",
          }}
          dataDismissione={dataDismissione}
          setDataDismissione={setDataDismissione}
          fissaDismissione={fissaDismissione}
          inCorsoDismissione={inCorsoDismissione}
          erroreDismissione={erroreDismissione}
          praticheInviabili={PRATICHE_INVIABILI}
          praticaPerSottocategoria={PRATICA_PER_SOTTOCATEGORIA}
          praticaScelta={praticaScelta}
          setPraticaScelta={setPraticaScelta}
          linkPratica={linkPratica}
          messaggioPratica={messaggioPratica}
          onInviaEmailPratica={() => inviaEmailPraticaCliente(ticket.id, praticaScelta, linkPratica)}
          inCorsoApprovazione={inCorsoApprovazione}
          inviaApprovazione={inviaApprovazione}
        />

        <div className="h-px bg-border" />

        <SezioneNoteTicket
          note={note}
          persone={persone}
          notaTesto={notaTesto}
          setNotaTesto={setNotaTesto}
          inviaNota={inviaNota}
          inCorsoNota={inCorsoNota}
          erroreNota={erroreNota}
        />
      </div>
    </>
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

  /* ★ FIX (2026-09-10, "correggi tutto" — punto 1 dell'artifact "Ordine
  Definitivo per i Ticket") — riquadro dentro riquadro: questo componente
  è usato SOLO dentro il disclosure "Altri dettagli", che disegna già la
  propria cornice quando è aperto (vedi tickets-board.tsx). Una seconda
  cornice identica attorno a questi campi era lo stesso identico bug già
  trovato e corretto nella sezione Subentro (lì era InvioLinkCliente
  dentro un altro riquadro). Restano solo testo ed etichette. */
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {sottocategoria}
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        {Object.entries(dettagli)
          .filter(([chiave]) => chiave !== "_allegato" && chiave !== "_allegatoNome")
          .map(([chiave, valore]) => {
            const label = config?.campi.find((c) => c.id === chiave)?.label ?? chiave;
            // ★ FIX (2026-09-18, audit modulo Ticket, debito tecnico) —
            // `dettagli` è tipizzato `Record<string, string>` solo lato
            // TypeScript: arriva da `dettagli_extra`, una colonna jsonb
            // libera, senza validazione a runtime. Stessa identica classe
            // di crash ("Objects are not valid as a React child") già
            // trovata e corretta per `richieste.dettagli` del Subentro —
            // qui mancava la stessa guardia.
            if (typeof valore !== "string" && typeof valore !== "number") return null;
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
  primario = false,
}: {
  ticket: Ticket;
  persone: Persona[];
  tipoServizioIniziale?: TipoServizioAppuntamento;
  apertaSubito?: boolean;
  tecnicoIniziale?: string;
  /** ★ NUOVA (2026-09, redesign del popup Ticket) — pulsante pieno/in
   * evidenza invece del solito outline compatto, per il caso (Ticket
   * senza appuntamento attivo) in cui pianificare è l'azione più probabile
   * da compiere adesso. Solo l'aspetto del pulsante di apertura cambia —
   * il form e `creaAppuntamento()` restano identici — così l'altro punto
   * da cui parte questo componente (vista-tecnico-board.tsx) non è
   * toccato lasciando il default a `false`. */
  primario?: boolean;
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

  // ★ NUOVA (2026-09-16, bug reale segnalato: "quale antenna mettere") —
  // stesso gemello dei form in calendario-board.tsx, vedi
  // getAntenneRiservatePerTicket().
  const [antenneRiservate, setAntenneRiservate] = useState<{ tipologia: string; mac: string }[]>([]);
  useEffect(() => {
    if (aperto) getAntenneRiservatePerTicket(ticket.id).then(setAntenneRiservate);
  }, [aperto, ticket.id]);

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
      <Button
        size={primario ? "default" : "sm"}
        variant={primario ? "default" : "outline"}
        className={primario ? "w-full" : "w-fit"}
        onClick={() => setAperto(true)}
      >
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

      {antenneRiservate.length > 0 && (
        <p className="mb-3 text-xs font-semibold text-primary">
          📡 Antenna riservata: {antenneRiservate.map((a) => `${a.tipologia} (${a.mac})`).join(", ")}
        </p>
      )}

      {/* ★ FIX (2026-09-10, "diversi tipi di forme e non uniformità" —
      screenshot del popup reale) — questi campi erano rounded-md, un
      raggio diverso da tutti i controlli del resto del popup (rounded-lg,
      stesso di Assegnato a/Reparto/Button) — stesso valore in tutto il
      form, nessun campo dimenticato al vecchio raggio. */}
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <select
          name="tipo_servizio"
          value={tipoServizio}
          onChange={(e) => setTipoServizio(e.target.value as TipoServizioAppuntamento)}
          className="h-8 rounded-lg border bg-background px-2 text-xs"
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
            className="h-8 rounded-lg border bg-background px-2 text-xs"
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
          className="h-8 rounded-lg border bg-background px-2 text-xs"
        />
        <div className="grid grid-cols-3 gap-2">
          <input type="date" name="data" required className="h-8 rounded-lg border bg-background px-2 text-xs" />
          <input type="time" name="ora" required className="h-8 rounded-lg border bg-background px-2 text-xs" />
          <select name="durata" defaultValue="60" className="h-8 rounded-lg border bg-background px-2 text-xs">
            <option value="30">30 min</option>
            <option value="60">1 ora</option>
            <option value="90">1h30</option>
            <option value="120">2 ore</option>
          </select>
        </div>
        <select name="tecnico" defaultValue={tecnicoIniziale ?? ticket.tecnico_assegnato ?? ""} className="h-8 rounded-lg border bg-background px-2 text-xs">
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
