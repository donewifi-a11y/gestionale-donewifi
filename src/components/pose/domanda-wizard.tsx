"use client";

import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Check } from "lucide-react";

// ★ NUOVA (2026-08-26) — motore "una domanda alla volta" per le Schede di
// Lavoro su pose.donewifi.it (Opzione A, scelta esplicitamente tra 3
// proposte con artifact: "impossibile confondersi o perdersi un campo").
// Diverso da SchedaWizard (schede/scheda-wizard.tsx, usato dal gestionale
// interno): lì un passo raggruppa più campi, qui un passo È un campo solo
// — troppi passi per lo stepper a pillole di SchedaWizard (una Scheda
// Installazione qui ha ~20 domande), serve una barra di avanzamento
// invece che pillole singole.
export interface Domanda {
  /** Testo della domanda, formulato come tale — non un'etichetta di campo. */
  domanda: string;
  aiuto?: string;
  contenuto: React.ReactNode;
  /** Ritorna un messaggio d'errore se manca qualcosa di obbligatorio, altrimenti null. */
  valida?: () => string | null;
}

export function DomandaWizard({
  domande,
  inCorso,
  erroreInvio,
  testoInvio,
  onAnnulla,
  onInvia,
}: {
  domande: Domanda[];
  inCorso: boolean;
  erroreInvio: string;
  testoInvio: string;
  onAnnulla: () => void;
  onInvia: () => void;
}) {
  const [indice, setIndice] = useState(0);
  const [erroreLocale, setErroreLocale] = useState("");
  const ultimo = indice === domande.length - 1;
  const d = domande[indice];

  function avanti() {
    const errore = d.valida?.();
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
  }

  function indietro() {
    setErroreLocale("");
    if (indice === 0) {
      onAnnulla();
      return;
    }
    setIndice((i) => i - 1);
  }

  return (
    <div className="flex flex-col gap-6 rounded-2xl border bg-card p-5 pb-6 shadow-sm">
      <div className="flex flex-col gap-2.5">
        <span className="font-mono text-sm font-bold text-muted-foreground">
          Domanda {indice + 1} di {domande.length}
        </span>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-[color-mix(in_oklch,var(--primary),black_14%)] transition-all duration-300"
            style={{ width: `${((indice + 1) / domande.length) * 100}%` }}
          />
        </div>
      </div>

      <div key={indice} className="flex flex-col gap-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200">
        <div>
          <h2 className="text-2xl leading-tight font-extrabold tracking-tight text-balance">{d.domanda}</h2>
          {d.aiuto && <p className="mt-1.5 text-[15px] text-muted-foreground">{d.aiuto}</p>}
        </div>
        {d.contenuto}
      </div>

      {(erroreLocale || erroreInvio) && (
        <p className="flex items-start gap-2 rounded-xl bg-critical/10 p-3.5 text-[15px] font-medium text-critical">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" strokeWidth={2.25} />
          {erroreLocale || erroreInvio}
        </p>
      )}

      {/* ★ spazio vuoto per non far finire l'ultimo contenuto sotto la
      barra fissa qui sotto (stesso principio già in rapportino-form.tsx). */}
      <div className="h-16" aria-hidden />

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-popover/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-3">
          <button
            type="button"
            onClick={indietro}
            disabled={inCorso}
            aria-label={indice === 0 ? "Annulla" : "Domanda precedente"}
            className="flex h-16 w-20 shrink-0 items-center justify-center rounded-2xl border-2 border-border bg-background text-foreground disabled:opacity-60"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={avanti}
            disabled={inCorso}
            className="flex h-16 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-primary to-[color-mix(in_oklch,var(--primary),black_14%)] text-lg font-bold text-primary-foreground shadow-lg shadow-primary/30 disabled:opacity-60"
          >
            {inCorso ? (
              "Salvataggio..."
            ) : ultimo ? (
              <>
                <Check className="h-5 w-5" strokeWidth={3} /> {testoInvio}
              </>
            ) : (
              <>
                Avanti <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
