"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

const TESTI = {
  intervento: { azione: "Conferma intervento", titolo: "Intervento confermato" },
  contratto: { azione: "Approvo il contratto", titolo: "Contratto approvato" },
  firma_scheda: { azione: "Confermo i lavori svolti", titolo: "Lavori confermati" },
} as const;

// ★ NUOVA — il preventivo è l'unico dei tre casi con due esiti possibili
// (il cliente può anche rifiutare, richiesta esplicita): due pulsanti
// invece di uno solo, `azione` viaggia nel corpo della POST e la route la
// usa per decidere quale stato scrivere. Gli altri due tipi continuano a
// non mandare corpo — la route li interpreta comunque come "approva".
export function ConfermaBottone({ token, tipo }: { token: string; tipo: "intervento" | "contratto" | "preventivo" | "firma_scheda" }) {
  const [stato, setStato] = useState<"idle" | "inCorso" | "approvato" | "rifiutato" | "errore">("idle");
  const [errore, setErrore] = useState("");

  async function conferma(azione: "approva" | "rifiuta") {
    setStato("inCorso");
    try {
      const risposta = await fetch(`/api/approva/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ azione }),
      });
      const risultato = await risposta.json();
      if (!risposta.ok) throw new Error(risultato.errore || "Errore imprevisto.");
      setStato(azione === "rifiuta" ? "rifiutato" : "approvato");
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore imprevisto.");
      setStato("errore");
    }
  }

  if (stato === "approvato") {
    const titolo = tipo === "preventivo" ? "Preventivo approvato" : TESTI[tipo as "intervento" | "contratto" | "firma_scheda"].titolo;
    return (
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={2} />
        <p className="font-heading text-lg font-bold">{titolo}</p>
        <p className="text-sm text-muted-foreground">Grazie! Buona giornata da Done Wifi.</p>
      </div>
    );
  }

  if (stato === "rifiutato") {
    return (
      <div className="flex flex-col items-center gap-2 py-2 text-center">
        <XCircle className="h-10 w-10 text-muted-foreground" strokeWidth={2} />
        <p className="font-heading text-lg font-bold">Preventivo rifiutato</p>
        <p className="text-sm text-muted-foreground">Grazie per averci fatto sapere. Se cambi idea o hai domande, scrivici pure.</p>
      </div>
    );
  }

  if (tipo === "preventivo") {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="flex gap-2">
          <Button size="lg" disabled={stato === "inCorso"} onClick={() => conferma("approva")}>
            {stato === "inCorso" ? "Invio…" : "Approvo il preventivo"}
          </Button>
          <Button size="lg" variant="outline" disabled={stato === "inCorso"} onClick={() => conferma("rifiuta")}>
            Rifiuto
          </Button>
        </div>
        {stato === "errore" && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}
      </div>
    );
  }

  const testi = TESTI[tipo];
  return (
    <div className="flex flex-col items-center gap-3">
      <Button size="lg" disabled={stato === "inCorso"} onClick={() => conferma("approva")}>
        {stato === "inCorso" ? "Conferma in corso…" : testi.azione}
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
