"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  getTodoPersonali,
  creaTodoPersonale,
  completaTodoPersonale,
  eliminaTodoPersonale,
  modificaTodoPersonale,
} from "@/app/(app)/todo/actions";
import type { TodoPersonale } from "@/lib/types";

interface TodoData {
  todo: TodoPersonale[] | null;
  aggiungi: (testo: string) => Promise<string | null>;
  completa: (item: TodoPersonale) => void;
  modifica: (id: string, nuovoTesto: string) => Promise<string | null>;
  elimina: (id: string) => void;
}

const TodoDataContext = createContext<TodoData>({
  todo: null,
  aggiungi: async () => null,
  completa: () => {},
  modifica: async () => null,
  elimina: () => {},
});

/** ★ FIX — riquadro fisso in home e pop-up dalla sidebar sono due istanze
 * indipendenti di `TodoPanel`: completare o eliminare un to-do in una non
 * si rifletteva nell'altra finché non si riapriva. A differenza della
 * chat, qui non serve Realtime (sono sempre e solo i MIEI to-do, nessun
 * altro li tocca mai) — basta un unico stato React condiviso, aggiornato
 * da qualunque istanza chiami `completa`/`elimina`/`aggiungi`/`modifica`. */
export function TodoDataProvider({ personaCorrenteId, children }: { personaCorrenteId: string | null; children: React.ReactNode }) {
  const [todo, setTodo] = useState<TodoPersonale[] | null>(null);

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

  const completa = useCallback((item: TodoPersonale) => {
    const nuovoFatto = !item.fatto;
    setTodo((t) => (t ?? []).map((x) => (x.id === item.id ? { ...x, fatto: nuovoFatto } : x)));
    completaTodoPersonale(item.id, nuovoFatto);
  }, []);

  const modifica = useCallback(async (id: string, nuovoTesto: string) => {
    const testoPulito = nuovoTesto.trim();
    if (!testoPulito) return "Il testo non può essere vuoto.";
    setTodo((t) => (t ?? []).map((x) => (x.id === id ? { ...x, testo: testoPulito } : x)));
    const risultato = await modificaTodoPersonale(id, testoPulito);
    return risultato.errore;
  }, []);

  const elimina = useCallback((id: string) => {
    setTodo((t) => (t ?? []).filter((x) => x.id !== id));
    eliminaTodoPersonale(id);
  }, []);

  return <TodoDataContext.Provider value={{ todo, aggiungi, completa, modifica, elimina }}>{children}</TodoDataContext.Provider>;
}

export function useTodoData(): TodoData {
  return useContext(TodoDataContext);
}
