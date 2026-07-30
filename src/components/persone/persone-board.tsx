"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertTriangle, Lock, KeyRound, ShieldAlert, RefreshCw, Clock, Briefcase } from "lucide-react";
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
import {
  creaPersona,
  aggiornaPersona,
  reimpostaPasswordPersona,
  getAttivitaPersona,
  getCaricoPersona,
  type AttivitaPersona,
  type CaricoPersona,
} from "@/app/(app)/persone/actions";
import type { AreaAccesso, Persona } from "@/lib/types";

const AREE: AreaAccesso[] = ["Tutto", "Admin", "Analisi Rete", "Commerciale", "Fatturazione"];

export function PersoneBoard({ persone }: { persone: Persona[] }) {
  const [nuova, setNuova] = useState(false);
  const [modifica, setModifica] = useState<Persona | null>(null);

  const senzaLogin = persone.filter((p) => p.attivo && !p.ha_login);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setNuova(true)}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Aggiungi Persona
        </Button>
      </div>

      {senzaLogin.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 p-3.5 text-sm text-warning-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={2.25} />
          <div>
            <div className="font-semibold">
              {senzaLogin.length} persona{senzaLogin.length > 1 ? "e" : ""} senza login individuale
            </div>
            <div className="text-xs text-muted-foreground">{senzaLogin.map((p) => p.nome).join(", ")}</div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {persone.length === 0 && (
          <p className="p-5 text-center text-sm text-muted-foreground">Nessuna persona ancora. Aggiungine una sopra.</p>
        )}
        {persone.map((p) => (
          <button
            key={p.id}
            onClick={() => setModifica(p)}
            className="flex w-full items-center justify-between gap-3 border-t p-3.5 text-left text-sm transition first:border-t-0 hover:bg-muted/40"
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                {p.nome.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <div className="flex items-center gap-1.5 font-semibold">
                  {p.nome}
                  {p.ha_login ? (
                    <KeyRound className="h-3 w-3 text-success" strokeWidth={2.25} />
                  ) : (
                    p.richiede_password && <Lock className="h-3 w-3 text-muted-foreground" strokeWidth={2.25} />
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {p.area_accesso}
                  {p.email && ` · ${p.email}`}
                  {p.ha_login && " · login individuale"}
                </div>
              </div>
            </div>
            {p.attivo ? (
              <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Attiva</span>
            ) : (
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Disattivata</span>
            )}
          </button>
        ))}
      </div>

      <Sheet open={nuova} onOpenChange={setNuova}>
        <SheetContent>
          <FormNuovaPersona onFatto={() => setNuova(false)} />
        </SheetContent>
      </Sheet>

      <Sheet open={!!modifica} onOpenChange={(v) => !v && setModifica(null)}>
        <SheetContent>
          {modifica && <FormModificaPersona persona={modifica} onFatto={() => setModifica(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FormNuovaPersona({ onFatto }: { onFatto: () => void }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const nome = String(dati.get("nome") || "").trim();
    if (!nome) {
      setErrore("Il nome è obbligatorio.");
      return;
    }
    setInCorso(true);
    const risultato = await creaPersona({
      nome,
      email: String(dati.get("email") || ""),
      area_accesso: String(dati.get("area_accesso") || "Analisi Rete") as AreaAccesso,
      password: String(dati.get("password") || ""),
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
        <SheetTitle>Aggiungi Persona</SheetTitle>
        <SheetDescription>Un membro reale del team, con il proprio livello di accesso.</SheetDescription>
      </SheetHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-4">
        <div>
          <Label htmlFor="nome">Nome e cognome *</Label>
          <Input id="nome" name="nome" autoFocus required className="mt-1" />
        </div>
        <div>
          <Label htmlFor="email">Email (facoltativa)</Label>
          <Input id="email" name="email" type="email" placeholder="nome.cognome@donewifi.it" className="mt-1" />
          <p className="mt-1 text-xs text-muted-foreground">
            Solo di contatto — indipendente dall&apos;email del login condiviso usato per accedere.
          </p>
        </div>
        <div>
          <Label htmlFor="area_accesso">Livello di accesso</Label>
          <select id="area_accesso" name="area_accesso" defaultValue="Analisi Rete" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
            {AREE.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="text" placeholder="lascia vuoto per non attivare il login ora" className="mt-1" />
          <p className="mt-1 text-xs text-muted-foreground">
            Con un&apos;email e una password, questa persona ottiene un accesso individuale reale (login diretto,
            non più solo un account condiviso + scelta &quot;Tu sei&quot;).
          </p>
        </div>
        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}
        <Button type="submit" disabled={inCorso} className="mt-2">
          {inCorso ? "Creazione..." : "Aggiungi"}
        </Button>
      </form>
    </>
  );
}

function FormModificaPersona({ persona, onFatto }: { persona: Persona; onFatto: () => void }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [reset, setReset] = useState<{ inCorso: boolean; password: string | null; errore: string | null }>({
    inCorso: false,
    password: null,
    errore: null,
  });
  const [attivita, setAttivita] = useState<AttivitaPersona[]>([]);
  const [carico, setCarico] = useState<CaricoPersona | null>(null);

  useEffect(() => {
    getAttivitaPersona(persona.id).then(setAttivita);
    getCaricoPersona(persona.id).then(setCarico);
  }, [persona.id]);

  async function onReset() {
    setReset({ inCorso: true, password: null, errore: null });
    const risultato = await reimpostaPasswordPersona(persona.id);
    setReset({ inCorso: false, password: risultato.password, errore: risultato.errore });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    setInCorso(true);
    const risultato = await aggiornaPersona(persona.id, {
      nome: String(dati.get("nome") || persona.nome),
      email: String(dati.get("email") ?? persona.email ?? ""),
      area_accesso: String(dati.get("area_accesso") || persona.area_accesso) as AreaAccesso,
      attivo: dati.get("attivo") === "on",
      password: String(dati.get("password") || ""),
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
        <SheetTitle>{persona.nome}</SheetTitle>
        <SheetDescription>Modifica livello di accesso, stato e password.</SheetDescription>
      </SheetHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-4">
        <div>
          <Label htmlFor="nome">Nome e cognome</Label>
          <Input id="nome" name="nome" defaultValue={persona.nome} autoFocus className="mt-1" />
        </div>
        <div>
          <Label htmlFor="email">Email (facoltativa)</Label>
          <Input id="email" name="email" type="email" defaultValue={persona.email ?? ""} placeholder="nome.cognome@donewifi.it" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="area_accesso">Livello di accesso</Label>
          <select id="area_accesso" name="area_accesso" defaultValue={persona.area_accesso} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
            {AREE.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="attivo" defaultChecked={persona.attivo} className="h-4 w-4" />
          Persona attiva
        </label>
        <div>
          <Label htmlFor="password">
            {persona.ha_login
              ? "Nuova password di accesso (lascia vuoto per non cambiarla)"
              : "Password (per attivare il login individuale)"}
          </Label>
          <Input id="password" name="password" type="text" placeholder="lascia vuoto per non cambiarla" className="mt-1" />
          {!persona.ha_login && (
            <p className="mt-1 text-xs text-muted-foreground">
              Serve anche l&apos;email qui sopra: con entrambe, questa persona ottiene un login diretto.
            </p>
          )}
        </div>

        {persona.ha_login && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Password dimenticata?</div>
              <Button type="button" variant="outline" size="sm" onClick={onReset} disabled={reset.inCorso}>
                <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.25} />
                {reset.inCorso ? "Reimposto..." : "Reimposta password"}
              </Button>
            </div>
            {reset.password && (
              <p className="mt-2 rounded-md bg-success/10 p-2 text-xs text-success">
                Nuova password provvisoria: <span className="font-mono font-semibold">{reset.password}</span> — comunicala a{" "}
                {persona.nome} e falla cambiare al primo accesso.
              </p>
            )}
            {reset.errore && (
              <p className="mt-2 rounded-md bg-critical/10 p-2 text-xs text-critical">{reset.errore}</p>
            )}
          </div>
        )}

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

      <div className="mx-4 mb-4 flex flex-col gap-3 border-t pt-4">
        {carico && (
          <div className="flex items-center gap-2.5 rounded-lg border bg-muted/30 p-3 text-sm">
            <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
            <div>
              <span className="font-semibold">{carico.attivi}</span> ticket attivi ·{" "}
              <span className="font-semibold">{carico.completatiMese}</span> completati questo mese
            </div>
          </div>
        )}

        {attivita.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Clock className="h-3.5 w-3.5" strokeWidth={2.25} />
              Attività recente
            </div>
            <ul className="flex flex-col gap-1.5">
              {attivita.map((a) => (
                <li key={a.id} className="rounded-md border bg-card px-2.5 py-1.5 text-xs">
                  <span className="text-muted-foreground">{new Date(a.data).toLocaleDateString("it-IT")}</span>{" "}
                  <span className="font-medium">{a.operazione}</span>{" "}
                  <span className="text-muted-foreground">({a.origine})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
