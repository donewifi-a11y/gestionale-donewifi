"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { elencaCoda, sincronizzaCodaInvio } from "@/lib/coda-invio-pose";

/**
 * ★ NUOVA (2026-09-04, artifact "Proposte UX 2026", proposta ④, primo
 * passo concordato: offline-first per la Scheda di Installazione/
 * Lavorazione) — mostra quante schede sono salvate sul telefono in attesa
 * di rete (vedi coda-invio-pose.ts) e prova a inviarle da sola quando può:
 * subito all'apertura di una pagina pose (in caso la connessione sia già
 * tornata da quando l'app era chiusa) e appena il telefono segnala di
 * essere di nuovo online. In `pose/layout.tsx`, visibile su ogni pagina di
 * pose — invisibile del tutto quando la coda è vuota, zero ingombro nel
 * caso normale (la stragrande maggioranza delle volte).
 */
export function IndicatoreCodaOffline() {
  const [inAttesa, setInAttesa] = useState(0);
  const [sincronizzando, setSincronizzando] = useState(false);
  const [erroreUltimoGiro, setErroreUltimoGiro] = useState("");

  const aggiornaConteggio = useCallback(async () => {
    try {
      setInAttesa((await elencaCoda()).length);
    } catch {
      // IndexedDB non disponibile (privacy mode molto restrittiva, raro) —
      // l'indicatore resta semplicemente nascosto, non è un dato critico.
    }
  }, []);

  const sincronizza = useCallback(async () => {
    setSincronizzando(true);
    setErroreUltimoGiro("");
    try {
      const { fallite } = await sincronizzaCodaInvio();
      if (fallite.length > 0) setErroreUltimoGiro(fallite[0].errore);
    } finally {
      setSincronizzando(false);
      aggiornaConteggio();
    }
  }, [aggiornaConteggio]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legge da IndexedDB e prova un invio di rete, non disponibili lato server né derivabili da props/stato: va per forza in un effetto post-mount, non nel render.
    aggiornaConteggio();
    sincronizza();
    window.addEventListener("online", sincronizza);
    return () => window.removeEventListener("online", sincronizza);
  }, [aggiornaConteggio, sincronizza]);

  if (inAttesa === 0) return null;

  return (
    <div
      className="sticky top-0 z-30 flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-bold text-white"
      style={{ background: "linear-gradient(90deg, #3A1416, #241D1B)" }}
    >
      <CloudOff className="h-4 w-4 shrink-0" style={{ color: "#F2A0AC" }} strokeWidth={2.5} />
      <span className="min-w-0 flex-1 truncate" style={{ color: "#F2A0AC" }}>
        {inAttesa} scheda{inAttesa === 1 ? "" : "e"} in attesa di rete
        {erroreUltimoGiro && <span className="font-medium opacity-80"> — {erroreUltimoGiro}</span>}
      </span>
      <button
        type="button"
        onClick={sincronizza}
        disabled={sincronizzando}
        className="flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 disabled:opacity-60"
        style={{ background: "rgba(255,255,255,.12)" }}
      >
        <RefreshCw className={`h-3 w-3 ${sincronizzando ? "animate-spin" : ""}`} strokeWidth={2.5} />
        {sincronizzando ? "Invio…" : "Riprova ora"}
      </button>
    </div>
  );
}
