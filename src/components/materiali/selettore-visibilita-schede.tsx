"use client";

import { useMemo, useState } from "react";
import { Search, Plus, X } from "lucide-react";
import { impostaVisibilitaSchedaMateriale } from "@/app/(app)/materiali/actions";
import { useToast } from "@/components/ui/toast";
import { SuggerimentoCampo } from "@/components/ui/suggerimento-campo";
import type { MaterialeMagazzino } from "@/lib/types";

/** ★ NUOVA — richiesta esplicita: "quali materiali mostrare nella Scheda
 * di lavoro" come schermo dedicato a due colonne (catalogo / selezionati)
 * invece di una colonna in più nella tabella generale — più leggibile per
 * capire subito "cosa c'è dentro" senza contare interruttori accesi in
 * una lista lunga. Aggiornamento ottimistico: il materiale si sposta di
 * colonna subito al click, la chiamata server avviene sotto — in caso di
 * errore torna al proprio posto e lo segnala. */
export function SelettoreVisibilitaSchede({ materiali }: { materiali: MaterialeMagazzino[] }) {
  const toast = useToast();
  const attivi = useMemo(() => materiali.filter((m) => m.attivo), [materiali]);
  const [inScheda, setInScheda] = useState<Set<string>>(
    () => new Set(attivi.filter((m) => m.mostra_in_schede_lavoro).map((m) => m.id))
  );
  const [inCorso, setInCorso] = useState<Set<string>>(new Set());
  const [ricercaCatalogo, setRicercaCatalogo] = useState("");
  const [ricercaSelezionati, setRicercaSelezionati] = useState("");

  const catalogo = useMemo(
    () =>
      attivi
        .filter((m) => !inScheda.has(m.id))
        .filter((m) => !ricercaCatalogo.trim() || m.nome.toLowerCase().includes(ricercaCatalogo.trim().toLowerCase()))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [attivi, inScheda, ricercaCatalogo]
  );
  const selezionati = useMemo(
    () =>
      attivi
        .filter((m) => inScheda.has(m.id))
        .filter((m) => !ricercaSelezionati.trim() || m.nome.toLowerCase().includes(ricercaSelezionati.trim().toLowerCase()))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [attivi, inScheda, ricercaSelezionati]
  );

  async function cambia(id: string, visibile: boolean) {
    setInScheda((cur) => {
      const nuovo = new Set(cur);
      if (visibile) nuovo.add(id);
      else nuovo.delete(id);
      return nuovo;
    });
    setInCorso((cur) => new Set(cur).add(id));
    const risultato = await impostaVisibilitaSchedaMateriale(id, visibile);
    setInCorso((cur) => {
      const nuovo = new Set(cur);
      nuovo.delete(id);
      return nuovo;
    });
    if (risultato.errore) {
      // ★ ripristina la colonna di partenza se il salvataggio è fallito —
      // l'utente vede lo spostamento tornare indietro invece di restare
      // con uno stato solo visivo mai davvero salvato.
      setInScheda((cur) => {
        const nuovo = new Set(cur);
        if (visibile) nuovo.delete(id);
        else nuovo.add(id);
        return nuovo;
      });
      toast(risultato.errore);
    }
  }

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Solo i materiali qui a destra compaiono nel selettore delle Schede di Installazione e Lavorazione Tecnica sul
        campo — il catalogo completo resta comunque disponibile per Preventivi e listino.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="border-b bg-muted/40 p-2.5">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Catalogo</span>
              <span className="text-[11px] font-semibold text-muted-foreground">{catalogo.length}</span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
              <input
                value={ricercaCatalogo}
                onChange={(e) => setRicercaCatalogo(e.target.value)}
                placeholder="Cerca..."
                className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-xs"
              />
            </div>
          </div>
          <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto p-2">
            {catalogo.length === 0 && <p className="p-3 text-center text-xs text-muted-foreground">Nessun materiale.</p>}
            {catalogo.map((m) => (
              <button
                key={m.id}
                onClick={() => cambia(m.id, true)}
                disabled={inCorso.has(m.id)}
                className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-2.5 py-2 text-left text-xs transition hover:bg-muted disabled:opacity-50"
              >
                <span className="min-w-0 truncate font-medium">{m.nome}</span>
                <Plus className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.5} />
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-primary/30 bg-card shadow-sm">
          <div className="border-b bg-primary/5 p-2.5">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-primary">
                In Scheda di lavoro
                <SuggerimentoCampo testo="Il tecnico vede sul campo solo questi materiali nel selettore delle Schede — il catalogo completo resta comunque usabile per Preventivi e listino." />
              </span>
              <span className="text-[11px] font-semibold text-primary">{selezionati.length}</span>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
              <input
                value={ricercaSelezionati}
                onChange={(e) => setRicercaSelezionati(e.target.value)}
                placeholder="Cerca..."
                className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-xs"
              />
            </div>
          </div>
          <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto p-2">
            {selezionati.length === 0 && <p className="p-3 text-center text-xs text-muted-foreground">Nessuno — aggiungine dal catalogo a sinistra.</p>}
            {selezionati.map((m) => (
              <button
                key={m.id}
                onClick={() => cambia(m.id, false)}
                disabled={inCorso.has(m.id)}
                className="flex items-center justify-between gap-2 rounded-lg bg-success/10 px-2.5 py-2 text-left text-xs transition hover:bg-success/15 disabled:opacity-50"
              >
                <span className="min-w-0 truncate font-medium">{m.nome}</span>
                <X className="h-3.5 w-3.5 shrink-0 text-critical" strokeWidth={2.5} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
