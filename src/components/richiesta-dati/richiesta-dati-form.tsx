"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RichiestaDatiForm({ segnalazioneId, giaInviato }: { segnalazioneId: string; giaInviato: boolean }) {
  const [inCorso, setInCorso] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [errore, setErrore] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    setInCorso(true);
    const dati = new FormData(e.currentTarget);
    dati.set("segnalazioneId", segnalazioneId);
    try {
      const risposta = await fetch("/api/richiesta-dati", { method: "POST", body: dati });
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
      <div className="rounded-xl border bg-card p-6 text-center">
        <p className="text-lg font-semibold">✓ Dati inviati</p>
        <p className="mt-1 text-sm text-muted-foreground">Grazie! Il nostro staff procederà con la pratica.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      {giaInviato && (
        <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700 border border-amber-200">
          Risultano già dei dati inviati in precedenza. Puoi inviarli di nuovo per aggiornarli.
        </p>
      )}

      <div>
        <Label htmlFor="tipologiaCliente">Tipologia cliente</Label>
        <select id="tipologiaCliente" name="tipologiaCliente" autoFocus className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
          <option value="">Seleziona...</option>
          <option value="Privato">Privato</option>
          <option value="Azienda">Azienda</option>
        </select>
      </div>

      <div>
        <Label htmlFor="profiloInternet">Profilo internet richiesto</Label>
        <Input id="profiloInternet" name="profiloInternet" placeholder="Es. Fibra 1Gbps" className="mt-1" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="codiceFiscale">Codice Fiscale</Label>
          <Input id="codiceFiscale" name="codiceFiscale" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="partitaIva">Partita IVA</Label>
          <Input id="partitaIva" name="partitaIva" className="mt-1" />
        </div>
      </div>

      <div>
        <Label htmlFor="iban">IBAN</Label>
        <Input id="iban" name="iban" className="mt-1" />
      </div>

      <div>
        <Label htmlFor="metodoPagamento">Metodo di pagamento</Label>
        <select id="metodoPagamento" name="metodoPagamento" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
          <option value="">Seleziona...</option>
          <option value="SDD">Addebito diretto (SDD)</option>
          <option value="Bonifico">Bonifico</option>
          <option value="Carta">Carta</option>
        </select>
      </div>

      <div>
        <Label htmlFor="documenti">Documenti (documento d&apos;identità, ecc.)</Label>
        <input id="documenti" name="documenti" type="file" multiple className="mt-1 block w-full text-sm" />
      </div>

      {errore && <p className="text-sm font-medium text-red-600">{errore}</p>}

      <Button type="submit" disabled={inCorso} className="mt-2">
        {inCorso ? "Invio in corso..." : "Invia dati"}
      </Button>
    </form>
  );
}