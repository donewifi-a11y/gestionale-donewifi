"use client";

import { useMemo, useState, useTransition } from "react";
import { HardDrive, Trash2, Loader2, AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { elencaFileMedia, eliminaFileMedia, type FileMedia } from "@/app/(app)/sistema/media-actions";

function formattaDimensione(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formattaData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type Ordine = "dimensione" | "data";

/** ★ NUOVA (2026-09-02, richiesta esplicita: "possiamo avere un pulsante
 * allora per pulire la memoria dei media e poter scegliere cosa cancellare,
 * solo per amministratore?") — l'elenco non si carica da solo all'apertura
 * di Stato Sistema (la scansione ricorsiva dello storage può richiedere
 * qualche secondo): un pulsante esplicito "Analizza spazio media" avvia il
 * caricamento, così la pagina resta veloce per chi la apre solo per
 * controllare le integrazioni. Ogni file mostra a cosa è collegato (Ticket/
 * Scheda/Cliente) quando lo troviamo — un file senza collegamento è
 * probabilmente "orfano" (la riga che lo referenziava è stata cancellata),
 * il candidato più sicuro da eliminare. */
export function PuliziaMedia() {
  const [analizzato, setAnalizzato] = useState(false);
  const [caricamento, setCaricamento] = useState(false);
  const [file, setFile] = useState<FileMedia[]>([]);
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [ordine, setOrdine] = useState<Ordine>("dimensione");
  const [inCorsoEliminazione, startEliminazione] = useTransition();
  const toast = useToast();

  async function analizza() {
    setCaricamento(true);
    const risultato = await elencaFileMedia();
    setCaricamento(false);
    setAnalizzato(true);
    if (risultato.errore) {
      toast(risultato.errore);
      return;
    }
    setFile(risultato.file);
    setSelezionati(new Set());
  }

  const fileOrdinati = useMemo(() => {
    const copia = [...file];
    if (ordine === "dimensione") copia.sort((a, b) => b.dimensione - a.dimensione);
    else copia.sort((a, b) => (b.creatoIl ?? "").localeCompare(a.creatoIl ?? ""));
    return copia;
  }, [file, ordine]);

  const spazioTotale = useMemo(() => file.reduce((s, f) => s + f.dimensione, 0), [file]);
  const orfani = useMemo(() => file.filter((f) => !f.riferimento), [file]);
  const spazioSelezionato = useMemo(() => file.filter((f) => selezionati.has(f.percorso)).reduce((s, f) => s + f.dimensione, 0), [file, selezionati]);

  function toggleFile(percorso: string) {
    setSelezionati((prev) => {
      const next = new Set(prev);
      if (next.has(percorso)) next.delete(percorso);
      else next.add(percorso);
      return next;
    });
  }

  function selezionaOrfani() {
    setSelezionati(new Set(orfani.map((f) => f.percorso)));
  }

  function eliminaSelezionati() {
    const conRiferimento = file.filter((f) => selezionati.has(f.percorso) && f.riferimento);
    const messaggio =
      conRiferimento.length > 0
        ? `Stai per eliminare ${selezionati.size} file, di cui ${conRiferimento.length} ancora collegati a un Ticket/Scheda/Cliente (es. "${conRiferimento[0].riferimento?.etichetta}") — il collegamento smetterà di funzionare (es. "Vedi contratto"/"Vedi firma" non troverà più il file). Procedere comunque?`
        : `Eliminare ${selezionati.size} file (nessuno risulta collegato a un Ticket/Scheda/Cliente)? L'operazione non si può annullare.`;
    if (!confirm(messaggio)) return;

    startEliminazione(async () => {
      const risultato = await eliminaFileMedia([...selezionati]);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      toast(`${risultato.eliminati} file eliminati.`, "successo");
      setFile((prev) => prev.filter((f) => !selezionati.has(f.percorso)));
      setSelezionati(new Set());
    });
  }

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          <HardDrive className="h-3.5 w-3.5" strokeWidth={2.25} />
          Pulizia media
        </h2>
        {!analizzato && (
          <Button size="sm" onClick={analizza} disabled={caricamento}>
            {caricamento ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <HardDrive className="h-3.5 w-3.5" strokeWidth={2.25} />}
            {caricamento ? "Analisi in corso…" : "Analizza spazio media"}
          </Button>
        )}
      </div>

      {!analizzato && !caricamento && (
        <p className="text-xs text-muted-foreground">
          Elenca tutti i file caricati nel gestionale (foto schede, firme, contratti, allegati Ticket/Chat/pratiche cliente) con dimensione e a cosa
          sono collegati — per scegliere cosa eliminare manualmente. Non tocca nulla finché non selezioni e confermi.
        </p>
      )}

      {analizzato && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              <b className="text-foreground">{file.length}</b> file — <b className="text-foreground">{formattaDimensione(spazioTotale)}</b> totali
            </span>
            {orfani.length > 0 && (
              <button type="button" onClick={selezionaOrfani} className="font-semibold text-primary hover:underline">
                Seleziona i {orfani.length} file orfani (nessun collegamento trovato)
              </button>
            )}
            <button type="button" onClick={analizza} disabled={caricamento} className="ml-auto flex items-center gap-1 hover:text-foreground">
              {caricamento ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} /> : null}
              Ricarica
            </button>
          </div>

          {file.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun file trovato nello storage.</p>
          ) : (
            <>
              <div className="max-h-96 overflow-y-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/60">
                    <tr className="text-left text-muted-foreground">
                      <th className="w-8 p-2"></th>
                      <th className="p-2 font-semibold">Percorso</th>
                      <th className="p-2 font-semibold">
                        <button type="button" onClick={() => setOrdine("dimensione")} className="flex items-center gap-0.5">
                          Dimensione {ordine === "dimensione" && <ChevronDown className="h-3 w-3" strokeWidth={2.5} />}
                        </button>
                      </th>
                      <th className="p-2 font-semibold">
                        <button type="button" onClick={() => setOrdine("data")} className="flex items-center gap-0.5">
                          Caricato il {ordine === "data" && <ChevronDown className="h-3 w-3" strokeWidth={2.5} />}
                        </button>
                      </th>
                      <th className="p-2 font-semibold">Collegato a</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fileOrdinati.map((f) => (
                      <tr key={f.percorso} className="border-t">
                        <td className="p-2">
                          <input type="checkbox" checked={selezionati.has(f.percorso)} onChange={() => toggleFile(f.percorso)} />
                        </td>
                        <td className="max-w-[16rem] truncate p-2 font-mono" title={f.percorso}>
                          {f.percorso}
                        </td>
                        <td className="p-2 tabular-nums">{formattaDimensione(f.dimensione)}</td>
                        <td className="p-2 tabular-nums">{formattaData(f.creatoIl)}</td>
                        <td className="p-2">
                          {f.riferimento ? (
                            <span>{f.riferimento.etichetta}</span>
                          ) : (
                            <span className="flex items-center gap-1 text-warning">
                              <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={2.25} />
                              Nessun collegamento trovato
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selezionati.size > 0 && (
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={eliminaSelezionati}
                    disabled={inCorsoEliminazione}
                    className="flex items-center gap-1.5 rounded-lg border border-critical/30 px-3 py-2 text-xs font-semibold text-critical transition hover:bg-critical/10 disabled:opacity-50"
                  >
                    {inCorsoEliminazione ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />}
                    {inCorsoEliminazione ? "Eliminazione…" : `Elimina selezionati (${selezionati.size} — ${formattaDimensione(spazioSelezionato)})`}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
