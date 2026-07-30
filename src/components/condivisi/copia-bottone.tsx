"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopiaBottone({ testo }: { testo: string }) {
  const [copiato, setCopiato] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(testo);
        setCopiato(true);
        setTimeout(() => setCopiato(false), 1500);
      }}
      className="flex shrink-0 items-center gap-1 rounded-md border border-primary px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary transition hover:bg-primary hover:text-primary-foreground"
    >
      {copiato ? <Check className="h-3 w-3" strokeWidth={2.5} /> : <Copy className="h-3 w-3" strokeWidth={2.25} />}
      {copiato ? "Copiato" : "Copia"}
    </button>
  );
}
