"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { contaSegnalazioniDatiRicevutiInAttesa } from "@/app/(app)/segnalazioni/actions";

/** ★ NUOVA (2026-09-14, richiesta esplicita: "devi migliorare la
 * segnalazione di quando arriva la documentazione, perché passa
 * inosservata") — stesso identico principio di ChatDataProvider
 * (chat-data-context.tsx): un Provider unico, montato una volta in
 * app-shell.tsx, tiene il conteggio aggiornato per tutta l'app (badge in
 * sidebar) senza che ogni pagina debba rifarsi il proprio fetch. Il canale
 * Realtime su "segnalazioni"/"richieste_clienti" è lo stesso già in uso
 * dentro la bacheca (segnalazioni-board.tsx) — qui se ne apre un secondo,
 * con nome diverso: due canali sulla stessa tabella convivono senza
 * problemi (visto già con "chat-anteprime" e i canali per-thread di Chat). */
const SegnalazioniDatiContext = createContext<{ conteggio: number }>({ conteggio: 0 });

export function SegnalazioniDatiProvider({ personaCorrenteId, children }: { personaCorrenteId: string | null; children: React.ReactNode }) {
  const [conteggio, setConteggio] = useState(0);

  const ricarica = useCallback(() => {
    contaSegnalazioniDatiRicevutiInAttesa().then(setConteggio);
  }, []);

  useEffect(() => {
    if (personaCorrenteId) ricarica();
  }, [personaCorrenteId, ricarica]);

  useEffect(() => {
    if (!personaCorrenteId) return;
    const supabase = createClient();
    const canale = supabase
      .channel("segnalazioni-dati-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "segnalazioni" }, ricarica)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "richieste_clienti" }, ricarica)
      .subscribe();
    return () => {
      supabase.removeChannel(canale);
    };
  }, [personaCorrenteId, ricarica]);

  return <SegnalazioniDatiContext.Provider value={{ conteggio }}>{children}</SegnalazioniDatiContext.Provider>;
}

export function useSegnalazioniDati(): { conteggio: number } {
  return useContext(SegnalazioniDatiContext);
}
