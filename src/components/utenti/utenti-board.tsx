"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertTriangle, Check, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatoVuoto } from "@/components/ui/stato-vuoto";
import { creaStaff, aggiornaStaff } from "@/app/(app)/utenti/actions";
import type { StaffCompleto } from "@/app/(app)/utenti/page";
import type { AreaAccesso } from "@/lib/types";

const AREE = ["Tutto", "Admin", "Analisi Rete", "Commerciale", "Fatturazione"];

// ★ RIFINITA (2026-08) — richiesta esplicita: uniformare Utenti al resto
// del gestionale — proposta con artifact (audit grafico completo),
// implementata la consigliata: righe con avatar/icona e Badge component
// al posto della `<table>` grezza (era l'unica lista rimasta a tabella
// nativa), Sheet→Dialog per coerenza con tutti i popup del gestionale,
// conferma esplicita nel disattivare un accesso.
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

      {staff.length === 0 ? (
        <StatoVuoto icona={Users} titolo="Nessun accesso condiviso ancora." compatto />
      ) : (
        <div className="flex flex-col gap-2">
          {staff.map((s) => (
            <button
              key={s.id}
              onClick={() => setModifica(s)}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground">
                  {(s.nome || s.email).slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {s.nome || "—"} {s.id === currentUserId && <span className="text-xs font-normal text-muted-foreground">(tu)</span>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{s.email}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline" className="bg-accent text-accent-foreground border-transparent">
                  {s.area_accesso}
                </Badge>
                {s.attivo ? (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                    <Check className="h-3 w-3" strokeWidth={2.5} /> Attivo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted text-muted-foreground border-transparent">Disattivato</Badge>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={nuovo} onOpenChange={setNuovo}>
        <DialogContent>
          <FormNuovoUtente onFatto={() => setNuovo(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!modifica} onOpenChange={(v) => !v && setModifica(null)}>
        <DialogContent>
          {modifica && <FormModificaUtente utente={modifica} onFatto={() => setModifica(null)} />}
        </DialogContent>
      </Dialog>
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
      <DialogHeader>
        <DialogTitle>Nuovo Utente</DialogTitle>
        <DialogDescription>Crea un accesso al gestionale per un collega.</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
          <Input id="password" name="password" type="password" required minLength={6} className="mt-1" />
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
    const attivo = dati.get("attivo") === "on";
    // ★ NUOVA — richiesta esplicita: disattivare un accesso condiviso
    // avveniva senza nessun avviso distinto dal salvataggio normale —
    // stesso principio del confirm() già usato per le altre azioni
    // irreversibili/rischiose del gestionale.
    if (utente.attivo && !attivo && !confirm(`Disattivare l'accesso di ${utente.email}? Non potrà più accedere al gestionale.`)) return;
    setInCorso(true);
    const risultato = await aggiornaStaff(utente.id, {
      nome: String(dati.get("nome") || ""),
      area_accesso: String(dati.get("area_accesso") || utente.area_accesso) as AreaAccesso,
      attivo,
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
      <DialogHeader>
        <DialogTitle>{utente.email}</DialogTitle>
        <DialogDescription>Modifica ruolo e stato dell&apos;accesso.</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
