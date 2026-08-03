"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CATEGORIE_TICKET } from "@/lib/types";

export function PortaleTabs() {
  const [tab, setTab] = useState<"apri" | "verifica">("apri");

  return (
    <div className="rounded-2xl bg-card p-5 shadow-2xl sm:p-6">
      <div className="mb-5 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("apri")}
          className={`flex-1 rounded-lg py-2.5 text-xs font-bold uppercase tracking-wide transition ${
            tab === "apri" ? "bg-primary text-primary-foreground" : "border text-muted-foreground"
          }`}
        >
          Apri un Ticket
        </button>
        <button
          type="button"
          onClick={() => setTab("verifica")}
          className={`flex-1 rounded-lg py-2.5 text-xs font-bold uppercase tracking-wide transition ${
            tab === "verifica" ? "bg-primary text-primary-foreground" : "border text-muted-foreground"
          }`}
        >
          Verifica Stato
        </button>
      </div>
      {tab === "apri" ? <FormApriTicket /> : <FormVerificaStato />}
    </div>
  );
}

function FormApriTicket() {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [numeroCreato, setNumeroCreato] = useState<number | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const nome = String(dati.get("nome") || "").trim();
    const telefono = String(dati.get("telefono") || "").trim();
    const email = String(dati.get("email") || "").trim();
    if (nome.length < 2) return setErrore("Inserisci il tuo nome.");
    if (!telefono || !email) return setErrore("Inserisci sia il telefono sia l'email per essere ricontattato.");

    setInCorso(true);
    try {
      const risposta = await fetch("/api/portale/apri-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          telefono,
          email,
          categoria: String(dati.get("categoria") || ""),
          problema: String(dati.get("problema") || ""),
          trappola: String(dati.get("sito_web") || ""),
        }),
      });
      const risultato = await risposta.json();
      if (!risposta.ok) throw new Error(risultato.errore || "Errore imprevisto.");
      setNumeroCreato(risultato.numero);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore imprevisto.");
    } finally {
      setInCorso(false);
    }
  }

  if (numeroCreato) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={2} />
        <p className="font-heading text-lg font-bold">Ticket aperto</p>
        <span className="rounded-full bg-success/10 px-4 py-1.5 font-mono text-sm font-bold text-success">
          #{numeroCreato}
        </span>
        <p className="text-sm text-muted-foreground">
          Ti ricontatteremo al più presto. Conserva questo numero per verificare lo stato.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
      <input type="text" name="sito_web" tabIndex={-1} autoComplete="off" className="absolute -left-[9999px] h-0 opacity-0" />
      <div>
        <Label htmlFor="nome">Nome e cognome *</Label>
        <Input id="nome" name="nome" autoFocus required className="mt-1 h-10" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="telefono">Telefono *</Label>
          <Input id="telefono" name="telefono" type="tel" required placeholder="Es. 340 1234567" className="mt-1 h-10" />
        </div>
        <div>
          <Label htmlFor="email">Email *</Label>
          <Input id="email" name="email" type="email" required className="mt-1 h-10" />
        </div>
      </div>
      <div>
        <Label htmlFor="categoria">Tipo di richiesta *</Label>
        <select id="categoria" name="categoria" required defaultValue="" className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm">
          <option value="" disabled>Seleziona...</option>
          {CATEGORIE_TICKET.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="problema">Descrivi il problema o la richiesta</Label>
        <textarea id="problema" name="problema" rows={3} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
      </div>
      {errore && (
        <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          {errore}
        </p>
      )}
      <Button type="submit" disabled={inCorso} size="lg" className="mt-1">
        {inCorso ? "Invio in corso…" : "Apri Ticket"}
      </Button>
    </form>
  );
}

function FormVerificaStato() {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [risultato, setRisultato] = useState<{
    numero: number;
    cliente: string;
    categoria: string;
    stato: string;
    dataCreazione: string;
    esito: string | null;
  } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    setRisultato(null);
    const dati = new FormData(e.currentTarget);
    const numero = String(dati.get("numero") || "").trim();
    const telefono = String(dati.get("telefono") || "").trim();
    if (!numero || !telefono) return setErrore("Inserisci sia il numero del ticket sia il telefono.");

    setInCorso(true);
    try {
      const risposta = await fetch("/api/portale/verifica-stato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero, telefono }),
      });
      const dato = await risposta.json();
      if (!risposta.ok) throw new Error(dato.errore || "Errore imprevisto.");
      setRisultato(dato);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore imprevisto.");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <p className="text-xs text-muted-foreground">
          Inserisci il numero del ticket (ricevuto via email o al momento dell&apos;apertura) e il telefono registrato.
        </p>
        <div>
          <Label htmlFor="numero">Numero ticket</Label>
          <Input id="numero" name="numero" placeholder="Es. 128" className="mt-1 h-10" />
        </div>
        <div>
          <Label htmlFor="telefono">Telefono</Label>
          <Input id="telefono" name="telefono" type="tel" placeholder="Es. 340 1234567" className="mt-1 h-10" />
        </div>
        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}
        <Button type="submit" disabled={inCorso} size="lg" className="mt-1">
          <Search className="h-4 w-4" strokeWidth={2.5} />
          {inCorso ? "Ricerca…" : "Verifica"}
        </Button>
      </form>

      {risultato && (
        <div className="rounded-xl border bg-muted/40 p-4 text-center">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Ticket #{risultato.numero}
          </div>
          <div className="mt-0.5 font-heading text-base font-bold">{risultato.categoria}</div>
          <div className="text-xs text-muted-foreground">{risultato.cliente}</div>
          <span className="mt-3 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-bold text-primary">
            {risultato.stato}
          </span>
          {risultato.esito && (
            <p className="mt-3 text-left text-sm leading-relaxed">
              <span className="font-bold">Esito:</span> {risultato.esito}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
