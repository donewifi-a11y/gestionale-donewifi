"use client";

import { ChevronDown, UserRound, Phone, Mail, MapPin, Trash2, Loader2 } from "lucide-react";
import { SuggerimentoCampo } from "@/components/ui/suggerimento-campo";
import { IconaCategoria } from "@/components/condivisi/icona-categoria";
import { PianificaAppuntamento } from "@/components/tickets/tickets-board";
import { tipoServizioDaTicket, REPARTI } from "@/lib/types";
import type { Appuntamento, Persona, Ticket } from "@/lib/types";

function iniziali(persona: Persona) {
  return persona.nome
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function Campo({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{etichetta}</div>
      <div className="font-medium">{valore}</div>
    </div>
  );
}

/**
 * ★ ESTRATTA (2026-09-18, split del monolite DettaglioTicket — ~1175
 * righe in tickets-board.tsx) — nessuna modifica di logica: componente
 * puramente presentazionale, stato/handler restano in DettaglioTicket e
 * arrivano qui come props, stesso pattern di SubentroDoppioConsenso.
 * Copre: Assegnato a / Reparto, Contatti, Pianifica appuntamento, e il
 * disclosure "Altri dettagli e azioni" (priorità/note/campi extra/Elimina).
 *
 * ★ RIORDINATA (2026-09, "ancora incasinato. riordinato" — seconda
 * passata dopo screenshot del popup reale) — "chi se ne occupa"
 * (assegnazione/reparto) prima di "come contattarlo" (telefono/email/
 * indirizzo), a sua volta prima dell'azione (pianifica): dall'alto in
 * basso, identità → responsabilità → contesto → azione.
 */
export function SezioneAssegnazioneTicket({
  ticket,
  persone,
  tecniciEsterni,
  currentPersonaId,
  assegnatario,
  assegnatarioEsterno,
  inCorsoAssegna,
  inCorsoAssegnaEsterno,
  onAssegnaValore,
  onRimuoviAssegnazione,
  cambiaReparto,
  inCorsoReparto,
  appuntamentoAttivo,
  isAdmin,
  inCorsoElimina,
  onElimina,
  dettagliExtra,
  campiMancanti,
}: {
  ticket: Ticket;
  persone: Persona[];
  tecniciEsterni: { id: string; nome: string; cognome: string | null }[];
  currentPersonaId: string;
  assegnatario: Persona | null | undefined;
  assegnatarioEsterno: { id: string; nome: string; cognome: string | null } | null | undefined;
  inCorsoAssegna: boolean;
  inCorsoAssegnaEsterno: boolean;
  /** ★ stessa select unica di prima: "io" | "p:<id>" | "e:<id>". */
  onAssegnaValore: (valore: string) => void;
  onRimuoviAssegnazione: () => void;
  cambiaReparto: (nuovo: (typeof REPARTI)[number]) => void;
  inCorsoReparto: boolean;
  appuntamentoAttivo: Appuntamento | null;
  isAdmin: boolean;
  inCorsoElimina: boolean;
  onElimina: () => void;
  /** ★ slot per DettagliExtra/CampiMancanti — restano definiti in
   * tickets-board.tsx (usati anche da TicketsBoard fuori da questo
   * dettaglio), passati già renderizzati per non creare un altro giro
   * di import incrociati tra i due file. */
  dettagliExtra: React.ReactNode;
  campiMancanti: React.ReactNode;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
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
                onClick={onRimuoviAssegnazione}
                className="text-xs text-muted-foreground hover:text-critical disabled:opacity-60"
              >
                Rimuovi
              </button>
            </div>
          ) : (
            /* ★ RESTILIZZATA (2026-09, "ancora incasinato") — appearance-none
            + chevron disegnato a mano invece della freccia nativa del
            browser: stesso trattamento del select di stato qui sopra,
            così i tre controlli del pannello non sembrano tre stili
            diversi mescolati insieme. */
            <div className="relative mt-1.5">
              <select
                defaultValue=""
                disabled={inCorsoAssegna || inCorsoAssegnaEsterno}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  onAssegnaValore(v);
                }}
                className="h-9 w-full appearance-none rounded-lg border bg-background pl-2.5 pr-7 text-xs disabled:opacity-60"
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
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60" strokeWidth={2.5} />
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Reparto
            <SuggerimentoCampo testo="Il reparto responsabile di questo Ticket — cambialo se la pratica va gestita da un altro reparto (es. da Commerciale ad Analisi Rete per l'installazione)." />
          </div>
          <div className="relative mt-1.5">
            <select
              value={ticket.reparto}
              disabled={inCorsoReparto}
              onChange={(e) => cambiaReparto(e.target.value as (typeof REPARTI)[number])}
              className="h-9 w-full appearance-none rounded-lg border bg-background pl-2.5 pr-7 text-xs font-medium disabled:opacity-60"
            >
              {REPARTI.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60" strokeWidth={2.5} />
          </div>
        </div>
      </div>

      {/* ★ NUOVA (2026-09, stesso redesign) — telefono/email/indirizzo
      erano tre blocchi "etichetta sopra, valore sotto" impilati: qui
      diventano chip inline, stesso trattamento icona-colorata già in
      uso per i contatti altrove nel gestionale (preventivi-board.tsx,
      clienti-board.tsx...) invece di un pattern nuovo solo per questo
      popup. */}
      {(ticket.telefono || ticket.email || ticket.indirizzo) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {ticket.telefono && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <IconaCategoria icona={Phone} categoria="contatto" dimensione="sm" />
              {ticket.telefono}
            </span>
          )}
          {ticket.email && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <IconaCategoria icona={Mail} categoria="contatto" dimensione="sm" />
              {ticket.email}
            </span>
          )}
          {ticket.indirizzo && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <IconaCategoria icona={MapPin} categoria="luogo" dimensione="sm" />
              {ticket.indirizzo}
            </span>
          )}
        </div>
      )}

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
      come controllo aggiuntivo di sicurezza.
      ★ SPOSTATA (2026-09, redesign) — era in fondo al tab, sotto ogni
      altro campo: quando non c'è ancora un appuntamento attivo è
      l'azione più probabile su questo Ticket, ora promossa ad azione
      primaria (`primario`), ultima nell'ordine identità → responsabilità
      → contesto → azione. */}
      <PianificaAppuntamento
        ticket={ticket}
        persone={persone}
        tipoServizioIniziale={
          tipoServizioDaTicket(ticket.categoria, ticket.sottocategoria) === "Nuova installazione" || ticket.segnalazione_id
            ? "Nuova installazione"
            : "Lavorazione tecnica"
        }
        primario={!appuntamentoAttivo && ticket.stato !== "Completato"}
      />

      {/* ★ NUOVA (2026-09, "troppi pulsanti e possibilità" — trend 2026
      "progressive disclosure": mostra il minimo per decidere il prossimo
      passo, il resto a richiesta) — priorità, problema/note, i campi
      extra della sottocategoria ed "Elimina Ticket" (azione rara e
      distruttiva) sono ora dietro un disclosure nativo invece di sempre
      in vista: nessuno script, il `<details>` del browser gestisce
      apertura/chiusura e lo stato non va salvato da nessuna parte.
      ★ ALLEGGERITA (2026-09, "ancora incasinato") — non più una barra
      bordata a piena larghezza (leggeva come un quarto pulsante invece
      che come un "mostra altro"): solo testo + chevron, larga quanto il
      suo contenuto; il riquadro bordato compare solo intorno al
      contenuto quando è aperto. */}
      <details className="group">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-open:rotate-180" strokeWidth={2.5} />
          Altri dettagli e azioni
        </summary>
        <div className="mt-2.5 flex flex-col gap-3 rounded-xl border bg-card p-3">
          <Campo etichetta="Priorità" valore={ticket.priorita} />
          <Campo etichetta="Problema / Note" valore={ticket.problema || "—"} />
          {dettagliExtra}
          {campiMancanti}
          {isAdmin && (
            <button
              type="button"
              onClick={onElimina}
              disabled={inCorsoElimina}
              className="flex w-fit items-center gap-1.5 text-xs font-semibold text-critical hover:underline disabled:opacity-50"
            >
              {inCorsoElimina ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />}
              {inCorsoElimina ? "Eliminazione in corso…" : "Elimina Ticket"}
            </button>
          )}
        </div>
      </details>
    </>
  );
}
