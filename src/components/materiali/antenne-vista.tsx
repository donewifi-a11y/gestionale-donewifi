"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Search } from "lucide-react";
import {
  aggiungiAntenneInventario,
  annullaPrenotazioneAntenna,
  cercaTicketPerAntenna,
  eliminaAntennaInventario,
  prenotaAntennaInventario,
} from "@/app/(app)/materiali/actions";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OPZIONI_INSTALLAZIONE } from "@/lib/types";
import type { AntennaInventario } from "@/lib/types";

const COLORE_STATO: Record<AntennaInventario["stato"], string> = {
  Disponibile: "bg-success/10 text-success",
  Prenotata: "bg-warning/10 text-warning",
  Installata: "bg-muted text-muted-foreground",
};

/** ★ NUOVA — richiesta esplicita: inventario antenne per MAC, diviso per
 * tipologia, con lo stato di prenotazione fatto dal tecnico di Analisi
 * Rete. A differenza del Magazzino Materiali (giacenza a quantità), qui
 * ogni pezzo è un record a sé — vedi proposta approvata via artifact. */
export function AntenneVista({ antenne, isAdmin, puoPrenotare }: { antenne: AntennaInventario[]; isAdmin: boolean; puoPrenotare: boolean }) {
  const [aggiungi, setAggiungi] = useState<string | null>(null); // tipologia scelta, o null = chiuso

  const tipologieOrdine = useMemo(() => {
    const fisse = OPZIONI_INSTALLAZIONE.cpe.filter((t) => t !== "Altro");
    const extra = Array.from(new Set(antenne.map((a) => a.tipologia))).filter((t) => !OPZIONI_INSTALLAZIONE.cpe.includes(t as never));
    return [...fisse, ...extra.sort(), "Altro"];
  }, [antenne]);

  const gruppi = useMemo(() => {
    const mappa = new Map<string, AntennaInventario[]>();
    for (const a of antenne) {
      if (!mappa.has(a.tipologia)) mappa.set(a.tipologia, []);
      mappa.get(a.tipologia)!.push(a);
    }
    return mappa;
  }, [antenne]);

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Raggruppate per tipologia. Il tecnico di Analisi Rete prenota un pezzo Disponibile per un Ticket futuro; alla
        Scheda di Installazione salvata il MAC compilato si aggancia da solo e passa a Installata.
      </p>

      {tipologieOrdine.map((tipologia) => {
        const voci = gruppi.get(tipologia) ?? [];
        if (voci.length === 0 && !isAdmin) return null;
        const disponibili = voci.filter((a) => a.stato === "Disponibile").length;
        const prenotate = voci.filter((a) => a.stato === "Prenotata").length;
        const installate = voci.filter((a) => a.stato === "Installata").length;

        return (
          <div key={tipologia} className="mb-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3.5 py-2.5">
              <span className="text-sm font-bold">{tipologia}</span>
              <div className="flex items-center gap-2">
                {voci.length > 0 && (
                  <span className="hidden font-mono text-[11px] font-semibold sm:flex sm:gap-2">
                    <span className="text-success">{disponibili} disponibili</span>
                    <span className="text-warning">{prenotate} prenotate</span>
                    <span className="text-muted-foreground">{installate} installate</span>
                  </span>
                )}
                {isAdmin && (
                  <button
                    onClick={() => setAggiungi(tipologia)}
                    className="flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-[11px] font-semibold transition hover:bg-muted"
                  >
                    <Plus className="h-3 w-3" strokeWidth={2.5} />
                    MAC
                  </button>
                )}
              </div>
            </div>
            {voci.length === 0 ? (
              <p className="p-3.5 text-center text-xs text-muted-foreground">Nessun pezzo censito.</p>
            ) : (
              voci
                .sort((a, b) => a.mac.localeCompare(b.mac))
                .map((a) => <RigaAntenna key={a.id} antenna={a} isAdmin={isAdmin} puoPrenotare={puoPrenotare} />)
            )}
          </div>
        );
      })}

      <Dialog open={!!aggiungi} onOpenChange={(v) => !v && setAggiungi(null)}>
        <DialogContent>{aggiungi && <FormAggiungiAntenne tipologia={aggiungi} onFatto={() => setAggiungi(null)} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function RigaAntenna({ antenna, isAdmin, puoPrenotare }: { antenna: AntennaInventario; isAdmin: boolean; puoPrenotare: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [inCorso, startTransition] = useTransition();
  const [prenotazioneAperta, setPrenotazioneAperta] = useState(false);

  function annulla() {
    startTransition(async () => {
      const risultato = await annullaPrenotazioneAntenna(antenna.id);
      if (risultato.errore) return toast(risultato.errore);
      toast("Prenotazione annullata.", "successo");
      router.refresh();
    });
  }

  function elimina() {
    if (!confirm(`Rimuovere l'antenna ${antenna.mac} dall'inventario?`)) return;
    startTransition(async () => {
      const risultato = await eliminaAntennaInventario(antenna.id);
      if (risultato.errore) return toast(risultato.errore);
      toast("Antenna rimossa dall'inventario.", "successo");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3.5 py-2.5 text-sm first:border-t-0">
      <span className="font-mono text-xs">{antenna.mac}</span>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${COLORE_STATO[antenna.stato]}`}>{antenna.stato}</span>
        {antenna.stato === "Prenotata" && puoPrenotare && (
          <Button variant="outline" size="sm" disabled={inCorso} onClick={annulla} className="h-7 px-2 text-xs">
            Annulla prenotazione
          </Button>
        )}
        {antenna.stato === "Disponibile" && puoPrenotare && (
          <Button size="sm" disabled={inCorso} onClick={() => setPrenotazioneAperta(true)} className="h-7 px-2 text-xs">
            Prenota
          </Button>
        )}
        {isAdmin && antenna.stato !== "Installata" && (
          <button onClick={elimina} disabled={inCorso} className="text-muted-foreground transition hover:text-critical disabled:opacity-50">
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        )}
      </div>

      <Dialog open={prenotazioneAperta} onOpenChange={setPrenotazioneAperta}>
        <DialogContent>
          <SelettoreTicketPrenotazione antennaId={antenna.id} onFatto={() => setPrenotazioneAperta(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SelettoreTicketPrenotazione({ antennaId, onFatto }: { antennaId: string; onFatto: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [inCorso, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [risultati, setRisultati] = useState<{ id: string; numero: number; cliente: string }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (query.trim().length < 2) return setRisultati([]);
      const dati = await cercaTicketPerAntenna(query);
      setRisultati(dati);
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  function prenota(ticketId: string) {
    startTransition(async () => {
      const risultato = await prenotaAntennaInventario(antennaId, ticketId);
      if (risultato.errore) return toast(risultato.errore);
      toast("Antenna prenotata.", "successo");
      router.refresh();
      onFatto();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Prenota per un Ticket</DialogTitle>
        <DialogDescription>Cerca per numero o nome cliente.</DialogDescription>
      </DialogHeader>
      <div className="px-4 pb-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Numero o cliente..."
            className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-sm"
          />
        </div>
        <div className="mt-2 flex flex-col gap-1">
          {risultati.map((t) => (
            <button
              key={t.id}
              disabled={inCorso}
              onClick={() => prenota(t.id)}
              className="flex items-center justify-between rounded-lg bg-muted/50 px-2.5 py-2 text-left text-sm transition hover:bg-muted disabled:opacity-50"
            >
              <span>{t.cliente}</span>
              <span className="font-mono text-xs text-muted-foreground">#{t.numero}</span>
            </button>
          ))}
          {query.trim().length >= 2 && risultati.length === 0 && (
            <p className="p-2 text-center text-xs text-muted-foreground">Nessun Ticket trovato.</p>
          )}
        </div>
      </div>
    </>
  );
}

function FormAggiungiAntenne({ tipologia, onFatto }: { tipologia: string; onFatto: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [inCorso, startTransition] = useTransition();
  const [testo, setTesto] = useState("");
  const [errore, setErrore] = useState("");

  function salva() {
    setErrore("");
    if (!testo.trim()) return setErrore("Inserisci almeno un MAC.");
    startTransition(async () => {
      const risultato = await aggiungiAntenneInventario(tipologia, testo);
      if (risultato.errore) return setErrore(risultato.errore);
      toast(`${risultato.aggiunte ?? 0} antenna/e aggiunta/e a "${tipologia}".`, "successo");
      router.refresh();
      onFatto();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Aggiungi MAC — {tipologia}</DialogTitle>
        <DialogDescription>Un MAC per riga (o separati da virgola). Entrano come Disponibili.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3 px-4 pb-4">
        <textarea
          autoFocus
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          rows={6}
          placeholder={"AA:BB:CC:11:22:33\nAA:BB:CC:11:22:34"}
          className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
        />
        {errore && <p className="rounded-lg bg-critical/10 p-2.5 text-sm text-critical">{errore}</p>}
        <Button onClick={salva} disabled={inCorso}>
          {inCorso ? "Salvataggio..." : "Aggiungi"}
        </Button>
      </div>
    </>
  );
}
