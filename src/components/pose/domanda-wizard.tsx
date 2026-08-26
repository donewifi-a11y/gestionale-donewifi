"use client";

import { useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { CATEGORIE_DOMANDA, type CategoriaDomanda } from "@/lib/pose-categorie";

// ★ NUOVA (2026-08-26) — motore "una domanda alla volta" per le Schede di
// Lavoro su pose.donewifi.it (Opzione A, scelta esplicitamente tra 3
// proposte con artifact: "impossibile confondersi o perdersi un campo").
// Diverso da SchedaWizard (schede/scheda-wizard.tsx, usato dal gestionale
// interno): lì un passo raggruppa più campi, qui un passo È un campo solo
// — troppi passi per lo stepper a pillole di SchedaWizard (una Scheda
// Installazione qui ha ~17 domande), serve una barra di avanzamento
// invece che pillole singole.
//
// ★ RESTILIZZATA (2026-08-26) — palette "1 · Segnale" scelta tra 3
// proposte con artifact: badge/icona colorati per categoria della domanda
// (vedi lib/pose-categorie.ts), font Sora/Manrope/Space Mono (vedi
// pose/layout.tsx) invece di Geist/rosso di marchio del gestionale interno.
export interface Domanda {
  /** Testo della domanda, formulato come tale — non un'etichetta di campo. */
  domanda: string;
  aiuto?: string;
  /** Determina colore del badge/icona in cima — vedi CATEGORIE_DOMANDA. */
  categoria: CategoriaDomanda;
  icona: React.ReactNode;
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
  const cat = CATEGORIE_DOMANDA[d.categoria];

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
    <div className="flex flex-col gap-6 rounded-[26px] border bg-card p-5 pb-6 shadow-[0_30px_60px_-24px_rgba(0,0,0,.18)]">
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#E4ECFF]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#2D6CFF] to-[#00D68F] transition-all duration-300"
          style={{ width: `${((indice + 1) / domande.length) * 100}%` }}
        />
      </div>

      <div key={indice} className="flex flex-col gap-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200">
        <div className="flex items-center justify-between gap-3">
          <span
            style={{ background: cat.sfondo, color: cat.testo }}
            className="rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wide uppercase [font-family:var(--font-pose-mono)]"
          >
            {cat.etichetta} · {indice + 1}/{domande.length}
          </span>
        </div>

        <div className="flex items-start gap-4">
          <div
            style={{ background: `linear-gradient(135deg, ${cat.da}, ${cat.a})`, boxShadow: `0 10px 20px -8px ${cat.da}88` }}
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl text-white"
          >
            {d.icona}
          </div>
          <div className="flex-1 pt-1.5">
            <h2 className="text-xl leading-tight font-extrabold tracking-tight text-balance [font-family:var(--font-pose-display)]">{d.domanda}</h2>
            {d.aiuto && <p className="mt-1.5 text-[14.5px] text-muted-foreground">{d.aiuto}</p>}
          </div>
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
            style={{ background: "linear-gradient(90deg, #2D6CFF, #7C4DFF)", boxShadow: "0 12px 24px -10px #2D6CFF66" }}
            className="flex h-16 flex-1 items-center justify-center gap-2 rounded-2xl text-lg font-bold text-white [font-family:var(--font-pose-display)] disabled:opacity-60"
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
