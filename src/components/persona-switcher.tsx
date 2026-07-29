"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCircle, Lock } from "lucide-react";
import { scegliPersonaCorrente } from "@/app/(app)/persone/actions";
import type { Persona } from "@/lib/types";

export function PersonaSwitcher({ persone, personaCorrenteId }: { persone: Persona[]; personaCorrenteId: string | null }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [inAttesaDiId, setInAttesaDiId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState("");

  const personaInAttesa = persone.find((p) => p.id === inAttesaDiId) ?? null;

  async function conferma(id: string, pwd: string) {
    setInCorso(true);
    setErrore("");
    const risultato = await scegliPersonaCorrente(id, pwd);
    setInCorso(false);
    if (risultato.errore) {
      setErrore(risultato.errore);
      return;
    }
    setInAttesaDiId(null);
    setPassword("");
    router.refresh();
  }

  function seleziona(id: string) {
    if (!id || id === personaCorrenteId) return;
    const persona = persone.find((p) => p.id === id);
    if (!persona) return;
    if (persona.richiede_password) {
      setInAttesaDiId(id);
      setPassword("");
      setErrore("");
      return;
    }
    conferma(id, "");
  }

  if (persone.length === 0) return null;

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/50">
        <UserCircle className="h-3 w-3" strokeWidth={2.5} />
        Tu sei
      </div>
      <select
        value={personaCorrenteId ?? ""}
        disabled={inCorso}
        onChange={(e) => seleziona(e.target.value)}
        className={`h-8 w-full rounded-md border border-sidebar-border bg-sidebar-accent px-2 text-xs font-semibold text-sidebar-foreground ${
          !personaCorrenteId ? "animate-pulse ring-2 ring-sidebar-primary" : ""
        }`}
      >
        <option value="" disabled>
          Scegli chi sei...
        </option>
        {persone.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </select>

      {personaInAttesa && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xs rounded-2xl bg-card p-5 text-card-foreground shadow-2xl">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Lock className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <div>
                <div className="text-sm font-bold">{personaInAttesa.nome}</div>
                <div className="text-xs text-muted-foreground">Inserisci la password</div>
              </div>
            </div>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && conferma(personaInAttesa.id, password)}
              className="mb-2 h-9 w-full rounded-md border bg-background px-3 text-sm"
            />
            {errore && <p className="mb-2 text-xs text-critical">{errore}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setInAttesaDiId(null);
                  setErrore("");
                }}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Annulla
              </button>
              <button
                onClick={() => conferma(personaInAttesa.id, password)}
                disabled={inCorso || !password}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {inCorso ? "..." : "Conferma"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
