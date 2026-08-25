"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IndirizzoAutocomplete, type DettagliIndirizzo } from "@/components/condivisi/indirizzo-autocomplete";
import { creaSegnalazione } from "../actions";
import { validaEmail } from "@/lib/validazione";
import type { Copertura } from "@/lib/types";

export default function NuovaSegnalazionePage() {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [via, setVia] = useState("");
  const [comune, setComune] = useState("");
  const [cap, setCap] = useState("");
  const [tipologiaCliente, setTipologiaCliente] = useState<"Privato" | "Azienda">("Privato");
  const [datiInCorso, setDatiInCorso] = useState<Omit<Parameters<typeof creaSegnalazione>[0], "forza"> | null>(null);
  const [duplicati, setDuplicati] = useState<string[]>([]);

  function onSelezionaIndirizzo(d: DettagliIndirizzo) {
    setVia(d.via);
    if (d.comune) setComune(d.comune);
    if (d.cap) setCap(d.cap);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const nome = String(dati.get("nome") || "").trim();
    const telefono = String(dati.get("telefono") || "").trim();
    const civico = String(dati.get("civico") || "").trim();
    const email = String(dati.get("email") || "").trim();
    if (!nome || !telefono || !email || !via || !civico || !comune || !cap) {
      setErrore("Nome, telefono, email e indirizzo completo sono obbligatori.");
      return;
    }
    const esitoEmail = validaEmail(email);
    if (!esitoEmail.valido) {
      setErrore(esitoEmail.messaggio);
      return;
    }
    const datiSegnalazione = {
      nome,
      telefono,
      email,
      via,
      civico,
      comune,
      cap,
      copertura: String(dati.get("copertura") || "daVerificare") as Copertura,
      note: String(dati.get("note") || ""),
      tipologiaCliente,
    };
    setDuplicati([]);
    setInCorso(true);
    const risultato = await creaSegnalazione(datiSegnalazione);
    setInCorso(false);
    if (risultato.duplicati && risultato.duplicati.length > 0) {
      // ★ non è un errore bloccante: si mostra l'avviso e si tengono i dati
      // pronti per "Crea comunque", invece di far riscrivere tutto.
      setDatiInCorso(datiSegnalazione);
      setDuplicati(risultato.duplicati);
      return;
    }
    if (risultato.errore) {
      setErrore(risultato.errore);
      return;
    }
    router.push("/segnalazioni");
  }

  async function creaComunque() {
    if (!datiInCorso) return;
    setInCorso(true);
    const risultato = await creaSegnalazione({ ...datiInCorso, forza: true });
    setInCorso(false);
    if (risultato.errore) {
      setErrore(risultato.errore);
      return;
    }
    router.push("/segnalazioni");
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <Link
          href="/segnalazioni"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          Torna a Nuovi Clienti
        </Link>
        {/* ★ RINOMINATA (2026-08) — solo l'etichetta, vedi segnalazioni/page.tsx. */}
        <h1 className="font-heading mt-1 text-2xl font-bold tracking-tight">Nuovo Cliente</h1>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div>
          <Label>Tipologia Cliente</Label>
          <p className="mb-1.5 text-xs text-muted-foreground">Prima stima — il cliente la riconferma lui stesso più avanti nella Richiesta Dati.</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipologiaCliente("Privato")}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tipologiaCliente === "Privato" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
            >
              👤 Privato
            </button>
            <button
              type="button"
              onClick={() => setTipologiaCliente("Azienda")}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tipologiaCliente === "Azienda" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
            >
              🏢 Azienda
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="nome">Nome cliente *</Label>
            <Input id="nome" name="nome" autoFocus required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="telefono">Telefono *</Label>
            <Input id="telefono" name="telefono" type="tel" required className="mt-1" />
          </div>
        </div>

        <div>
          <Label htmlFor="email">Email *</Label>
          <Input id="email" name="email" type="email" required className="mt-1" />
          <p className="mt-1 text-xs text-muted-foreground">Serve per inviare la Richiesta Dati e le comunicazioni successive (contratto, ecc.).</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Label htmlFor="via">Via *</Label>
            <IndirizzoAutocomplete id="via" name="via" value={via} onChange={setVia} onSeleziona={onSelezionaIndirizzo} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="civico">Civico *</Label>
            <Input id="civico" name="civico" required className="mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="comune">Comune *</Label>
            <Input id="comune" name="comune" value={comune} onChange={(e) => setComune(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="cap">CAP *</Label>
            <Input id="cap" name="cap" value={cap} onChange={(e) => setCap(e.target.value)} required className="mt-1" />
          </div>
        </div>

        <div>
          <Label htmlFor="copertura">Copertura</Label>
          <select id="copertura" name="copertura" defaultValue="daVerificare" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
            <option value="daVerificare">Da verificare</option>
            <option value="si">Sì</option>
            <option value="no">No</option>
          </select>
        </div>

        <div>
          <Label htmlFor="note">Note</Label>
          <Textarea id="note" name="note" rows={3} className="mt-1" />
        </div>

        {duplicati.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg bg-warning/10 p-2.5 text-sm text-warning">
            <p className="flex items-start gap-2 font-semibold">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
              Telefono o email già presenti su un&apos;altra pratica:
            </p>
            <ul className="ml-6 list-disc">
              {duplicati.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            <p className="text-xs">Se è comunque un cliente diverso, puoi procedere lo stesso.</p>
          </div>
        )}

        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Link href="/segnalazioni">
            <Button type="button" variant="ghost">Annulla</Button>
          </Link>
          {duplicati.length > 0 ? (
            <Button type="button" variant="outline" className="border-warning text-warning hover:bg-warning/10" disabled={inCorso} onClick={creaComunque}>
              {inCorso ? "Creazione..." : "Crea comunque"}
            </Button>
          ) : (
            <Button type="submit" disabled={inCorso}>
              {inCorso ? "Creazione..." : "Crea Segnalazione"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
