"use client";

import { useEffect, useState } from "react";
import { ListChecks, X, Plus, Trash2, Pencil, Check } from "lucide-react";
import { useTodoData } from "@/components/todo/todo-data-context";
import type { TodoPersonale } from "@/lib/types";

/** ★ ESTRATTO — contenuto dei to-do personali, separato dal "come" viene
 * mostrato: prima un pulsante flottante sempre in vista, ora un pop-up
 * richiamabile dalla sidebar (`TodoWidget`) o un riquadro fisso in home
 * (`variant="riquadro"`). Stesso contenuto, stesso principio già applicato
 * alla chat (vedi chat-panel.tsx). Stato condiviso via `useTodoData()`:
 * riquadro e pop-up restano sincronizzati tra loro. */
export function TodoPanel({
  personaCorrenteId,
  onChiudi,
  variant = "popup",
}: {
  personaCorrenteId: string | null;
  onChiudi?: () => void;
  variant?: "popup" | "riquadro";
}) {
  const { todo, aggiungi, completa, modifica, elimina } = useTodoData();
  // ★ FIX — chiudere il pop-up a metà scrittura smontava il componente e
  // perdeva il testo del nuovo to-do senza avviso. Stessa soluzione della
  // chat: bozza salvata in sessionStorage invece di un conferma-prima-di-
  // chiudere invasivo.
  const [testo, setTesto] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [inModifica, setInModifica] = useState<string | null>(null);

  // ★ letto in un effetto, non nel lazy initializer di useState — questo
  // componente viene renderizzato anche lato server, dove sessionStorage
  // non esiste: leggerlo nell'initializer darebbe un valore diverso tra
  // render server e client, con conseguente mismatch di idratazione
  // sull'input (stesso ragionamento già applicato ai filtri persistiti).
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- ripristina una bozza da sessionStorage, non disponibile lato server: va per forza in un effetto post-mount.
      setTesto(sessionStorage.getItem("todo-bozza") || "");
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (testo) sessionStorage.setItem("todo-bozza", testo);
      else sessionStorage.removeItem("todo-bozza");
    } catch {}
  }, [testo]);

  async function onAggiungi(e: React.FormEvent) {
    e.preventDefault();
    if (!testo.trim() || inCorso) return;
    setInCorso(true);
    setErrore("");
    const errore = await aggiungi(testo);
    setInCorso(false);
    if (errore) {
      setErrore(errore);
      return;
    }
    setTesto("");
  }

  function onElimina(id: string) {
    // ★ FIX — prima cancellava subito al clic, senza conferma: un tocco di
    // troppo sul cestino perdeva il to-do senza possibilità di annullare.
    if (!confirm("Eliminare questo to-do?")) return;
    elimina(id);
  }

  if (!personaCorrenteId) return null;

  const daFare = (todo ?? []).filter((t) => !t.fatto);
  const fatti = (todo ?? []).filter((t) => t.fatto);
  // ★ FIX — vedi chat-panel.tsx: altezza fissa in pixel poteva tagliare la
  // lista su schermi bassi/orizzontali. `min(…, Nvh)` si adatta.
  const dimensioni = variant === "popup" ? "h-[min(420px,80vh)] w-72" : "h-[min(420px,70vh)] w-full";

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
            <RigaTodo
              key={item.id}
              item={item}
              inModifica={inModifica === item.id}
              onToggle={() => completa(item)}
              onElimina={() => onElimina(item.id)}
              onAvviaModifica={() => setInModifica(item.id)}
              onSalvaModifica={async (nuovoTesto) => {
                const errore = await modifica(item.id, nuovoTesto);
                if (!errore) setInModifica(null);
                return errore;
              }}
              onAnnullaModifica={() => setInModifica(null)}
            />
          ))}
        </div>
        {fatti.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5 border-t pt-2.5">
            <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Completati ({fatti.length})
            </p>
            {fatti.map((item) => (
              <RigaTodo
                key={item.id}
                item={item}
                inModifica={inModifica === item.id}
                onToggle={() => completa(item)}
                onElimina={() => onElimina(item.id)}
                onAvviaModifica={() => setInModifica(item.id)}
                onSalvaModifica={async (nuovoTesto) => {
                  const errore = await modifica(item.id, nuovoTesto);
                  if (!errore) setInModifica(null);
                  return errore;
                }}
                onAnnullaModifica={() => setInModifica(null)}
              />
            ))}
          </div>
        )}
      </div>

      <form onSubmit={onAggiungi} className="flex items-center gap-1.5 border-t p-2.5">
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

function RigaTodo({
  item,
  inModifica,
  onToggle,
  onElimina,
  onAvviaModifica,
  onSalvaModifica,
  onAnnullaModifica,
}: {
  item: TodoPersonale;
  inModifica: boolean;
  onToggle: () => void;
  onElimina: () => void;
  onAvviaModifica: () => void;
  onSalvaModifica: (nuovoTesto: string) => Promise<string | null>;
  onAnnullaModifica: () => void;
}) {
  const [bozza, setBozza] = useState(item.testo);

  if (inModifica) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onSalvaModifica(bozza);
        }}
        className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-1.5 py-1"
      >
        <input
          autoFocus
          value={bozza}
          onChange={(e) => setBozza(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onAnnullaModifica()}
          className="h-6 flex-1 rounded border bg-background px-1.5 text-xs"
        />
        <button type="submit" className="shrink-0 rounded p-0.5 text-success hover:bg-success/10" aria-label="Salva">
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <button type="button" onClick={onAnnullaModifica} className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted" aria-label="Annulla">
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </form>
    );
  }

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
        onClick={onAvviaModifica}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition hover:text-primary group-hover:opacity-100"
        aria-label="Modifica"
      >
        <Pencil className="h-3 w-3" strokeWidth={2.25} />
      </button>
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
