"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Phone, AtSign, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { creaTecnicoEsterno, aggiornaTecnicoEsterno } from "@/app/(app)/tecnici-esterni/actions";
import type { TecnicoEsterno } from "@/lib/types";

// ★ NUOVA (2026-08-26) — bacheca admin per i tecnici esterni
// (pose.donewifi.it). Stesso pattern Dialog per creare/modificare già usato
// per Persone.
//
// ★ FIX (2026-08-26, richiesta esplicita) — "nome utente che definiamo noi
// e la password la segniamo noi": niente più password provvisoria
// generata a caso da mostrare una volta sola — l'admin sceglie username e
// password direttamente nel form, e li segna dove preferisce.
export function TecniciEsterniBoard({ tecnici }: { tecnici: TecnicoEsterno[] }) {
  const router = useRouter();
  const [apertoNuovo, setApertoNuovo] = useState(false);
  const [modificaAperta, setModificaAperta] = useState<TecnicoEsterno | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Dialog open={apertoNuovo} onOpenChange={setApertoNuovo}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
              Nuovo tecnico
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuovo tecnico esterno</DialogTitle>
            </DialogHeader>
            <FormTecnico
              onSalvato={() => {
                setApertoNuovo(false);
                router.refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col gap-2">
        {tecnici.length === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nessun tecnico esterno ancora — crea il primo account con &quot;Nuovo tecnico&quot;.
          </p>
        )}
        {tecnici.map((t) => (
          <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3.5 shadow-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold">
                  {t.nome} {t.cognome}
                </p>
                {!t.attivo && <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">Disattivato</span>}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <AtSign className="h-3 w-3" strokeWidth={2.25} />
                  {t.username}
                </span>
                {t.telefono && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3 w-3" strokeWidth={2.25} />
                    {t.telefono}
                  </span>
                )}
                {t.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3 w-3" strokeWidth={2.25} />
                    {t.email}
                  </span>
                )}
              </div>
            </div>
            <Dialog open={modificaAperta?.id === t.id} onOpenChange={(v) => setModificaAperta(v ? t : null)}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  Modifica
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Modifica tecnico</DialogTitle>
                </DialogHeader>
                <FormTecnico
                  tecnico={t}
                  onSalvato={() => {
                    setModificaAperta(null);
                    router.refresh();
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>
        ))}
      </div>
    </div>
  );
}

function FormTecnico({ tecnico, onSalvato }: { tecnico?: TecnicoEsterno; onSalvato: () => void }) {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const base = {
      nome: String(dati.get("nome") || ""),
      cognome: String(dati.get("cognome") || ""),
      telefono: String(dati.get("telefono") || ""),
      username: String(dati.get("username") || ""),
      email: String(dati.get("email") || ""),
    };

    setInCorso(true);
    const risultato = tecnico
      ? await aggiornaTecnicoEsterno(tecnico.id, { ...base, attivo: dati.get("attivo") === "on", nuovaPassword: String(dati.get("password") || "") })
      : await creaTecnicoEsterno({ ...base, password: String(dati.get("password") || "") });
    setInCorso(false);
    if (risultato.errore) return setErrore(risultato.errore);
    onSalvato();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="nome">Nome *</Label>
          <Input id="nome" name="nome" required autoFocus defaultValue={tecnico?.nome} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="cognome">Cognome</Label>
          <Input id="cognome" name="cognome" defaultValue={tecnico?.cognome ?? ""} className="mt-1" />
        </div>
      </div>
      <div>
        <Label htmlFor="username">Nome utente *</Label>
        <Input id="username" name="username" required defaultValue={tecnico?.username} className="mt-1" autoComplete="off" />
        <p className="mt-1 text-xs text-muted-foreground">È quello con cui il tecnico accede a pose.donewifi.it — scegli tu cosa scrivere qui.</p>
      </div>
      <div>
        <Label htmlFor="password">{tecnico ? "Nuova password (lascia vuoto per non cambiarla)" : "Password *"}</Label>
        <Input id="password" name="password" type="text" required={!tecnico} defaultValue="" className="mt-1 font-mono" autoComplete="off" />
        <p className="mt-1 text-xs text-muted-foreground">Almeno 6 caratteri — decidila tu, segnatela dove preferisci: non verrà mostrata di nuovo.</p>
      </div>
      <div>
        <Label htmlFor="telefono">Telefono</Label>
        <Input id="telefono" name="telefono" defaultValue={tecnico?.telefono ?? ""} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="email">Email (facoltativa)</Label>
        <Input id="email" name="email" type="email" defaultValue={tecnico?.email ?? ""} className="mt-1" />
      </div>
      {tecnico && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="attivo" defaultChecked={tecnico.attivo} className="h-4 w-4 rounded border" />
          Account attivo
        </label>
      )}
      {errore && <p className="text-sm text-critical">{errore}</p>}
      <Button type="submit" disabled={inCorso}>
        {inCorso ? "Salvataggio..." : tecnico ? "Salva modifiche" : "Crea tecnico"}
      </Button>
    </form>
  );
}
