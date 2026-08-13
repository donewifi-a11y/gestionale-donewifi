"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Ticket, PhoneCall, Loader2, UserRound } from "lucide-react";
import { ricercaGlobale, type RisultatoRicerca } from "@/app/(app)/ricerca/actions";

export function RicercaGlobale() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [risultati, setRisultati] = useState<RisultatoRicerca[]>([]);
  const [aperta, setAperta] = useState(false);
  const [caricamento, setCaricamento] = useState(false);
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

  function onChange(valore: string) {
    setQuery(valore);
    setAperta(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (valore.trim().length < 2) {
      setRisultati([]);
      return;
    }
    setCaricamento(true);
    timeoutRef.current = setTimeout(async () => {
      const r = await ricercaGlobale(valore);
      setRisultati(r);
      setCaricamento(false);
    }, 300);
  }

  function vai(r: RisultatoRicerca) {
    setAperta(false);
    setQuery("");
    setRisultati([]);
    if (r.tipo === "ticket") router.push(`/tickets?aperto=${r.id}`);
    else if (r.tipo === "segnalazione") router.push(`/segnalazioni?aperto=${r.id}`);
    else router.push(`/clienti-esterni/${r.id}`);
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
          placeholder="Cerca ticket, segnalazione o cliente..."
          className="h-9 w-full rounded-lg border border-sidebar-border bg-sidebar-accent/40 pl-8 pr-9 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus:outline-none focus:ring-1 focus:ring-sidebar-primary"
        />
        {!query && (
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-sidebar-border bg-sidebar-accent/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sidebar-foreground/50">
            ⌘K
          </kbd>
        )}
      </div>

      {aperta && query.trim().length >= 2 && (
        <div className="absolute left-3 right-3 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-xl">
          {caricamento && (
            <div className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
              Ricerca...
            </div>
          )}
          {!caricamento && risultati.length === 0 && (
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
        </div>
      )}
    </div>
  );
}
