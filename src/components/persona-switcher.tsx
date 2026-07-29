"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserCircle } from "lucide-react";
import { scegliPersonaCorrente } from "@/app/(app)/persone/actions";
import type { Persona } from "@/lib/types";

export function PersonaSwitcher({ persone, personaCorrenteId }: { persone: Persona[]; personaCorrenteId: string | null }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);

  async function cambia(id: string) {
    if (!id || id === personaCorrenteId) return;
    setInCorso(true);
    try {
      await scegliPersonaCorrente(id);
      router.refresh();
    } finally {
      setInCorso(false);
    }
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
        onChange={(e) => cambia(e.target.value)}
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
    </div>
  );
}
