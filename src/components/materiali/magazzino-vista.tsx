"use client";

import { useMemo, useState, useTransition } from "react";
import { Search, PackageX, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { impostaGiacenzaMateriale } from "@/app/(app)/materiali/actions";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MaterialeMagazzino } from "@/lib/types";

/** ★ NUOVA — richiesta esplicita: giacenza reale per i materiali (non le
 * antenne, vedi antenne-vista.tsx), con avviso di mancanza. Stesso stile
 * a lista della tab Catalogo, un badge di stato al posto del prezzo —
 * solo un amministratore può correggere giacenza/soglia (proposta
 * approvata via artifact), chiunque altro vede la lista in sola lettura. */
export function MagazzinoVista({ materiali, isAdmin }: { materiali: MaterialeMagazzino[]; isAdmin: boolean }) {
  const [ricerca, setRicerca] = useState("");
  const [modifica, setModifica] = useState<MaterialeMagazzino | null>(null);

  const filtrati = useMemo(
    () =>
      materiali
        .filter((m) => m.attivo)
        .filter((m) => !ricerca.trim() || m.nome.toLowerCase().includes(ricerca.trim().toLowerCase()))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [materiali, ricerca]
  );
  const tracciati = filtrati.filter((m) => m.giacenza != null);
  const nonTracciati = filtrati.filter((m) => m.giacenza == null);

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Si scarica da sola quando un materiale strutturato è usato in una Scheda di Installazione/Lavorazione Tecnica
        salvata — non da Preventivi (solo un&apos;ipotesi) né dal Rapportino di chiusura Ticket (materiali a testo
        libero). Un materiale senza giacenza impostata resta solo una voce di listino.
      </p>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
        <input
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          placeholder="Cerca materiale..."
          className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-sm"
        />
      </div>

      {tracciati.length === 0 && nonTracciati.length === 0 && (
        <p className="rounded-2xl border bg-card p-5 text-center text-sm text-muted-foreground shadow-sm">Nessun materiale trovato.</p>
      )}

      {tracciati.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-2xl border bg-card shadow-sm">
          {tracciati.map((m) => (
            <RigaMateriale key={m.id} materiale={m} isAdmin={isAdmin} onModifica={() => setModifica(m)} />
          ))}
        </div>
      )}

      {nonTracciati.length > 0 && (
        <div>
          <h2 className="mb-2 font-heading text-xs font-bold uppercase tracking-wide text-muted-foreground">Non tracciati a magazzino</h2>
          <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            {nonTracciati.map((m) => (
              <RigaMateriale key={m.id} materiale={m} isAdmin={isAdmin} onModifica={() => setModifica(m)} />
            ))}
          </div>
        </div>
      )}

      {/* ★ FIX (2026-08, controllo d'oro) — ultimo popup a pannello laterale
      (Sheet) rimasto qui, uniformato al popup centrale (Dialog) come il
      resto del gestionale. */}
      <Dialog open={!!modifica} onOpenChange={(v) => !v && setModifica(null)}>
        <DialogContent>{modifica && <FormGiacenza materiale={modifica} onFatto={() => setModifica(null)} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function RigaMateriale({ materiale, isAdmin, onModifica }: { materiale: MaterialeMagazzino; isAdmin: boolean; onModifica: () => void }) {
  const sottoSoglia = materiale.giacenza != null && materiale.soglia_minima != null && materiale.giacenza <= materiale.soglia_minima;
  const esaurito = materiale.giacenza === 0;

  return (
    <button
      onClick={isAdmin ? onModifica : undefined}
      disabled={!isAdmin}
      className="flex w-full items-center justify-between gap-3 border-t p-3.5 text-left text-sm transition first:border-t-0 hover:enabled:bg-muted/40 disabled:cursor-default"
    >
      <div className="min-w-0">
        <div className="font-semibold">{materiale.nome}</div>
        {materiale.giacenza != null && materiale.soglia_minima != null && (
          <div className="text-xs text-muted-foreground">Avviso sotto {materiale.soglia_minima} {materiale.unita_misura}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {materiale.giacenza == null ? (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Non tracciato</span>
        ) : (
          <span
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
              esaurito ? "bg-critical/10 text-critical" : sottoSoglia ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
            }`}
          >
            {esaurito && <PackageX className="h-3.5 w-3.5" strokeWidth={2.5} />}
            {materiale.giacenza} {materiale.unita_misura}
          </span>
        )}
        {isAdmin && <Pencil className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.25} />}
      </div>
    </button>
  );
}

function FormGiacenza({ materiale, onFatto }: { materiale: MaterialeMagazzino; onFatto: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [inCorso, startTransition] = useTransition();
  const [tracciato, setTracciato] = useState(materiale.giacenza != null);
  const [giacenza, setGiacenza] = useState(materiale.giacenza != null ? String(materiale.giacenza) : "0");
  const [soglia, setSoglia] = useState(materiale.soglia_minima != null ? String(materiale.soglia_minima) : "");
  const [errore, setErrore] = useState("");

  function salva() {
    setErrore("");
    startTransition(async () => {
      const risultato = await impostaGiacenzaMateriale(
        materiale.id,
        tracciato ? Number(giacenza) || 0 : null,
        tracciato && soglia.trim() ? Number(soglia) : null
      );
      if (risultato.errore) return setErrore(risultato.errore);
      toast(`Magazzino di "${materiale.nome}" aggiornato.`, "successo");
      router.refresh();
      onFatto();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{materiale.nome}</DialogTitle>
        <DialogDescription>Giacenza e soglia di avviso a magazzino.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={tracciato} onChange={(e) => setTracciato(e.target.checked)} className="h-4 w-4" />
          Traccia la giacenza di questo materiale
        </label>
        {tracciato && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="giacenza">Quantità attuale ({materiale.unita_misura})</Label>
              <Input id="giacenza" type="number" min="0" value={giacenza} onChange={(e) => setGiacenza(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="soglia">Soglia avviso (facoltativa)</Label>
              <Input id="soglia" type="number" min="0" value={soglia} onChange={(e) => setSoglia(e.target.value)} placeholder="Es. 5" className="mt-1" />
            </div>
          </div>
        )}
        {errore && <p className="rounded-lg bg-critical/10 p-2.5 text-sm text-critical">{errore}</p>}
        <Button onClick={salva} disabled={inCorso}>
          {inCorso ? "Salvataggio..." : "Salva"}
        </Button>
      </div>
    </>
  );
}
