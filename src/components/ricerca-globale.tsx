"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Ticket, PhoneCall, Loader2, UserRound, Plus, CalendarClock, Wrench, Boxes, ClipboardList, Archive, Gauge, FileStack } from "lucide-react";
import { ricercaGlobale, type RisultatoRicerca } from "@/app/(app)/ricerca/actions";

/**
 * ★ NUOVA (2026-09-04, richiesta esplicita: "studia le ultime tendenze...
 * ui/ux" — artifact "Proposte UX 2026", proposta ①, "farei tutto") — la
 * stessa tendina di Ctrl/⌘K, finora solo ricerca, mostra ora anche
 * "azioni" (creare/andare a) — il pattern da command palette di Linear
 * ("ogni azione del prodotto raggiungibile da ⌘K"), ridotto alle azioni
 * che qui hanno davvero senso: le pagine "Nuovo..." già esistenti e i
 * mondi principali del gestionale, non un catalogo di ogni singolo
 * pulsante. `parole` sono sinonimi extra su cui far corrispondere la
 * ricerca (es. "tick" per Ticket) oltre all'etichetta stessa.
 */
interface AzioneRapida {
  id: string;
  etichetta: string;
  icona: typeof Plus;
  href: string;
  parole?: string[];
}

const AZIONI_RAPIDE: AzioneRapida[] = [
  { id: "nuovo-ticket", etichetta: "Nuovo Ticket", icona: Plus, href: "/tickets/nuovo", parole: ["crea", "aggiungi"] },
  { id: "nuova-segnalazione", etichetta: "Nuova Segnalazione", icona: Plus, href: "/segnalazioni/nuovo", parole: ["crea", "aggiungi"] },
  { id: "nuovo-preventivo", etichetta: "Nuovo Preventivo", icona: Plus, href: "/preventivi/nuovo", parole: ["crea", "aggiungi"] },
  { id: "vai-calendario", etichetta: "Vai a Calendario", icona: CalendarClock, href: "/calendario", parole: ["appuntamento", "appuntamenti"] },
  { id: "vai-tickets", etichetta: "Vai a Ticket", icona: Ticket, href: "/tickets" },
  { id: "vai-vista-tecnico", etichetta: "Vai a Vista Tecnico", icona: Wrench, href: "/vista-tecnico" },
  { id: "vai-materiali", etichetta: "Vai a Materiali", icona: Boxes, href: "/materiali" },
  { id: "vai-gestione-cliente", etichetta: "Vai a Gestione Cliente", icona: ClipboardList, href: "/richieste-clienti" },
  { id: "vai-archivio", etichetta: "Vai a Archivio", icona: Archive, href: "/archivio" },
  { id: "vai-dashboard", etichetta: "Vai a Dashboard", icona: Gauge, href: "/dashboard" },
  { id: "vai-tariffe", etichetta: "Vai a Tariffe", icona: FileStack, href: "/tariffe" },
];

export function RicercaGlobale() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [risultati, setRisultati] = useState<RisultatoRicerca[]>([]);
  const [aperta, setAperta] = useState(false);
  const [caricamento, setCaricamento] = useState(false);
  // ★ NUOVA (2026-08) — richiesta esplicita: poter restringere la ricerca
  // iniziale a "solo e soltanto le schede clienti", invece del solito
  // mix Ticket/Segnalazioni/Clienti. Non persistito (localStorage) di
  // proposito: un filtro contestuale del genere, se restasse attivo da una
  // sessione all'altra, sorprenderebbe chi lo riapre aspettandosi la
  // ricerca su tutto come al solito.
  const [soloClienti, setSoloClienti] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contenitoreRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onClickFuori(e: MouseEvent) {
      if (contenitoreRef.current && !contenitoreRef.current.contains(e.target as Node)) setAperta(false);
    }
    document.addEventListener("mousedown", onClickFuori);
    return () => document.removeEventListener("mousedown", onClickFuori);
  }, []);

  // ★ NUOVA — richiesta esplicita: la ricerca globale esisteva già e
  // funzionava, ma andava trovata col mouse ogni volta — nessuna
  // scorciatoia da tastiera come in qualunque strumento "smart"
  // (Linear/Notion/GitHub usano tutti ⌘K/Ctrl K). Un solo listener
  // globale: porta il focus sull'input esistente, senza aprire un
  // pannello/modale separato da mantenere in più.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setAperta(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function eseguiRicerca(valore: string, ambitoSoloClienti: boolean) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (valore.trim().length < 2) {
      setRisultati([]);
      return;
    }
    setCaricamento(true);
    timeoutRef.current = setTimeout(async () => {
      const r = await ricercaGlobale(valore, ambitoSoloClienti ? "clienti" : "tutti");
      setRisultati(r);
      setCaricamento(false);
    }, 300);
  }

  function onChange(valore: string) {
    setQuery(valore);
    setAperta(true);
    eseguiRicerca(valore, soloClienti);
  }

  // ★ cambiare il filtro mentre c'è già del testo digitato deve rilanciare
  // subito la ricerca con l'ambito nuovo, non aspettare il prossimo tasto.
  function cambiaAmbito(nuovo: boolean) {
    setSoloClienti(nuovo);
    if (query.trim().length >= 2) eseguiRicerca(query, nuovo);
  }

  function vai(r: RisultatoRicerca) {
    setAperta(false);
    setQuery("");
    setRisultati([]);
    if (r.tipo === "ticket") router.push(`/tickets?aperto=${r.id}`);
    else if (r.tipo === "segnalazione") router.push(`/segnalazioni?aperto=${r.id}`);
    else router.push(`/clienti-esterni/${r.id}`);
  }

  // ★ le azioni si filtrano da sole (nessuna chiamata server, sono una
  // lista fissa) — a differenza dei risultati di ricerca vera e propria,
  // compaiono anche con query vuota (appena aperta con ⌘K) o di un solo
  // carattere, non serve aspettare 2 caratteri come per interrogare il
  // database.
  const testoRicerca = query.trim().toLowerCase();
  const azioniFiltrate = useMemo(
    () =>
      AZIONI_RAPIDE.filter(
        (a) => !testoRicerca || a.etichetta.toLowerCase().includes(testoRicerca) || a.parole?.some((p) => p.includes(testoRicerca))
      ),
    [testoRicerca]
  );

  function vaiAzione(a: AzioneRapida) {
    setAperta(false);
    setQuery("");
    setRisultati([]);
    router.push(a.href);
  }

  // ★ Invio conferma la prima voce mostrata (prima le azioni, poi i
  // risultati di ricerca) — stesso principio "prima riga = predefinita"
  // di qualunque command palette, senza dover implementare la selezione
  // con le frecce per un guadagno marginale.
  function onKeyDownInput(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    if (azioniFiltrate.length > 0) {
      e.preventDefault();
      vaiAzione(azioniFiltrate[0]);
    } else if (risultati.length > 0) {
      e.preventDefault();
      vai(risultati[0]);
    }
  }

  return (
    <div ref={contenitoreRef} className="relative px-3 pb-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-foreground/40" strokeWidth={2.5} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setAperta(true)}
          onKeyDown={onKeyDownInput}
          placeholder={soloClienti ? "Cerca una scheda cliente..." : "Cerca o vai a..."}
          className="h-9 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/40 pl-8 pr-9 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus:outline-none focus:ring-1 focus:ring-sidebar-primary"
        />
        {!query && (
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-sidebar-border bg-sidebar-accent/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sidebar-foreground/50">
            ⌘K
          </kbd>
        )}
      </div>

      {/* ★ NUOVA (2026-08) — richiesta esplicita: restringe la ricerca a
      "solo e soltanto le schede clienti" invece del mix Ticket/
      Segnalazioni/Clienti — due pillole invece di una spunta, coerente con
      lo stesso pattern "vista" già usato altrove nel gestionale
      (Materiali, Persone/Utenti, Clienti/Installazioni). */}
      <div className="mt-1.5 flex gap-1">
        <button
          type="button"
          onClick={() => cambiaAmbito(false)}
          className={`flex-1 rounded-md py-1 text-[10.5px] font-semibold transition ${
            !soloClienti ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
          }`}
        >
          Tutto
        </button>
        <button
          type="button"
          onClick={() => cambiaAmbito(true)}
          className={`flex-1 rounded-md py-1 text-[10.5px] font-semibold transition ${
            soloClienti ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
          }`}
        >
          Solo clienti
        </button>
      </div>

      {/* ★ ESTESA (2026-09-04) — prima si apriva solo da 2 caratteri in su
      (serve comunque per lanciare la ricerca vera, che interroga il
      database): ora si apre anche subito con ⌘K a campo vuoto, se
      soloClienti è spento, per mostrare le azioni rapide — altrimenti chi
      preme ⌘K e aspetta di vedere qualcosa trova solo un campo vuoto. */}
      {aperta && (query.trim().length >= 2 || (!soloClienti && azioniFiltrate.length > 0)) && (
        <div className="absolute left-3 right-3 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-xl">
          {!soloClienti && azioniFiltrate.length > 0 && (
            <div className="border-b py-1">
              <p className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Azioni</p>
              {azioniFiltrate.map((a) => (
                <button
                  key={a.id}
                  onClick={() => vaiAzione(a)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-semibold transition hover:bg-muted"
                >
                  <a.icona className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.25} />
                  {a.etichetta}
                </button>
              ))}
            </div>
          )}
          {query.trim().length >= 2 && (
            <>
              {caricamento && (
                <div className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
                  Ricerca...
                </div>
              )}
              {!caricamento && risultati.length === 0 && azioniFiltrate.length === 0 && (
                <p className="p-3 text-center text-xs text-muted-foreground">Nessun risultato.</p>
              )}
              {!caricamento &&
                risultati.map((r) => (
                  <button
                    key={`${r.tipo}-${r.id}`}
                    onClick={() => vai(r)}
                    className="flex w-full items-center gap-2.5 border-t px-3 py-2.5 text-left text-xs transition first:border-t-0 hover:bg-muted"
                  >
                    {r.tipo === "ticket" && <Ticket className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.25} />}
                    {r.tipo === "segnalazione" && <PhoneCall className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.25} />}
                    {r.tipo === "cliente" && <UserRound className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.25} />}
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{r.titolo}</div>
                      <div className="truncate text-[10.5px] text-muted-foreground">{r.sottotitolo}</div>
                    </div>
                  </button>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
