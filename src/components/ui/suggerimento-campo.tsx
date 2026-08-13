"use client";

import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// ★ NUOVA — icona "?" piccola accanto a un'etichetta poco ovvia: al passaggio
// del mouse (o al tocco, su tablet) spiega in una riga cosa significa il
// campo o cosa succederà cliccando, senza dover allungare il testo fisso
// dell'interfaccia per tutti anche quando è già chiaro dal contesto.
// Estratto da segnalazioni-board.tsx per essere riusato anche in
// tickets-board.tsx invece di duplicarlo — stessa logica identica.
export function SuggerimentoCampo({ testo }: { testo: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 transition hover:text-primary"
          aria-label="Aiuto"
        >
          <HelpCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </TooltipTrigger>
      <TooltipContent>{testo}</TooltipContent>
    </Tooltip>
  );
}
