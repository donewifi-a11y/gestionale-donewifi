"use client";

import { useCallback, useEffect, useState } from "react";

/** ★ FIX — estratto da tickets-board.tsx/segnalazioni-board.tsx: stessa
 * logica di "filtri ricordati per utente/browser" (lettura in un
 * effetto — mai nel lazy initializer, il componente è renderizzato anche
 * lato server dove localStorage non esiste, altrimenti mismatch di
 * idratazione — con un flag "pronto" per non sovrascrivere subito col
 * default) era incollata quasi identica in entrambi i file, i commenti si
 * citavano a vicenda riconoscendolo. Un bug qui (es. JSON corrotto) va
 * corretto una volta sola invece che in ogni bacheca che lo usa. */
export function usePersistedState<T extends Record<string, unknown>>(
  chiave: string,
  valoreIniziale: T
): [T, (aggiornamento: Partial<T>) => void] {
  const [stato, setStato] = useState<T>(valoreIniziale);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    try {
      const salvato = JSON.parse(localStorage.getItem(chiave) || "{}");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legge da localStorage, non disponibile lato server: va per forza in un effetto post-mount, non nel lazy initializer (mismatch di idratazione altrimenti).
      setStato((s) => ({ ...s, ...salvato }));
    } catch {}
    setPronto(true);
    // ★ dipende solo da `chiave`, non da `valoreIniziale` (di solito una
    // nuova identità ad ogni render): rieseguire questo effetto ad ogni
    // render riazzererebbe i filtri già letti da localStorage.
  }, [chiave]);

  useEffect(() => {
    if (!pronto) return;
    localStorage.setItem(chiave, JSON.stringify(stato));
  }, [chiave, stato, pronto]);

  const aggiorna = useCallback((parziale: Partial<T>) => {
    setStato((s) => ({ ...s, ...parziale }));
  }, []);

  return [stato, aggiorna];
}
