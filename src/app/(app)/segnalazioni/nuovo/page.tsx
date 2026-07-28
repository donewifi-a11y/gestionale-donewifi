"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { creaSegnalazione } from "../actions";
import type { Copertura } from "@/lib/types";

export default function NuovaSegnalazionePage() {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const nome = String(dati.get("nome") || "").trim();
    const telefono = String(dati.get("telefono") || "").trim();
    const via = String(dati.get("via") || "").trim();
    const civico = String(dati.get("civico") || "").trim();
    const comune = String(dati.get("comune") || "").trim();
    const cap = String(dati.get("cap") || "").trim();
    if (!nome || !telefono || !via || !civico || !comune || !cap) {
      setErrore("Nome, telefono e indirizzo completo sono obbligatori.");
      return;
    }
    setInCorso(true);
    try {
      await creaSegnalazione({
        nome,
        telefono,
        email: String(dati.get("email") || ""),
        via,
        civico,
        comune,
        cap,
        copertura: String(dati.get("copertura") || "daVerificare") as Copertura,
        note: String(dati.get("note") || ""),
      });
      router.push("/segnalazioni");
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore imprevisto.");
      setInCorso(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <Link
          href="/segnalazioni"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          Torna alle Segnalazioni
        </Link>
        <h1 className="font-heading mt-1 text-2xl font-bold tracking-tight">Nuova Segnalazione</h1>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
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
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" className="mt-1" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Label htmlFor="via">Via *</Label>
            <Input id="via" name="via" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="civico">Civico *</Label>
            <Input id="civico" name="civico" required className="mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="comune">Comune *</Label>
            <Input id="comune" name="comune" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="cap">CAP *</Label>
            <Input id="cap" name="cap" required className="mt-1" />
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
          <Button type="submit" disabled={inCorso}>
            {inCorso ? "Creazione..." : "Crea Segnalazione"}
          </Button>
        </div>
      </form>
    </div>
  );
}
