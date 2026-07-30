"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConfermaBottone({ token }: { token: string }) {
  const [stato, setStato] = useState<"idle" | "inCorso" | "fatto" | "errore">("idle");
  const [errore, setErrore] = useState("");

  async function conferma() {
    setStato("inCorso");
    try {
      const risposta = await fetch(`/api/approva/${token}`, { method: "POST" });
      const risultato = await risposta.json();
      if (!risposta.ok) throw new Error(risultato.errore || "Errore imprevisto.");
      setStato("fatto");
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore imprevisto.");
      setStato("errore");
    }
  }

  if (stato === "fatto") {
    return (
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={2} />
        <p className="font-heading text-lg font-bold">Intervento confermato</p>
        <p className="text-sm text-muted-foreground">Grazie! Buona giornata da Done Wifi.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Button size="lg" disabled={stato === "inCorso"} onClick={conferma}>
        {stato === "inCorso" ? "Conferma in corso…" : "Conferma intervento"}
      </Button>
      {stato === "errore" && (
        <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          {errore}
        </p>
      )}
    </div>
  );
}
