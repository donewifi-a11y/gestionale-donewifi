"use client";

import { Loader2, FileText, CalendarCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { IconaCategoria } from "@/components/condivisi/icona-categoria";
import { RapportinoForm } from "@/components/tickets/rapportino";
import { SEQUENZA_STATO } from "@/components/tickets/tickets-board";
import type { Appuntamento, StatoTicket, Ticket } from "@/lib/types";

const COLORE_STATO_SEGMENTO: Record<StatoTicket, { seg: string; testo: string }> = {
  "Da gestire": { seg: "bg-muted-foreground/50", testo: "text-muted-foreground" },
  "In lavorazione": { seg: "bg-primary", testo: "text-primary" },
  "In attesa": { seg: "bg-warning", testo: "text-warning" },
  Completato: { seg: "bg-success", testo: "text-success" },
  Annullato: { seg: "bg-muted-foreground/50", testo: "text-muted-foreground" },
};

/**
 * ★ ESTRATTA (2026-09-18, split del monolite DettaglioTicket — ~1175
 * righe in tickets-board.tsx) — nessuna modifica di logica: componente
 * puramente presentazionale, stato/handler restano in DettaglioTicket e
 * arrivano qui come props, esattamente come SubentroDoppioConsenso.
 *
 * ★ RIDISEGNATA (2026-09, "vecchia e confusionaria... troppi pulsanti e
 * possibilità" — richiesta esplicita dopo l'artifact "Il Ticket
 * Ripensato", trend 2026 "strategic minimalism"/"progressive disclosure")
 * — 4 pulsanti sempre visibili (di cui 3 inutili la maggior parte delle
 * volte, essendo lo stato corrente uno solo) diventano un unico controllo
 * compatto, colorato come lo stato attuale (stessa mappa di StatusBadge,
 * mai una seconda scelta di colori da mantenere allineata).
 * ★ RIDISEGNATA (2026-09-10, "si facciamo anche quello" — proposta B
 * dell'artifact "Il Ticket, Senza Tab") — lo stato era una parola da
 * riconoscere e ricollocare a memoria in un ordine di 4 possibili; qui
 * diventa un tracciato a segmenti, letto come POSIZIONE ("3° di 4
 * passi") invece che come nome da conoscere a memoria.
 */
export function SezioneStatoTicket({
  ticket,
  inCorsoStato,
  cambiaStato,
  mostraRapportinoForm,
  onAnnullaRapportino,
  onRapportinoSalvato,
  appuntamentoAttivo,
  onApriScheda,
}: {
  ticket: Ticket;
  inCorsoStato: boolean;
  cambiaStato: (nuovo: StatoTicket) => void;
  mostraRapportinoForm: boolean;
  onAnnullaRapportino: () => void;
  onRapportinoSalvato: () => void;
  appuntamentoAttivo: Appuntamento | null;
  onApriScheda: (a: Appuntamento) => void;
}) {
  return (
    <>
      {ticket.stato === "Annullato" ? (
        <StatusBadge status="Annullato" className="w-fit" />
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5" role="group" aria-label="Stato del Ticket">
              {SEQUENZA_STATO.map((s, i) => {
                const idxStato = SEQUENZA_STATO.indexOf(ticket.stato);
                return (
                  <button
                    key={s}
                    type="button"
                    title={s}
                    aria-label={s}
                    aria-current={s === ticket.stato ? "step" : undefined}
                    disabled={inCorsoStato}
                    onClick={() => cambiaStato(s)}
                    className={`h-2 w-8 transition disabled:opacity-60 ${i === 0 ? "rounded-l-full" : ""} ${
                      i === SEQUENZA_STATO.length - 1 ? "rounded-r-full" : ""
                    } ${i < idxStato ? "bg-primary/70" : i === idxStato ? COLORE_STATO_SEGMENTO[s].seg : "bg-muted"}`}
                  />
                );
              })}
            </div>
            {inCorsoStato && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" strokeWidth={2.5} />}
          </div>
          <span className={`w-fit text-xs font-bold ${COLORE_STATO_SEGMENTO[ticket.stato].testo}`}>
            {ticket.stato} — {SEQUENZA_STATO.indexOf(ticket.stato) + 1}° di {SEQUENZA_STATO.length} passi
          </span>
        </div>
      )}

      {mostraRapportinoForm && (
        <RapportinoForm
          ticketId={ticket.id}
          ticketNumero={ticket.numero}
          statoVecchio={ticket.stato}
          onAnnulla={onAnnullaRapportino}
          onSalvato={onRapportinoSalvato}
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
    </>
  );
}
