"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getContattiChat, type ContattoChat, type GruppoChat } from "@/app/(app)/chat/actions";

interface ChatData {
  persone: ContattoChat[];
  gruppi: GruppoChat[];
  nonLettiTotali: number;
  /** ★ NUOVA — id della persona "Sistema" (mittente degli avvisi
   * automatici), per distinguerli in ChatPanel dai messaggi scritti a
   * mano. Null finché non ancora caricato, o se non esiste. */
  sistemaId: string | null;
  pronto: boolean;
  ricarica: () => void;
}

const ChatDataContext = createContext<ChatData>({
  persone: [],
  gruppi: [],
  nonLettiTotali: 0,
  sistemaId: null,
  pronto: false,
  ricarica: () => {},
});

/** ★ FIX — riquadro fisso in home e pop-up dalla sidebar sono due istanze
 * indipendenti di `ChatPanel`: senza un dato condiviso, leggere un
 * messaggio in una non si rifletteva nell'altra finché non si riapriva.
 * Un solo Provider (stesso principio di `OnlineProvider`, per lo stesso
 * motivo: un secondo canale Realtime con lo stesso nome verrebbe
 * deduplicato e mandato in crash) tiene l'elenco conversazioni/non letti
 * aggiornato per tutte le istanze contemporaneamente — e permette anche
 * alla sidebar di mostrare il badge dei non letti senza montare una
 * ChatPanel apposta. */
export function ChatDataProvider({ personaCorrenteId, children }: { personaCorrenteId: string | null; children: React.ReactNode }) {
  const [dati, setDati] = useState<Omit<ChatData, "pronto" | "ricarica">>({ persone: [], gruppi: [], nonLettiTotali: 0, sistemaId: null });
  const [pronto, setPronto] = useState(false);

  const ricarica = useCallback(() => {
    getContattiChat().then((d) => {
      setDati(d);
      setPronto(true);
    });
  }, []);

  useEffect(() => {
    if (personaCorrenteId) ricarica();
  }, [personaCorrenteId, ricarica]);

  // ★ un nuovo messaggio (in una qualunque conversazione, RLS decide quali
  // sono visibili) o una lettura (mia, da un'altra scheda/istanza) fanno
  // ricaricare l'anteprima — nessun filtro per conversazione qui, a
  // differenza del canale usato dentro un singolo thread aperto.
  useEffect(() => {
    if (!personaCorrenteId) return;
    const supabase = createClient();
    const canale = supabase
      .channel("chat-anteprime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messaggi_chat" }, ricarica)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversazioni_letture" }, ricarica)
      .subscribe();
    return () => {
      supabase.removeChannel(canale);
    };
  }, [personaCorrenteId, ricarica]);

  return <ChatDataContext.Provider value={{ ...dati, pronto, ricarica }}>{children}</ChatDataContext.Provider>;
}

export function useChatData(): ChatData {
  return useContext(ChatDataContext);
}
