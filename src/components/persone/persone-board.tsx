"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { creaPersona, aggiornaPersona } from "@/app/(app)/persone/actions";
import type { Persona } from "@/lib/types";

export function PersoneBoard({ persone }: { persone: Persona[] }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  async function aggiungi(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    setErrore("");
    setInCorso(true);
    const risultato = await creaPersona(nome.trim());
    setInCorso(false);
    if (risultato.errore) {
      setErrore(risultato.errore);
      return;
    }
    setNome("");
    router.refresh();
  }

  async function toggleAttivo(p: Persona) {
    await aggiornaPersona(p.id, { nome: p.nome, attivo: !p.attivo });
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={aggiungi} className="mb-4 flex gap-2">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome e cognome"
          className="flex-1"
        />
        <Button type="submit" disabled={inCorso || !nome.trim()}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Aggiungi
        </Button>
      </form>
      {errore && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          {errore}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {persone.length === 0 && (
          <p className="p-5 text-center text-sm text-muted-foreground">Nessuna persona ancora. Aggiungine una sopra.</p>
        )}
        {persone.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 border-t p-3.5 text-sm first:border-t-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                {p.nome.slice(0, 2).toUpperCase()}
              </span>
              <span className="font-semibold">{p.nome}</span>
            </div>
            <Button size="sm" variant={p.attivo ? "outline" : "default"} onClick={() => toggleAttivo(p)}>
              {p.attivo ? (
                "Disattiva"
              ) : (
                <>
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Riattiva
                </>
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
