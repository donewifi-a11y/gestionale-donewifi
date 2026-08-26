"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, KeyRound, Phone, Mail, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import {
  creaTecnicoEsterno,
  aggiornaTecnicoEsterno,
  reimpostaPasswordTecnicoEsterno,
} from "@/app/(app)/tecnici-esterni/actions";
import type { TecnicoEsterno } from "@/lib/types";

// ★ NUOVA (2026-08-26) — bacheca admin per i tecnici esterni
// (pose.donewifi.it). Stesso pattern "Dialog per creare/modificare +
// password provvisoria mostrata una volta sola" già usato per Persone.
export function TecniciEsterniBoard({ tecnici }: { tecnici: TecnicoEsterno[] }) {
  const router = useRouter();
  const [apertoNuovo, setApertoNuovo] = useState(false);
  const [modificaAperta, setModificaAperta] = useState<TecnicoEsterno | null>(null);
  const [passwordDaMostrare, setPasswordDaMostrare] = useState<{ nome: string; password: string } | null>(null);

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
              onSalvato={(password) => {
                setApertoNuovo(false);
                router.refresh();
                if (password) setPasswordDaMostrare({ nome: "il nuovo tecnico", password });
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
                <p className="font-semibold">{t.nome} {t.cognome}</p>
                {!t.attivo && <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">Disattivato</span>}
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" strokeWidth={2.25} />{t.email}</span>
                {t.telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" strokeWidth={2.25} />{t.telefono}</span>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <ResetPasswordButton tecnicoId={t.id} onFatto={(password) => setPasswordDaMostrare({ nome: t.nome, password })} />
              <Dialog open={modificaAperta?.id === t.id} onOpenChange={(v) => setModificaAperta(v ? t : null)}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">Modifica</Button>
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
          </div>
        ))}
      </div>

      <Dialog open={!!passwordDaMostrare} onOpenChange={(v) => !v && setPasswordDaMostrare(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password provvisoria</DialogTitle>
          </DialogHeader>
          {passwordDaMostrare && <PasswordProvvisoria nome={passwordDaMostrare.nome} password={passwordDaMostrare.password} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PasswordProvvisoria({ nome, password }: { nome: string; password: string }) {
  const [copiata, setCopiata] = useState(false);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-muted-foreground">
        Comunicala a {nome} (WhatsApp/email) — non verrà più mostrata dopo aver chiuso questa finestra. Il tecnico accede su{" "}
        <span className="font-semibold">pose.donewifi.it</span> con la sua email e questa password.
      </p>
      <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-3">
        <code className="flex-1 font-mono text-base font-bold tracking-wide">{password}</code>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(password);
            setCopiata(true);
            setTimeout(() => setCopiata(false), 2000);
          }}
        >
          {copiata ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />}
          {copiata ? "Copiata" : "Copia"}
        </Button>
      </div>
    </div>
  );
}

function ResetPasswordButton({ tecnicoId, onFatto }: { tecnicoId: string; onFatto: (password: string) => void }) {
  const [inCorso, startTransition] = useTransition();
  const toast = useToast();

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={inCorso}
      onClick={() =>
        startTransition(async () => {
          const risultato = await reimpostaPasswordTecnicoEsterno(tecnicoId);
          if (risultato.errore || !risultato.password) {
            toast(risultato.errore || "Errore imprevisto.");
            return;
          }
          onFatto(risultato.password);
        })
      }
    >
      <KeyRound className="h-3.5 w-3.5" strokeWidth={2.25} />
    </Button>
  );
}

function FormTecnico({
  tecnico,
  onSalvato,
}: {
  tecnico?: TecnicoEsterno;
  onSalvato: (passwordProvvisoria?: string) => void;
}) {
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const valori = {
      nome: String(dati.get("nome") || ""),
      cognome: String(dati.get("cognome") || ""),
      telefono: String(dati.get("telefono") || ""),
      email: String(dati.get("email") || ""),
    };

    setInCorso(true);
    if (tecnico) {
      const risultato = await aggiornaTecnicoEsterno(tecnico.id, { ...valori, attivo: dati.get("attivo") === "on" });
      setInCorso(false);
      if (risultato.errore) return setErrore(risultato.errore);
      onSalvato();
    } else {
      const risultato = await creaTecnicoEsterno(valori);
      setInCorso(false);
      if (risultato.errore) return setErrore(risultato.errore);
      onSalvato(risultato.password ?? undefined);
    }
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
        <Label htmlFor="email">Email *</Label>
        <Input id="email" name="email" type="email" required defaultValue={tecnico?.email} className="mt-1" />
        <p className="mt-1 text-xs text-muted-foreground">È l&apos;utente di accesso a pose.donewifi.it.</p>
      </div>
      <div>
        <Label htmlFor="telefono">Telefono</Label>
        <Input id="telefono" name="telefono" defaultValue={tecnico?.telefono ?? ""} className="mt-1" />
      </div>
      {tecnico && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="attivo" defaultChecked={tecnico.attivo} className="h-4 w-4 rounded border" />
          Account attivo
        </label>
      )}
      {!tecnico && (
        <p className="rounded-lg bg-info/10 p-2.5 text-xs text-info">
          Alla creazione viene generata una password provvisoria, mostrata una sola volta.
        </p>
      )}
      {errore && <p className="text-sm text-critical">{errore}</p>}
      <Button type="submit" disabled={inCorso}>
        {inCorso ? "Salvataggio..." : tecnico ? "Salva modifiche" : "Crea tecnico"}
      </Button>
    </form>
  );
}
