"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { segnaSchedaInseritaAntenne } from "@/app/(app)/materiali/actions";
import { useToast } from "@/components/ui/toast";
import type { SchedaDaTrasferireAntenne } from "@/app/(app)/materiali/actions";

/** Testo pronto da incollare così com'è nel gestionale esterno delle
 * antenne — stessi campi dell'avviso in Chat (vedi notifiche-antenne.ts),
 * un'unica riga per campo per essere facile da leggere mentre si compila
 * il modulo dell'altro sistema. */
function testoDaCopiare(s: SchedaDaTrasferireAntenne): string {
  const righe = [`Cliente: ${s.cliente}${s.ticketNumero ? ` (Ticket #${s.ticketNumero})` : ""}`];
  if (s.mac) righe.push(`MAC: ${s.mac}`);
  if (s.modelloCpe) righe.push(`Apparato: ${s.modelloCpe}`);
  if (s.bts) righe.push(`BTS: ${s.bts}`);
  if (s.gpsLat != null && s.gpsLng != null) righe.push(`GPS: ${s.gpsLat}, ${s.gpsLng}`);
  return righe.join("\n");
}

/** ★ NUOVA (2026-08-27, richiesta esplicita: "il rapporto di lavoro deve
 * andare sul gestionale principale... in modo che poi venga inserito
 * dall'operatore nel gestionale esterno delle antenne") — coda di
 * riserva: l'avviso in Chat (inviato alla chiusura, vedi
 * lib/notifiche-antenne.ts) è il modo principale per accorgersi di una
 * scheda da trascrivere, questa vista è la rete di sicurezza per chi lo
 * ha perso o vuole un controllo periodico. Sparisce da qui non appena
 * segnata come inserita — nessuna doppia trascrizione, nessuna persa. */
export function AntenneEsterneVista({ schede }: { schede: SchedaDaTrasferireAntenne[] }) {
  const [copiata, setCopiata] = useState<string | null>(null);
  const [inCorso, avviaTransizione] = useTransition();
  const router = useRouter();
  const toast = useToast();

  async function copia(s: SchedaDaTrasferireAntenne) {
    try {
      await navigator.clipboard.writeText(testoDaCopiare(s));
      setCopiata(s.schedaId);
      setTimeout(() => setCopiata((c) => (c === s.schedaId ? null : c)), 1800);
    } catch {
      toast("Impossibile copiare — seleziona e copia il testo a mano.");
    }
  }

  function segnaInserita(schedaId: string) {
    avviaTransizione(async () => {
      const risultato = await segnaSchedaInseritaAntenne(schedaId);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      router.refresh();
    });
  }

  if (schede.length === 0) {
    return (
      <p className="rounded-2xl border bg-card p-5 text-center text-sm text-muted-foreground shadow-sm">
        Niente in sospeso — tutte le installazioni e sostituzioni sono già state trascritte nel gestionale esterno delle antenne.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">
        Schede completate ancora da trascrivere nel gestionale esterno delle antenne. Arriva già un avviso in Chat (reparto Analisi Rete)
        alla chiusura di ognuna — questa lista è di riserva, per chi se lo è perso.
      </p>
      <div className="flex flex-col gap-2">
        {schede.map((s) => (
          <div key={s.schedaId} className="flex flex-col gap-2 rounded-xl border bg-card p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Radio className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <div className="min-w-0 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold">{s.cliente}</span>
                  {s.ticketNumero && <span className="text-xs text-muted-foreground">Ticket #{s.ticketNumero}</span>}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                    {s.tipo === "Nuova installazione" ? "Installazione" : "Lavorazione"}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(s.completataIl).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  {s.mac && ` · MAC ${s.mac}`}
                  {s.bts && ` · BTS ${s.bts}`}
                  {s.modelloCpe && ` · ${s.modelloCpe}`}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
              <Button size="sm" variant="outline" onClick={() => copia(s)}>
                {copiata === s.schedaId ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />}
                {copiata === s.schedaId ? "Copiato" : "Copia dati"}
              </Button>
              <Button size="sm" disabled={inCorso} onClick={() => segnaInserita(s.schedaId)}>
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                Segna come inserita
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
