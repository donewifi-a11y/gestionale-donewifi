"use client";

import { useEffect, useState } from "react";
import { ListChecks, X, Plus, Trash2 } from "lucide-react";
import { getTodoPersonali, creaTodoPersonale, completaTodoPersonale, eliminaTodoPersonale } from "@/app/(app)/todo/actions";
import type { TodoPersonale } from "@/lib/types";

/** ★ ESTRATTO — contenuto dei to-do personali, separato dal "come" viene
 * mostrato: prima un pulsante flottante sempre in vista, ora un pop-up
 * richiamabile dalla sidebar (`TodoWidget`) o un riquadro fisso in home
 * (`variant="riquadro"`). Stesso contenuto, stesso principio già applicato
 * alla chat (vedi chat-panel.tsx). */
export function TodoPanel({
  personaCorrenteId,
  onChiudi,
  variant = "popup",
}: {
  personaCorrenteId: string | null;
  onChiudi?: () => void;
  variant?: "popup" | "riquadro";
}) {
  const [todo, setTodo] = useState<TodoPersonale[] | null>(null);
  const [testo, setTesto] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    if (!todo) getTodoPersonali().then(setTodo);
  }, [todo]);

  async function aggiungi(e: React.FormEvent) {
    e.preventDefault();
    if (!testo.trim() || inCorso) return;
    setInCorso(true);
    setErrore("");
    const risultato = await creaTodoPersonale(testo);
    setInCorso(false);
    if (risultato.errore || !risultato.todo) {
      setErrore(risultato.errore || "Errore imprevisto.");
      return;
    }
    setTodo((t) => [...(t ?? []), risultato.todo as TodoPersonale]);
    setTesto("");
  }

  async function toggle(item: TodoPersonale) {
    const nuovoFatto = !item.fatto;
    setTodo((t) => (t ?? []).map((x) => (x.id === item.id ? { ...x, fatto: nuovoFatto } : x)));
    await completaTodoPersonale(item.id, nuovoFatto);
  }

  async function elimina(id: string) {
    setTodo((t) => (t ?? []).filter((x) => x.id !== id));
    await eliminaTodoPersonale(id);
  }

  if (!personaCorrenteId) return null;

  const daFare = (todo ?? []).filter((t) => !t.fatto);
  const fatti = (todo ?? []).filter((t) => t.fatto);
  const dimensioni = variant === "popup" ? "h-[420px] w-72" : "h-[420px] w-full";

  return (
    <div className={`flex ${dimensioni} flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl`}>
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2.5">
        <span className="flex flex-1 items-center gap-1.5 truncate text-sm font-bold">
          <ListChecks className="h-3.5 w-3.5 text-primary" strokeWidth={2.25} />
          I miei To-Do
        </span>
        {onChiudi && (
          <button onClick={onChiudi} className="rounded-md p-1 hover:bg-muted" aria-label="Chiudi">
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2.5">
        {todo === null && <p className="py-6 text-center text-xs text-muted-foreground">Caricamento...</p>}
        {todo !== null && todo.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Niente da fare — scrivi qui sotto per aggiungere il primo.
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          {daFare.map((item) => (
            <RigaTodo key={item.id} item={item} onToggle={() => toggle(item)} onElimina={() => elimina(item.id)} />
          ))}
        </div>
        {fatti.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 border-t pt-2.5">
            <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Completati ({fatti.length})
            </p>
            {fatti.map((item) => (
              <RigaTodo key={item.id} item={item} onToggle={() => toggle(item)} onElimina={() => elimina(item.id)} />
            ))}
          </div>
        )}
      </div>

      <form onSubmit={aggiungi} className="flex items-center gap-1.5 border-t p-2.5">
        <input
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          placeholder="Aggiungi un to-do..."
          className="h-8 flex-1 rounded-full border bg-background px-3 text-sm"
        />
        <button
          type="submit"
          disabled={inCorso || !testo.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition disabled:opacity-40"
          aria-label="Aggiungi"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </form>
      {errore && <p className="px-3 pb-2 text-[11px] text-critical">{errore}</p>}
    </div>
  );
}

function RigaTodo({ item, onToggle, onElimina }: { item: TodoPersonale; onToggle: () => void; onElimina: () => void }) {
  return (
    <div className="group flex items-start gap-2 rounded-lg px-1.5 py-1 hover:bg-muted/50">
      <button
        onClick={onToggle}
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
          item.fatto ? "border-success bg-success text-success-foreground" : "border-muted-foreground/40"
        }`}
        aria-label={item.fatto ? "Segna da fare" : "Segna fatto"}
      >
        {item.fatto && <span className="text-[10px] leading-none">✓</span>}
      </button>
      <span className={`flex-1 break-words text-xs ${item.fatto ? "text-muted-foreground line-through" : ""}`}>{item.testo}</span>
      <button
        onClick={onElimina}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition hover:text-critical group-hover:opacity-100"
        aria-label="Elimina"
      >
        <Trash2 className="h-3 w-3" strokeWidth={2.25} />
      </button>
    </div>
  );
}
