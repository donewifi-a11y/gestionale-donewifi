"use client";

import { Check } from "lucide-react";

// ★ NUOVA (2026-08-26) — controlli "a piastrella" per il flusso "una
// domanda alla volta" di pose.donewifi.it (Opzione A scelta tra 3
// proposte con artifact, richiesta esplicita: pensato per chi non ha
// dimestichezza con gli smartphone). Sostituiscono i `<select>` nativi
// delle Schede interne: ogni opzione è un bottone alto e leggibile invece
// di un menu a tendina compresso, un tocco solo per scegliere.
//
// ★ RESTILIZZATA (2026-08-26) — accento blu (#2D6CFF) invece del rosso di
// marchio: pose ha una sua identità a colori ("1 · Segnale", scelta tra 3
// proposte con artifact), deliberatamente separata da --primary del
// gestionale interno — vedi lib/pose-categorie.ts.

const ACCENTO = "#2D6CFF";
const ACCENTO_BG = "#EAF0FF";

export function TileScelta({
  opzioni,
  valore,
  onChange,
}: {
  opzioni: readonly string[];
  valore: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {opzioni.map((o) => {
        const attivo = valore === o;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            style={attivo ? { borderColor: ACCENTO, background: ACCENTO_BG, color: "#1848C7" } : undefined}
            className="flex h-16 items-center justify-between rounded-2xl border-2 border-border bg-background px-5 text-left text-lg font-bold text-foreground transition active:scale-[0.98]"
          >
            {o}
            <span
              style={attivo ? { borderColor: ACCENTO, background: ACCENTO, color: "#fff" } : undefined}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-border"
            >
              {attivo && <Check className="h-4 w-4" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function TileMultiScelta({
  opzioni,
  valore,
  onChange,
}: {
  opzioni: readonly string[];
  valore: string[];
  onChange: (v: string[]) => void;
}) {
  function toggle(o: string) {
    onChange(valore.includes(o) ? valore.filter((v) => v !== o) : [...valore, o]);
  }
  return (
    <div className="flex flex-col gap-3">
      {opzioni.map((o) => {
        const attivo = valore.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            style={attivo ? { borderColor: ACCENTO, background: ACCENTO_BG, color: "#1848C7" } : undefined}
            className="flex h-16 items-center justify-between rounded-2xl border-2 border-border bg-background px-5 text-left text-lg font-bold text-foreground transition active:scale-[0.98]"
          >
            {o}
            <span
              style={attivo ? { borderColor: ACCENTO, background: ACCENTO, color: "#fff" } : undefined}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-2 border-border"
            >
              {attivo && <Check className="h-4 w-4" strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Input di testo/numero grande — stesso trattamento delle tile, per i campi liberi (metri, MAC, VLAN...). */
export function CampoGrande(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-16 w-full rounded-2xl border-2 border-border bg-background px-5 text-lg font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground focus:border-[#2D6CFF] focus:outline-none ${props.className ?? ""}`}
    />
  );
}

export function AreaGrande(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`min-h-32 w-full rounded-2xl border-2 border-border bg-background px-5 py-4 text-base font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground focus:border-[#2D6CFF] focus:outline-none ${props.className ?? ""}`}
    />
  );
}
