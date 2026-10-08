"use client";

import { NotebookText, Send, Loader2, FilePlus2, ArrowRightLeft, UserRound, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { iniziali } from "@/components/tickets/tickets-board";
import type { NotaTicket, Persona, Ticket } from "@/lib/types";
import type { VoceStoricoTicket } from "@/app/(app)/tickets/actions";

/**
 * ★ ESTRATTA (2026-09-18, split del monolite DettaglioTicket — ~1175
 * righe in tickets-board.tsx) — nessuna modifica di logica: componente
 * puramente presentazionale, stato/handler restano in DettaglioTicket e
 * arrivano qui come props, stesso pattern di SubentroDoppioConsenso.
 *
 * ★ ESTESA (2026-10-08, richiesta esplicita: "vorrei che le modifiche al
 * ticket, gli aggiornamenti fossero visibili come il messaggio di apertura
 * del ticket") — prima questa sezione mostrava solo le Note scritte a
 * mano: ogni cambio stato/reparto/assegnazione veniva scritto in `storico`
 * (vedi tickets/actions.ts) ma non compariva mai da nessuna parte, come se
 * non fosse mai successo. Qui si unisce tutto in un'unica cronologia,
 * ordinata per data: il messaggio di apertura (il `problema` scritto dal
 * cliente/operatore alla creazione), ogni voce di `storico`, e le Note —
 * esattamente come l'utente ha chiesto: "visibili come il messaggio di
 * apertura del ticket", cioè nello stesso flusso, non un'altra lista a
 * parte da controllare separatamente.
 */

type VoceAttivita =
  | { tipo: "apertura"; data: string }
  | { tipo: "storico"; data: string; voce: VoceStoricoTicket }
  | { tipo: "nota"; data: string; nota: NotaTicket };

function descrizioneStorico(v: VoceStoricoTicket, persone: Persona[], tecniciEsterni: { id: string; nome: string; cognome: string | null }[]): string {
  function nomePersona(id: string | null): string {
    if (!id) return "—";
    return persone.find((p) => p.id === id)?.nome ?? "una persona non più attiva";
  }
  function nomeEsterno(id: string | null): string {
    if (!id) return "—";
    const t = tecniciEsterni.find((te) => te.id === id);
    return t ? `${t.nome} ${t.cognome ?? ""}`.trim() : "un tecnico esterno";
  }
  switch (v.operazione) {
    case "Cambio Stato":
      return `Stato cambiato: ${v.valore_prima} → ${v.valore_dopo}`;
    case "Cambio Reparto":
      return `Reparto cambiato: ${v.valore_prima} → ${v.valore_dopo}`;
    case "Assegnazione Tecnico":
      return v.valore_dopo ? `Assegnato a ${nomePersona(v.valore_dopo)}` : "Assegnazione rimossa";
    case "Assegnazione Tecnico Esterno":
      return v.valore_dopo ? `Assegnato a ${nomeEsterno(v.valore_dopo)} (tecnico esterno)` : "Assegnazione rimossa";
    default:
      return [v.valore_prima, v.valore_dopo].filter(Boolean).join(" → ") || v.operazione;
  }
}

function IconaStorico({ operazione }: { operazione: string }) {
  const classe = "h-3 w-3 shrink-0";
  if (operazione === "Cambio Reparto") return <ArrowRightLeft className={classe} strokeWidth={2.5} />;
  if (operazione.startsWith("Assegnazione")) return <UserRound className={classe} strokeWidth={2.5} />;
  return <RefreshCw className={classe} strokeWidth={2.5} />;
}

export function SezioneNoteTicket({
  ticket,
  note,
  storico,
  persone,
  tecniciEsterni,
  notaTesto,
  setNotaTesto,
  inviaNota,
  inCorsoNota,
  erroreNota,
}: {
  ticket: Ticket;
  note: NotaTicket[];
  storico: VoceStoricoTicket[];
  persone: Persona[];
  tecniciEsterni: { id: string; nome: string; cognome: string | null }[];
  notaTesto: string;
  setNotaTesto: (v: string) => void;
  inviaNota: () => void;
  inCorsoNota: boolean;
  erroreNota: string;
}) {
  function trovaPersona(id: string | null) {
    return id ? persone.find((p) => p.id === id) ?? null : null;
  }

  // ★ "Cambio Stato" con valore_prima null/assente e "Creazione Ticket" sono
  // la nascita del Ticket stesso — già coperta dalla voce "apertura"
  // sintetica qui sotto, mostrarla due volte sarebbe ridondante.
  const voci: VoceAttivita[] = [
    { tipo: "apertura", data: ticket.data_creazione } as VoceAttivita,
    ...storico.filter((v) => v.operazione !== "Creazione Ticket").map((v): VoceAttivita => ({ tipo: "storico", data: v.data, voce: v })),
    ...note.map((n): VoceAttivita => ({ tipo: "nota", data: n.creato_il, nota: n })),
  ].sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <NotebookText className="h-3.5 w-3.5" strokeWidth={2.25} />
        Attività{note.length > 0 ? ` · ${note.length} nota${note.length > 1 ? "e" : ""}` : ""}
      </div>
      <div className="flex flex-col gap-2.5">
        {voci.map((v) => {
          if (v.tipo === "apertura") {
            return (
              <div key="apertura" className="flex gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <FilePlus2 className="h-3 w-3" strokeWidth={2.5} />
                </span>
                <div className="flex-1 rounded-lg bg-primary/5 px-3 py-2">
                  <div className="mb-0.5 text-[10.5px] font-bold text-muted-foreground">
                    Ticket aperto · {new Date(v.data).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="text-xs leading-relaxed">{ticket.problema || "Nessuna descrizione iniziale."}</div>
                </div>
              </div>
            );
          }
          if (v.tipo === "storico") {
            return (
              <div key={`s-${v.voce.id}`} className="flex items-center gap-2.5 pl-1 text-[11.5px] text-muted-foreground">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <IconaStorico operazione={v.voce.operazione} />
                </span>
                <span className="flex-1">
                  {descrizioneStorico(v.voce, persone, tecniciEsterni)}
                  <span className="text-muted-foreground/70"> — {trovaPersona(v.voce.operatore_id)?.nome || "sistema"}</span>
                </span>
                <span className="shrink-0 text-[10.5px] text-muted-foreground/60">
                  {new Date(v.data).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            );
          }
          const autore = trovaPersona(v.nota.autore_id);
          return (
            <div key={v.nota.id} className="flex gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                {autore ? iniziali(autore) : "?"}
              </span>
              <div className="flex-1 rounded-lg bg-muted/60 px-3 py-2">
                <div className="mb-0.5 text-[10.5px] font-bold text-muted-foreground">
                  {autore?.nome || "Persona"} ·{" "}
                  {new Date(v.nota.creato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="text-xs leading-relaxed">{v.nota.testo}</div>
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
