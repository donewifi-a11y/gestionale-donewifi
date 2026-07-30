"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validaIban } from "@/lib/validazione";
import type { SlugRichiestaCliente } from "@/lib/richieste-cliente-config";
import { RICHIESTE_CLIENTE_CONFIG } from "@/lib/richieste-cliente-config";

export function RichiestaClienteForm({ slug, ticketId }: { slug: SlugRichiestaCliente; ticketId: string | null }) {
  const config = RICHIESTE_CLIENTE_CONFIG[slug];
  const [inCorso, setInCorso] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [errore, setErrore] = useState("");
  const [nomeFile, setNomeFile] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);

    const nomeCliente = String(dati.get("nomeCliente") || "").trim();
    if (!nomeCliente) return setErrore("Il nome è obbligatorio.");
    if (config.validaIban) {
      const iban = String(dati.get(config.campoNome) || "").trim();
      const esito = validaIban(iban);
      if (!esito.valido) return setErrore(esito.messaggio);
    }
    if (!dati.get("consenso")) return setErrore("Devi accettare l'informativa privacy per proseguire.");

    setInCorso(true);
    dati.set("tipo", config.tipo);
    if (ticketId) dati.set("ticketId", ticketId);
    try {
      const risposta = await fetch("/api/richiesta-cliente", { method: "POST", body: dati });
      const risultato = await risposta.json();
      if (!risposta.ok) throw new Error(risultato.errore || "Errore imprevisto.");
      setInviato(true);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore imprevisto.");
    } finally {
      setInCorso(false);
    }
  }

  if (inviato) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-card p-8 text-center shadow-2xl">
        <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={2} />
        <p className="font-heading text-lg font-bold">Richiesta inviata</p>
        <p className="text-sm text-muted-foreground">Grazie! Il nostro staff procederà con la pratica.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-2xl sm:p-6">
      <div>
        <Label htmlFor="nomeCliente">Nome e cognome (o ragione sociale) *</Label>
        <Input id="nomeCliente" name="nomeCliente" autoFocus required className="mt-1 h-10" />
      </div>

      <div>
        <Label htmlFor={config.campoNome}>{config.campoLabel}</Label>
        <Input id={config.campoNome} name={config.campoNome} placeholder={config.campoPlaceholder} className="mt-1 h-10" />
      </div>

      <div>
        <Label htmlFor="documenti">Documento d&apos;identità</Label>
        <label
          htmlFor="documenti"
          className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          <Upload className="h-4 w-4 shrink-0" strokeWidth={2.25} />
          <span className="truncate">{nomeFile || "Scegli uno o più file"}</span>
        </label>
        <input
          id="documenti"
          name="documenti"
          type="file"
          multiple
          className="hidden"
          onChange={(e) => setNomeFile(Array.from(e.target.files ?? []).map((f) => f.name).join(", "))}
        />
      </div>

      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" name="consenso" required className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Ho letto e accetto l&apos;
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
            informativa privacy
          </a>
          .
        </span>
      </label>

      {errore && (
        <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          {errore}
        </p>
      )}

      <Button type="submit" disabled={inCorso} size="lg" className="mt-2">
        {inCorso ? "Invio in corso…" : "Invia richiesta"}
      </Button>
    </form>
  );
}
