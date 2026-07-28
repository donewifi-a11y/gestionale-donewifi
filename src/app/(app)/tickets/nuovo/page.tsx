"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { creaTicket } from "../actions";
import { CATEGORIE_TICKET, REPARTI } from "@/lib/types";
import type { AreaAccesso, PrioritaTicket } from "@/lib/types";

export default function NuovoTicketPage() {
  const router = useRouter();
  const primoCampo = useRef<HTMLInputElement>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const cliente = String(dati.get("cliente") || "").trim();
    if (!cliente) {
      setErrore("Il nome del cliente è obbligatorio.");
      return;
    }
    setInCorso(true);
    try {
      await creaTicket({
        cliente,
        telefono: String(dati.get("telefono") || ""),
        email: String(dati.get("email") || ""),
        indirizzo: String(dati.get("indirizzo") || ""),
        categoria: String(dati.get("categoria") || CATEGORIE_TICKET[0]),
        problema: String(dati.get("problema") || ""),
        priorita: String(dati.get("priorita") || "Normale") as PrioritaTicket,
        reparto: String(dati.get("reparto") || REPARTI[0]) as AreaAccesso,
      });
      router.push("/tickets");
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore imprevisto.");
      setInCorso(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <Link
          href="/tickets"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          Torna ai Ticket
        </Link>
        <h1 className="font-heading mt-1 text-2xl font-bold tracking-tight">Nuovo Ticket</h1>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div>
          <Label htmlFor="cliente">Cliente *</Label>
          <Input ref={primoCampo} id="cliente" name="cliente" autoFocus required className="mt-1" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="telefono">Telefono</Label>
            <Input id="telefono" name="telefono" type="tel" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" className="mt-1" />
          </div>
        </div>

        <div>
          <Label htmlFor="indirizzo">Indirizzo</Label>
          <Input id="indirizzo" name="indirizzo" className="mt-1" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="categoria">Categoria</Label>
            <select id="categoria" name="categoria" defaultValue={CATEGORIE_TICKET[0]} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
              {CATEGORIE_TICKET.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="reparto">Reparto</Label>
            <select id="reparto" name="reparto" defaultValue={REPARTI[0]} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
              {REPARTI.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="priorita">Priorità</Label>
            <select id="priorita" name="priorita" defaultValue="Normale" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="Urgente">Urgente</option>
              <option value="Normale">Normale</option>
              <option value="Bassa">Bassa</option>
            </select>
          </div>
        </div>

        <div>
          <Label htmlFor="problema">Problema / Note</Label>
          <Textarea id="problema" name="problema" rows={4} className="mt-1" />
        </div>

        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Link href="/tickets">
            <Button type="button" variant="ghost">Annulla</Button>
          </Link>
          <Button type="submit" disabled={inCorso}>
            {inCorso ? "Creazione..." : "Crea Ticket"}
          </Button>
        </div>
      </form>
    </div>
  );
}
