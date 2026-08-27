"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Ticket as TicketIcon, Trash2, Loader2, Users2 } from "lucide-react";
import { PulsanteDocumento } from "@/components/condivisi/pulsante-documento";
import { CONFIG_STATO_TRACCIA, type StatoTraccia } from "@/lib/stato-traccia";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { aggiornaStatoRichiestaCliente, eliminaRichiestaCliente, urlDocumentoRichiesta } from "@/app/(app)/richieste-clienti/actions";
import type { RichiestaCliente } from "@/lib/types";
import { etichettaDettaglio } from "@/lib/etichette-dettagli";
import { useToast } from "@/components/ui/toast";

const STATI = ["Da Lavorare", "In Verifica", "Lavorata"];

// ★ NUOVA (2026-08) — Sistema Subentro, doppio consenso in parallelo
// (Opzione B): a differenza delle altre pratiche, qui lo stato non basta
// da solo a dire "cosa manca" — servono le due tracce indipendenti (vedi
// avviaPraticaSubentro/inviaLinkVecchioClienteSubentro).
function traccePratica(r: RichiestaCliente): { vecchio: StatoTraccia; nuovo: "ok" | "attesa" } | null {
  if (r.tipo_richiesta !== "Subentro") return null;
  return {
    vecchio: r.vecchio_cliente_confermato_il ? "ok" : r.vecchio_cliente_rifiutato_il ? "no" : "attesa",
    nuovo: Object.keys(r.dettagli || {}).length > 0 ? "ok" : "attesa",
  };
}

function PallinoTraccia({ etichetta, stato }: { etichetta: string; stato: StatoTraccia }) {
  const { icona: Icona, classi } = CONFIG_STATO_TRACCIA[stato];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${classi}`}>
      <Icona className="h-3 w-3 shrink-0" strokeWidth={2.5} />
      {etichetta}
    </span>
  );
}

const COLORE_TIPO: Record<string, string> = {
  "Cambio IBAN": "bg-success/10 text-success border-success/20",
  "Cambio Anagrafica": "bg-success/10 text-success border-success/20",
  Trasferimento: "bg-accent text-accent-foreground border-accent",
  Subentro: "bg-accent text-accent-foreground border-accent",
  "Richiesta Dati": "bg-secondary text-secondary-foreground border-transparent",
  // ★ NUOVA (2026-08) — Disdetta, tracciata solo come promemoria (vedi
  // segnaDisdettaRicevuta() in clienti-esterni/actions.ts) — colore critico
  // perché, a differenza delle altre, segnala la perdita di un cliente.
  Disdetta: "bg-critical/10 text-critical border-critical/20",
};

export function RichiesteClientiBoard({ richieste, isAdmin }: { richieste: RichiestaCliente[]; isAdmin: boolean }) {
  const [ricerca, setRicerca] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [aperta, setAperta] = useState<RichiestaCliente | null>(null);

  const tipi = useMemo(() => Array.from(new Set(richieste.map((r) => r.tipo_richiesta))), [richieste]);

  const filtrate = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    return richieste.filter((r) => (!fTipo || r.tipo_richiesta === fTipo) && (!testo || (r.cliente || "").toLowerCase().includes(testo)));
  }, [richieste, fTipo, ricerca]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
          <input
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca cliente..."
            className="h-9 w-48 rounded-md border bg-background pl-8 pr-3 text-sm"
          />
        </div>
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="">Tutti i tipi</option>
          {tipi.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STATI.map((stato) => {
          const items = filtrate.filter((r) => r.stato === stato);
          return (
            <div key={stato} className="rounded-2xl bg-muted/50 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="font-heading text-sm font-bold">{stato}</span>
                <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground shadow-sm">
                  {items.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Vuoto.</div>
                )}
                {items.map((r) => (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setAperta(r)}
                    onKeyDown={(e) => e.key === "Enter" && setAperta(r)}
                    className="cursor-pointer rounded-xl border bg-card p-3 text-left text-sm shadow-md transition hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-semibold">{r.cliente || "—"}</span>
                    </div>
                    <div className="mb-2 text-xs text-muted-foreground">
                      {new Date(r.data).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </div>
                    <Badge variant="outline" className={COLORE_TIPO[r.tipo_richiesta] ?? ""}>
                      {r.tipo_richiesta}
                    </Badge>
                    {traccePratica(r) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <PallinoTraccia etichetta="Vecchio cliente" stato={traccePratica(r)!.vecchio} />
                        <PallinoTraccia etichetta="Nuovo cliente" stato={traccePratica(r)!.nuovo} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ★ FIX (2026-08, controllo d'oro) — ultimo popup a pannello laterale
      (Sheet) rimasto in Richieste Clienti, uniformato al popup centrale
      (Dialog) come il resto del gestionale. */}
      <Dialog open={!!aperta} onOpenChange={(v) => !v && setAperta(null)}>
        <DialogContent>
          {aperta && (
            <DettaglioRichiesta
              richiesta={aperta}
              isAdmin={isAdmin}
              onCambiata={(r) => setAperta(r)}
              onEliminata={() => setAperta(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DettaglioRichiesta({
  richiesta,
  isAdmin,
  onCambiata,
  onEliminata,
}: {
  richiesta: RichiestaCliente;
  isAdmin: boolean;
  onCambiata: (r: RichiestaCliente) => void;
  onEliminata: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [inCorso, startTransizione] = useTransition();
  const [inCorsoElimina, startElimina] = useTransition();

  function cambiaStato(nuovo: string) {
    if (nuovo === richiesta.stato) return;
    startTransizione(async () => {
      await aggiornaStatoRichiestaCliente(richiesta.id, nuovo);
      onCambiata({ ...richiesta, stato: nuovo });
      toast(`Passata a "${nuovo}".`, "successo");
      router.refresh();
    });
  }

  // ★ NUOVA — solo un amministratore la vede (pulsante non renderizzato
  // affatto per gli altri, controllo comunque ripetuto lato server in
  // eliminaRichiestaCliente()): cancellazione vera, pensata per moduli di
  // prova, duplicati o inviati per errore dal cliente.
  function elimina() {
    if (
      !confirm(
        `Eliminare definitivamente questa richiesta (${richiesta.tipo_richiesta} — ${richiesta.cliente ?? "cliente"})? L'operazione non è reversibile.`
      )
    )
      return;
    startElimina(async () => {
      const risultato = await eliminaRichiestaCliente(richiesta.id);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      toast("Richiesta eliminata.", "successo");
      onEliminata();
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{richiesta.cliente || "Richiesta"}</DialogTitle>
        <DialogDescription>{richiesta.tipo_richiesta}</DialogDescription>
      </DialogHeader>
      <div className="flex min-w-0 flex-col gap-4 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {STATI.map((s) => (
            <button
              key={s}
              disabled={inCorso}
              onClick={() => cambiaStato(s)}
              className={`flex min-h-9 items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${
                s === richiesta.stato
                  ? "border-primary bg-gradient-to-b from-primary to-[color-mix(in_oklch,var(--primary),black_14%)] text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:border-primary/40"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {traccePratica(richiesta) && (
          <div className="flex flex-wrap gap-1.5">
            <PallinoTraccia etichetta="Vecchio cliente" stato={traccePratica(richiesta)!.vecchio} />
            <PallinoTraccia etichetta="Nuovo cliente" stato={traccePratica(richiesta)!.nuovo} />
          </div>
        )}

        {richiesta.ticket_id && (
          <Link
            href={`/tickets?aperto=${richiesta.ticket_id}`}
            className="flex w-fit items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs font-semibold text-primary transition hover:bg-muted/60"
          >
            <TicketIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
            Vedi il Ticket collegato
          </Link>
        )}

        {/* ★ NUOVA (2026-08) — "Pratiche cliente senza Ticket": molte
        pratiche ora non hanno più un Ticket, solo il cliente vero
        (anagrafica Aruba) — stesso trattamento del link sopra. */}
        {richiesta.cliente_esterno_id && (
          <Link
            href={`/clienti-esterni/${richiesta.cliente_esterno_id}`}
            className="flex w-fit items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs font-semibold text-primary transition hover:bg-muted/60"
          >
            <Users2 className="h-3.5 w-3.5" strokeWidth={2.25} />
            Vedi la scheda cliente
          </Link>
        )}

        {Object.entries(richiesta.dettagli || {}).map(([chiave, valore]) =>
          valore ? (
            <div key={chiave}>
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{etichettaDettaglio(chiave)}</div>
              <div className="font-medium">{valore}</div>
            </div>
          ) : null
        )}

        {richiesta.documenti?.length > 0 && (
          <div>
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Documenti</div>
            <div className="flex flex-col gap-1.5">
              {richiesta.documenti.map((doc, i) => (
                <PulsanteDocumento
                  key={i}
                  percorso={doc.percorso}
                  nome={doc.nome}
                  etichetta={doc.tipo ? `${doc.tipo} — ${doc.nome}` : doc.nome}
                  onOttieniUrl={urlDocumentoRichiesta}
                />
              ))}
            </div>
          </div>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={elimina}
            disabled={inCorsoElimina}
            className="mt-2 flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-critical/30 px-3 py-3 text-xs font-semibold text-critical transition hover:bg-critical/10 disabled:opacity-50"
          >
            {inCorsoElimina ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />}
            {inCorsoElimina ? "Eliminazione in corso…" : "Elimina richiesta"}
          </button>
        )}
      </div>
    </>
  );
}
