"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  getTodoPersonali,
  creaTodoPersonale,
  completaTodoPersonale,
  eliminaTodoPersonale,
  modificaTodoPersonale,
} from "@/app/(app)/todo/actions";
import { useToast } from "@/components/ui/toast";
import type { TodoPersonale } from "@/lib/types";

interface TodoData {
  todo: TodoPersonale[] | null;
  aggiungi: (testo: string) => Promise<string | null>;
  completa: (item: TodoPersonale) => Promise<void>;
  modifica: (id: string, nuovoTesto: string) => Promise<string | null>;
  elimina: (id: string) => Promise<void>;
}

const TodoDataContext = createContext<TodoData>({
  todo: null,
  aggiungi: async () => null,
  completa: async () => {},
  modifica: async () => null,
  elimina: async () => {},
});

/** ★ FIX — riquadro fisso in home e pop-up dalla sidebar sono due istanze
 * indipendenti di `TodoPanel`: completare o eliminare un to-do in una non
 * si rifletteva nell'altra finché non si riapriva. A differenza della
 * chat, qui non serve Realtime (sono sempre e solo i MIEI to-do, nessun
 * altro li tocca mai) — basta un unico stato React condiviso, aggiornato
 * da qualunque istanza chiami `completa`/`elimina`/`aggiungi`/`modifica`. */
export function TodoDataProvider({ personaCorrenteId, children }: { personaCorrenteId: string | null; children: React.ReactNode }) {
  const [todo, setTodo] = useState<TodoPersonale[] | null>(null);
  const toast = useToast();

  const ricarica = useCallback(() => {
    getTodoPersonali().then(setTodo);
  }, []);

  useEffect(() => {
    if (personaCorrenteId) ricarica();
  }, [personaCorrenteId, ricarica]);

  const aggiungi = useCallback(async (testo: string) => {
    const risultato = await creaTodoPersonale(testo);
    if (risultato.errore || !risultato.todo) return risultato.errore || "Errore imprevisto.";
    setTodo((t) => [...(t ?? []), risultato.todo as TodoPersonale]);
    return null;
  }, []);

  // ★ FIX (2026-10-02, audit d'oro — regressione) — aggiornava subito lo
  // stato React (ottimistico) ma non aspettava né controllava l'esito della
  // scrittura server: se falliva (rete, sessione scaduta, id non più
  // proprio — completaTodoPersonale() restituisce già un errore esplicito
  // in quel caso), il to-do restava spuntato/non spuntato in UI ma
  // invariato nel database, e tornava "indietro" in silenzio al refresh
  // successivo — senza che l'utente capisse perché. Ora aspetta l'esito e,
  // se fallisce, annulla l'aggiornamento ottimistico e avvisa.
  const completa = useCallback(
    async (item: TodoPersonale) => {
      const nuovoFatto = !item.fatto;
      setTodo((t) => (t ?? []).map((x) => (x.id === item.id ? { ...x, fatto: nuovoFatto } : x)));
      const risultato = await completaTodoPersonale(item.id, nuovoFatto);
      if (risultato.errore) {
        setTodo((t) => (t ?? []).map((x) => (x.id === item.id ? { ...x, fatto: item.fatto } : x)));
        toast(risultato.errore);
      }
    },
    [toast]
  );

  const modifica = useCallback(async (id: string, nuovoTesto: string) => {
    const testoPulito = nuovoTesto.trim();
    if (!testoPulito) return "Il testo non può essere vuoto.";
    setTodo((t) => (t ?? []).map((x) => (x.id === id ? { ...x, testo: testoPulito } : x)));
    const risultato = await modificaTodoPersonale(id, testoPulito);
    return risultato.errore;
  }, []);

  // ★ FIX (2026-10-02, audit d'oro — regressione) — stesso problema di
  // completa() sopra: su un fallimento server il to-do spariva dall'UI ma
  // restava nel database, ricomparendo al refresh successivo senza
  // spiegazione. Risincronizza da ricarica() invece di tentare di
  // reinserire la riga a mano (più robusto: niente da ricostruire
  // sull'ordinamento/posizione originale).
  const elimina = useCallback(
    async (id: string) => {
      setTodo((t) => (t ?? []).filter((x) => x.id !== id));
      const risultato = await eliminaTodoPersonale(id);
      if (risultato.errore) {
        toast(risultato.errore);
        ricarica();
      }
    },
    [toast, ricarica]
  );

  return <TodoDataContext.Provider value={{ todo, aggiungi, completa, modifica, elimina }}>{children}</TodoDataContext.Provider>;
}

export function useTodoData(): TodoData {
  return useContext(TodoDataContext);
}
