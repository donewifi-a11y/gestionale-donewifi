"use client";

import { NotebookText, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { iniziali } from "@/components/tickets/tickets-board";
import type { NotaTicket, Persona } from "@/lib/types";

/**
 * ★ ESTRATTA (2026-09-18, split del monolite DettaglioTicket — ~1175
 * righe in tickets-board.tsx) — nessuna modifica di logica: componente
 * puramente presentazionale, stato/handler restano in DettaglioTicket e
 * arrivano qui come props, stesso pattern di SubentroDoppioConsenso.
 */
export function SezioneNoteTicket({
  note,
  persone,
  notaTesto,
  setNotaTesto,
  inviaNota,
  inCorsoNota,
  erroreNota,
}: {
  note: NotaTicket[];
  persone: Persona[];
  notaTesto: string;
  setNotaTesto: (v: string) => void;
  inviaNota: () => void;
  inCorsoNota: boolean;
  erroreNota: string;
}) {
  function trovaPersona(id: string | null) {
    return id ? persone.find((p) => p.id === id) ?? null : null;
  }

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <NotebookText className="h-3.5 w-3.5" strokeWidth={2.25} />
        Note e aggiornamenti{note.length > 0 ? ` (${note.length})` : ""}
      </div>
      <div className="flex flex-col gap-2.5">
        {note.length === 0 && <p className="text-xs text-muted-foreground">Nessun aggiornamento ancora.</p>}
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
          className="h-9 flex-1 rounded-lg border bg-background px-3 text-xs"
        />
        <Button size="icon" className="h-11 w-11 shrink-0" disabled={inCorsoNota || !notaTesto.trim()} onClick={inviaNota} title="Invia nota" aria-label="Invia nota">
          {inCorsoNota ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Send className="h-3.5 w-3.5" strokeWidth={2.5} />}
        </Button>
      </div>
      {erroreNota && <p className="mt-1.5 text-xs text-critical">{erroreNota}</p>}
    </div>
  );
}
