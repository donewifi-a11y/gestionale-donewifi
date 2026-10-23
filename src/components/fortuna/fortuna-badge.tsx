"use client";

import { useCallback, useEffect, useState } from "react";
import { contaCouponDaVedere } from "@/app/(app)/fortuna/actions";

/**
 * ★ NUOVA — conteggio dei coupon Fortuna ancora da vedere, per il numerino nel menu. Fortuna è un altro
 * progetto Supabase, quindi niente Realtime: si ricontrolla ogni minuto e quando si torna sulla finestra.
 * `attivo` è false per chi non vede Fortuna (nessuna chiamata inutile).
 */
export function useFortunaDaVedere(attivo: boolean): number {
  const [n, setN] = useState(0);
  const ricarica = useCallback(() => { contaCouponDaVedere().then(setN).catch(() => {}); }, []);

  useEffect(() => {
    if (!attivo) return;
    ricarica();
    const timer = setInterval(ricarica, 60_000);
    const alFuoco = () => { if (document.visibilityState === "visible") ricarica(); };
    document.addEventListener("visibilitychange", alFuoco);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", alFuoco); };
  }, [attivo, ricarica]);

  return attivo ? n : 0;
}
