"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ★ FIX — con ChatPanel ora riusabile in due punti contemporaneamente
// (riquadro fisso in home + pop-up dalla sidebar), ciascuna istanza
// creava una propria sottoscrizione al canale di presenza "presenza-online".
// Il client Realtime di Supabase deduplica i canali per nome: la seconda
// istanza riceveva lo STESSO oggetto canale già sottoscritto dalla prima,
// e chiamarci sopra `.on("presence", ...)` dopo `.subscribe()` lancia
// un errore fatale ("cannot add `presence` callbacks... after
// `subscribe()`"), mandando in crash l'intera pagina. Un solo Provider,
// una sola sottoscrizione, condivisa da tutte le ChatPanel montate.

const OnlineContext = createContext<Set<string>>(new Set());

export function OnlineProvider({ personaCorrenteId, children }: { personaCorrenteId: string | null; children: React.ReactNode }) {
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!personaCorrenteId) return;
    const supabase = createClient();
    const canale = supabase.channel("presenza-online", { config: { presence: { key: personaCorrenteId } } });
    canale
      .on("presence", { event: "sync" }, () => {
        setOnline(new Set(Object.keys(canale.presenceState())));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await canale.track({ dal: new Date().toISOString() });
      });
    return () => {
      supabase.removeChannel(canale);
    };
  }, [personaCorrenteId]);

  return <OnlineContext.Provider value={online}>{children}</OnlineContext.Provider>;
}

export function useOnline(): Set<string> {
  return useContext(OnlineContext);
}
