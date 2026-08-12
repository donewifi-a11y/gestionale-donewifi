"use client";

import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export interface PassoScheda {
  titolo: string;
  contenuto: React.ReactNode;
  /** Ritorna un messaggio d'errore se il passo non è completo, altrimenti null. */
  valida?: () => string | null;
}

/** ★ NUOVA — richiesta esplicita: la Scheda di Installazione/Lavorazione,
 * usata sul campo da smartphone, era un unico form lungo da scorrere
 * tutto — comodo su desktop, scomodo con una mano sola in mobilità. Ora un
 * passo alla volta (un solo pensiero per schermata), con uno stepper
 * cliccabile in cima che su schermi larghi mostra anche le etichette (su
 * schermi stretti solo "passo N di M" per non affollare). Stesso
 * componente sia per il popup centrale di Ticket/Calendario sia per il
 * Sheet di Vista Tecnico — il contenitore esterno decide solo larghezza e
 * animazione d'apertura, la navigazione tra i passi è identica ovunque. */
export function SchedaWizard({
  titolo,
  sottotitolo,
  passi,
  indiceIniziale = 0,
  inCorso,
  erroreInvio,
  testoInvio,
  onIndiceCambiato,
  onAnnulla,
  onInvia,
}: {
  titolo: string;
  sottotitolo: string;
  passi: PassoScheda[];
  indiceIniziale?: number;
  inCorso: boolean;
  erroreInvio: string;
  testoInvio: string;
  onIndiceCambiato?: (i: number) => void;
  onAnnulla: () => void;
  onInvia: () => void;
}) {
  const [indice, setIndice] = useState(indiceIniziale);
  const [erroreLocale, setErroreLocale] = useState("");
  const ultimo = indice === passi.length - 1;
  const passo = passi[indice];

  function vaiA(i: number) {
    // ★ lo stepper permette di saltare solo a un passo già visitato (indietro)
    // o al successivo immediato — mai in avanti "a caso" scavalcando dati
    // non ancora inseriti, che genererebbe un salvataggio con campi mancanti.
    if (i > indice + 1 || i === indice) return;
    setErroreLocale("");
    setIndice(i);
    onIndiceCambiato?.(i);
  }

  function avanti() {
    const errore = passo.valida?.();
    if (errore) {
      setErroreLocale(errore);
      return;
    }
    setErroreLocale("");
    if (ultimo) {
      onInvia();
      return;
    }
    setIndice((i) => i + 1);
    onIndiceCambiato?.(indice + 1);
  }

  function indietro() {
    setErroreLocale("");
    if (indice === 0) {
      onAnnulla();
      return;
    }
    setIndice((i) => i - 1);
    onIndiceCambiato?.(indice - 1);
  }

  return (
    <>
      <DialogHeader className="sticky top-0 z-10 -mx-4 -mt-4 border-b bg-popover px-4 pt-4 pb-3 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
        <DialogTitle>{titolo}</DialogTitle>
        <DialogDescription>{sottotitolo}</DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-1 py-3">
        {passi.map((p, i) => {
          const visitabile = i <= indice + 1;
          return (
            <div key={p.titolo} className="flex flex-1 items-center gap-1">
              <button
                type="button"
                disabled={!visitabile}
                onClick={() => vaiA(i)}
                title={p.titolo}
                className={`flex h-7 flex-1 items-center justify-center gap-1 rounded-full px-1 text-center text-[10px] font-semibold leading-none transition ${
                  i === indice
                    ? "bg-gradient-to-b from-primary to-[color-mix(in_oklch,var(--primary),black_14%)] text-primary-foreground shadow-sm"
                    : i < indice
                      ? "bg-success/15 text-success"
                      : "bg-muted text-muted-foreground"
                } ${!visitabile ? "cursor-not-allowed opacity-60" : ""}`}
              >
                {i < indice && <Check className="h-2.5 w-2.5 shrink-0" strokeWidth={3} />}
                <span className="hidden truncate sm:inline">{p.titolo}</span>
                <span className="sm:hidden">{i + 1}</span>
              </button>
              {i < passi.length - 1 && <div className={`h-0.5 w-2 shrink-0 rounded ${i < indice ? "bg-success/40" : "bg-muted"}`} />}
            </div>
          );
        })}
      </div>
      <p className="mb-3 text-center text-[11px] font-semibold text-muted-foreground sm:hidden">
        Passo {indice + 1} di {passi.length} — {passo.titolo}
      </p>

      <div className="flex flex-col gap-4">{passo.contenuto}</div>

      {(erroreLocale || erroreInvio) && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          {erroreLocale || erroreInvio}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 -mb-4 mt-4 flex gap-2 border-t bg-popover px-4 py-3 sm:-mx-6 sm:-mb-6 sm:px-6">
        <Button type="button" variant="outline" disabled={inCorso} onClick={indietro} className="flex-1">
          {indice === 0 ? "Annulla" : "← Indietro"}
        </Button>
        <Button type="button" disabled={inCorso} onClick={avanti} className="flex-1">
          {inCorso ? "Invio in corso..." : ultimo ? testoInvio : "Avanti →"}
        </Button>
      </div>
    </>
  );
}
