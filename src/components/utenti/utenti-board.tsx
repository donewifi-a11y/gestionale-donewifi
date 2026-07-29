"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { creaStaff, aggiornaStaff } from "@/app/(app)/utenti/actions";
import type { StaffCompleto } from "@/app/(app)/utenti/page";
import type { AreaAccesso } from "@/lib/types";

const AREE = ["Tutto", "Admin", "Analisi Rete", "Commerciale", "Fatturazione"];

export function UtentiBoard({ staff, currentUserId }: { staff: StaffCompleto[]; currentUserId: string }) {
  const [nuovo, setNuovo] = useState(false);
  const [modifica, setModifica] = useState<StaffCompleto | null>(null);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setNuovo(true)}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Nuovo Utente
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nome / Email</th>
              <th className="px-4 py-3">Ruolo</th>
              <th className="px-4 py-3">Stato</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-3">
                  <div className="font-semibold">{s.nome || "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.email} {s.id === currentUserId && "(tu)"}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                    {s.area_accesso}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {s.attivo ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                      <Check className="h-3 w-3" strokeWidth={2.5} /> Attivo
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      Disattivato
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => setModifica(s)}>
                    Modifica
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Sheet open={nuovo} onOpenChange={setNuovo}>
        <SheetContent>
          <FormNuovoUtente onFatto={() => setNuovo(false)} />
        </SheetContent>
      </Sheet>

      <Sheet open={!!modifica} onOpenChange={(v) => !v && setModifica(null)}>
        <SheetContent>
          {modifica && <FormModificaUtente utente={modifica} onFatto={() => setModifica(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FormNuovoUtente({ onFatto }: { onFatto: () => void }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const email = String(dati.get("email") || "").trim();
    const password = String(dati.get("password") || "");
    if (!email || password.length < 6) {
      setErrore("Email obbligatoria e password di almeno 6 caratteri.");
      return;
    }
    setInCorso(true);
    const risultato = await creaStaff({
      email,
      password,
      nome: String(dati.get("nome") || ""),
      area_accesso: String(dati.get("area_accesso") || "Analisi Rete") as AreaAccesso,
    });
    setInCorso(false);
    if (risultato.errore) {
      setErrore(risultato.errore);
      return;
    }
    router.refresh();
    onFatto();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Nuovo Utente</SheetTitle>
        <SheetDescription>Crea un accesso al gestionale per un collega.</SheetDescription>
      </SheetHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-4">
        <div>
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" autoFocus className="mt-1" />
        </div>
        <div>
          <Label htmlFor="email">Email *</Label>
          <Input id="email" name="email" type="email" required className="mt-1" />
        </div>
        <div>
          <Label htmlFor="password">Password iniziale *</Label>
          <Input id="password" name="password" type="text" required minLength={6} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="area_accesso">Ruolo</Label>
          <select id="area_accesso" name="area_accesso" defaultValue="Analisi Rete" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
            {AREE.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}
        <Button type="submit" disabled={inCorso} className="mt-2">
          {inCorso ? "Creazione..." : "Crea Utente"}
        </Button>
      </form>
    </>
  );
}

function FormModificaUtente({ utente, onFatto }: { utente: StaffCompleto; onFatto: () => void }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    setInCorso(true);
    const risultato = await aggiornaStaff(utente.id, {
      nome: String(dati.get("nome") || ""),
      area_accesso: String(dati.get("area_accesso") || utente.area_accesso) as AreaAccesso,
      attivo: dati.get("attivo") === "on",
    });
    setInCorso(false);
    if (risultato.errore) {
      setErrore(risultato.errore);
      return;
    }
    router.refresh();
    onFatto();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{utente.email}</SheetTitle>
        <SheetDescription>Modifica ruolo e stato dell&apos;accesso.</SheetDescription>
      </SheetHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-4">
        <div>
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" defaultValue={utente.nome ?? ""} autoFocus className="mt-1" />
        </div>
        <div>
          <Label htmlFor="area_accesso">Ruolo</Label>
          <select id="area_accesso" name="area_accesso" defaultValue={utente.area_accesso} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
            {AREE.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="attivo" defaultChecked={utente.attivo} className="h-4 w-4" />
          Accesso attivo
        </label>
        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}
        <Button type="submit" disabled={inCorso} className="mt-2">
          {inCorso ? "Salvataggio..." : "Salva modifiche"}
        </Button>
      </form>
    </>
  );
}