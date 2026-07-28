"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RichiestaDatiForm({ segnalazioneId, giaInviato }: { segnalazioneId: string; giaInviato: boolean }) {
  const [inCorso, setInCorso] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [errore, setErrore] = useState("");
  const [nomeFile, setNomeFile] = useState("");

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
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-card p-8 text-center shadow-2xl">
        <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={2} />
        <p className="font-heading text-lg font-bold">Dati inviati</p>
        <p className="text-sm text-muted-foreground">Grazie! Il nostro staff procederà con la pratica.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-2xl sm:p-6">
      {giaInviato && (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          Risultano già dei dati inviati in precedenza. Puoi inviarli di nuovo per aggiornarli.
        </p>
      )}

      <div>
        <Label htmlFor="tipologiaCliente">Tipologia cliente</Label>
        <select id="tipologiaCliente" name="tipologiaCliente" autoFocus className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm">
          <option value="">Seleziona...</option>
          <option value="Privato">Privato</option>
          <option value="Azienda">Azienda</option>
        </select>
      </div>

      <div>
        <Label htmlFor="profiloInternet">Profilo internet richiesto</Label>
        <Input id="profiloInternet" name="profiloInternet" placeholder="Es. Fibra 1Gbps" className="mt-1 h-10" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="codiceFiscale">Codice Fiscale</Label>
          <Input id="codiceFiscale" name="codiceFiscale" className="mt-1 h-10" />
        </div>
        <div>
          <Label htmlFor="partitaIva">Partita IVA</Label>
          <Input id="partitaIva" name="partitaIva" className="mt-1 h-10" />
        </div>
      </div>

      <div>
        <Label htmlFor="iban">IBAN</Label>
        <Input id="iban" name="iban" className="mt-1 h-10" />
      </div>

      <div>
        <Label htmlFor="metodoPagamento">Metodo di pagamento</Label>
        <select id="metodoPagamento" name="metodoPagamento" className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm">
          <option value="">Seleziona...</option>
          <option value="SDD">Addebito diretto (SDD)</option>
          <option value="Bonifico">Bonifico</option>
          <option value="Carta">Carta</option>
        </select>
      </div>

      <div>
        <Label htmlFor="documenti">Documenti (documento d&apos;identità, ecc.)</Label>
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

      {errore && (
        <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          {errore}
        </p>
      )}

      <Button type="submit" disabled={inCorso} size="lg" className="mt-2">
        {inCorso ? "Invio in corso…" : "Invia dati"}
      </Button>
    </form>
  );
}