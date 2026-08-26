"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";
import { RapportinoFormEsterno } from "@/components/pose/rapportino-form";
import type { Ticket } from "@/lib/types";

export function InterventoDettaglio({ ticket }: { ticket: Ticket }) {
  const router = useRouter();
  const [salvato, setSalvato] = useState(false);

  if (salvato) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-6 text-center">
        <Check className="h-8 w-8 text-success" strokeWidth={2.5} />
        <p className="font-semibold text-success">Rapportino salvato, intervento completato.</p>
        <button type="button" onClick={() => router.push("/pose")} className="text-sm font-semibold text-primary hover:underline">
          Torna ai tuoi interventi
        </button>
      </div>
    );
  }

  return (
    <RapportinoFormEsterno
      ticketId={ticket.id}
      ticketNumero={ticket.numero}
      statoVecchio={ticket.stato}
      onSalvato={() => setSalvato(true)}
    />
  );
}
