"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Send, Trash2, Check, Clock, X, FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SuggerimentoCampo } from "@/components/ui/suggerimento-campo";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { formattaValuta } from "@/lib/types";
import type { Preventivo, StatoPreventivo } from "@/lib/types";
import { inviaPreventivoApprovazione, eliminaPreventivo } from "@/app/(app)/preventivi/actions";

const COLORE_STATO: Record<StatoPreventivo, string> = {
  Bozza: "bg-muted text-muted-foreground border-transparent",
  Inviato: "bg-warning/10 text-warning border-warning/20",
  Approvato: "bg-success/10 text-success border-success/20",
  Rifiutato: "bg-critical/10 text-critical border-critical/20",
};

const FILTRI_STATO: (StatoPreventivo | "Tutti")[] = ["Tutti", "Bozza", "Inviato", "Approvato", "Rifiutato"];

export function PreventiviBoard({
  preventivi,
  isAdmin,
}: {
  preventivi: Preventivo[];
  currentPersonaId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ricerca, setRicerca] = useState("");
  const [filtroStato, setFiltroStato] = useState<StatoPreventivo | "Tutti">("Tutti");
  const [aperto, setAperto] = useState<Preventivo | null>(null);

  // ★ apre direttamente un preventivo via ?aperto=<id> — usato dal link
  // "Preventivi collegati" nella scheda cliente.
  useEffect(() => {
    const id = searchParams.get("aperto");
    if (!id) return;
    const trovato = preventivi.find((p) => p.id === id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizza con l'URL (?aperto=id), non deriva da props/stato locale.
    if (trovato) setAperto(trovato);
  }, [searchParams, preventivi]);

  // ★ stesso principio già in uso in Segnalazioni: senza un canale
  // Realtime, "Inviato"→"Approvato"/"Rifiutato" (che arriva da un'azione
  // pubblica del cliente, non da un click nel gestionale) resterebbe
  // invisibile finché qualcuno non ricarica la pagina a mano.
  useEffect(() => {
    const supabase = createClient();
    const canale = supabase
      .channel("preventivi-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "preventivi" }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(canale);
    };
  }, [router]);

  useEffect(() => {
    if (!aperto) return;
    const fresco = preventivi.find((p) => p.id === aperto.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- risincronizza col Preventivo aperto dopo un refresh esterno (Realtime), non derivabile durante il render.
    if (fresco && fresco !== aperto) setAperto(fresco);
  }, [preventivi, aperto]);

  const filtrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    return preventivi.filter(
      (p) =>
        (filtroStato === "Tutti" || p.stato === filtroStato) &&
        (!testo || p.cliente_nome.toLowerCase().includes(testo) || String(p.numero).includes(testo))
    );
  }, [preventivi, ricerca, filtroStato]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
          <input
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca cliente, numero..."
            className="h-9 w-56 rounded-md border bg-background pl-8 pr-3 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {FILTRI_STATO.map((s) => (
            <Button key={s} size="sm" variant={filtroStato === s ? "default" : "outline"} onClick={() => setFiltroStato(s)}>
              {s}
            </Button>
          ))}
        </div>
      </div>

      {filtrati.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nessun preventivo.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtrati.map((p) => (
            <button
              key={p.id}
              onClick={() => setAperto(p)}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-4 w-4" strokeWidth={2.25} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{p.cliente_nome}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">#{p.numero}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.righe.length} voce/i · {p.tipologia_cliente}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-sm font-bold tabular-nums">{formattaValuta(p.totale)}</span>
                <Badge variant="outline" className={COLORE_STATO[p.stato]}>
                  {p.stato}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!aperto} onOpenChange={(v) => !v && setAperto(null)}>
        <DialogContent className="sm:max-w-lg">
          {aperto && <DettaglioPreventivo key={aperto.id} preventivo={aperto} isAdmin={isAdmin} onChiudi={() => setAperto(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DettaglioPreventivo({ preventivo, isAdmin, onChiudi }: { preventivo: Preventivo; isAdmin: boolean; onChiudi: () => void }) {
  const router = useRouter();
  const toast = useToast();
  // ★ NUOVA — stesso principio già applicato a Segnalazioni/Ticket: una
  // useTransition() indipendente per azione, spinner Loader2 sul bottone
  // e toast di conferma anche sul successo (prima "Invia per approvazione"
  // non dava alcuna conferma visiva oltre al re-render del dialog).
  const [inCorsoInvio, startInvio] = useTransition();
  const [inCorsoElimina, startElimina] = useTransition();
  const [errore, setErrore] = useState("");

  function invia() {
    setErrore("");
    startInvio(async () => {
      const risultato = await inviaPreventivoApprovazione(preventivo.id, window.location.origin);
      if (risultato.errore) {
        setErrore(risultato.errore);
        toast(risultato.errore);
        return;
      }
      toast("Preventivo inviato per approvazione.", "successo");
      router.refresh();
    });
  }

  function elimina() {
    if (!confirm(`Eliminare definitivamente il preventivo #${preventivo.numero} — ${preventivo.cliente_nome}?`)) return;
    startElimina(async () => {
      const risultato = await eliminaPreventivo(preventivo.id);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      toast("Preventivo eliminato.", "successo");
      onChiudi();
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{preventivo.cliente_nome}</DialogTitle>
        <DialogDescription>
          Preventivo #{preventivo.numero} · {preventivo.tipologia_cliente}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={COLORE_STATO[preventivo.stato]}>
            {preventivo.stato === "Approvato" && <Check className="h-3 w-3" strokeWidth={2.5} />}
            {preventivo.stato === "Rifiutato" && <X className="h-3 w-3" strokeWidth={2.5} />}
            {preventivo.stato === "Inviato" && <Clock className="h-3 w-3" strokeWidth={2.5} />}
            {preventivo.stato}
          </Badge>
          {preventivo.cliente_telefono && <span className="text-xs text-muted-foreground">{preventivo.cliente_telefono}</span>}
          {preventivo.cliente_email && <span className="text-xs text-muted-foreground">{preventivo.cliente_email}</span>}
        </div>

        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="flex flex-col gap-1.5">
            {preventivo.righe.map((r, i) => (
              <div key={i} className="flex items-start justify-between gap-2 text-xs">
                <span className="break-words text-muted-foreground">
                  {r.descrizione} {r.quantita > 1 ? `× ${r.quantita}` : ""}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formattaValuta(r.quantita * r.prezzoUnitario)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm font-bold">
            <span>Totale</span>
            <span className="tabular-nums">{formattaValuta(preventivo.totale)}</span>
          </div>
        </div>

        {preventivo.note && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Note</p>
            <p className="break-words">{preventivo.note}</p>
          </div>
        )}

        {preventivo.stato === "Bozza" && (
          <>
            <Button onClick={invia} disabled={inCorsoInvio || !preventivo.cliente_email} className="min-h-11 w-full">
              {inCorsoInvio ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <Send className="h-4 w-4" strokeWidth={2.25} />}
              {inCorsoInvio ? "Invio in corso…" : "Invia per approvazione"}
            </Button>
            {!preventivo.cliente_email && (
              <p className="flex items-center gap-1 text-xs text-warning">
                Serve un&apos;email per inviarlo — aggiungila creando un nuovo preventivo con il cliente collegato.
                <SuggerimentoCampo testo="Il link di approvazione viene inviato via email: senza un indirizzo collegato al preventivo non c'è modo di recapitarlo al cliente." />
              </p>
            )}
            {errore && <p className="text-xs text-critical">{errore}</p>}
          </>
        )}
        {preventivo.stato === "Inviato" && (
          <p className="text-xs text-muted-foreground">
            In attesa di risposta dal cliente
            {preventivo.inviato_il && ` (inviato il ${new Date(preventivo.inviato_il).toLocaleDateString("it-IT")})`}.
          </p>
        )}
        {preventivo.stato === "Approvato" && preventivo.risposto_il && (
          <p className="text-xs text-success">Approvato il {new Date(preventivo.risposto_il).toLocaleString("it-IT")}.</p>
        )}
        {preventivo.stato === "Rifiutato" && preventivo.risposto_il && (
          <p className="text-xs text-critical">Rifiutato il {new Date(preventivo.risposto_il).toLocaleString("it-IT")}.</p>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={elimina}
            disabled={inCorsoElimina}
            className="mt-1 flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-critical/30 px-3 py-3 text-xs font-semibold text-critical transition hover:bg-critical/10 disabled:opacity-50"
          >
            {inCorsoElimina ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />}
            {inCorsoElimina ? "Eliminazione in corso…" : "Elimina preventivo"}
          </button>
        )}
      </div>
    </>
  );
}
