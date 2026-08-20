"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertTriangle, Lock, KeyRound, ShieldAlert, RefreshCw, Clock, Briefcase, Loader2, Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatoVuoto } from "@/components/ui/stato-vuoto";
import { useToast } from "@/components/ui/toast";
import {
  creaPersona,
  aggiornaPersona,
  reimpostaPasswordPersona,
  getAttivitaPersona,
  getCaricoPersona,
  type AttivitaPersona,
  type CaricoPersona,
} from "@/app/(app)/persone/actions";
import { UtentiBoard } from "@/components/utenti/utenti-board";
import type { StaffCompleto } from "@/app/(app)/utenti/page";
import { REPARTI, coloreReparto } from "@/lib/types";
import type { AreaAccesso, Persona } from "@/lib/types";

// ★ NUOVA (2026-08) — richiesta esplicita: uniformare Persone/Utenti al
// resto del gestionale — proposta con artifact (audit grafico completo),
// implementata la consigliata "B · tab dentro Persone": "Utenti" (accessi
// condivisi, sistema precedente) non è più una pagina a sé introvabile
// dal menu, ma una seconda tab qui — stesso pattern già in uso in
// Materiali (Catalogo/Magazzino/Antenne/Schede). La pagina /utenti resta
// comunque raggiungibile per compatibilità con eventuali link salvati,
// ma il punto d'ingresso vero è sempre questo.
export function PersoneBoard({ persone, staff, currentUserId }: { persone: Persona[]; staff: StaffCompleto[]; currentUserId: string }) {
  const [vista, setVista] = useState<"persone" | "utenti">("persone");
  const [nuova, setNuova] = useState(false);
  const [modifica, setModifica] = useState<Persona | null>(null);

  const senzaLogin = persone.filter((p) => p.attivo && !p.ha_login);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex overflow-hidden rounded-lg border">
          <button
            onClick={() => setVista("persone")}
            className={`px-3 py-1.5 text-xs font-semibold transition ${vista === "persone" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            Persone
          </button>
          <button
            onClick={() => setVista("utenti")}
            className={`px-3 py-1.5 text-xs font-semibold transition ${vista === "utenti" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            Accessi condivisi
          </button>
        </div>
        {vista === "persone" && (
          <Button onClick={() => setNuova(true)}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Aggiungi Persona
          </Button>
        )}
      </div>

      {vista === "utenti" ? (
        <UtentiBoard staff={staff} currentUserId={currentUserId} />
      ) : (
        <>
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

          {persone.length === 0 ? (
            <StatoVuoto icona={KeyRound} titolo="Nessuna persona ancora." compatto />
          ) : (
            <div className="flex flex-col gap-2">
              {persone.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setModifica(p)}
                  className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground">
                      {p.nome.slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <span className="truncate">{p.nome}</span>
                        {p.ha_login ? (
                          <KeyRound className="h-3 w-3 shrink-0 text-success" strokeWidth={2.25} />
                        ) : (
                          p.richiede_password && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" strokeWidth={2.25} />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        {p.amministratore ? (
                          "Amministratore"
                        ) : p.reparti.length > 0 ? (
                          p.reparti.map((r) => {
                            const colore = coloreReparto(r);
                            return colore ? (
                              <span key={r} className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${colore.sfondo} ${colore.testo}`}>
                                {r}
                              </span>
                            ) : (
                              <span key={r}>{r}</span>
                            );
                          })
                        ) : (
                          "Nessun reparto"
                        )}
                        {p.email && <span>· {p.email}</span>}
                      </div>
                    </div>
                  </div>
                  {p.attivo ? (
                    <Badge variant="outline" className="shrink-0 bg-success/10 text-success border-success/20">Attiva</Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 bg-muted text-muted-foreground border-transparent">Disattivata</Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={nuova} onOpenChange={setNuova}>
        <DialogContent>
          <FormNuovaPersona onFatto={() => setNuova(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!modifica} onOpenChange={(v) => !v && setModifica(null)}>
        <DialogContent>
          {modifica && <FormModificaPersona persona={modifica} onFatto={() => setModifica(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SelettoreAccesso({ amministratore = false, reparti = [] }: { amministratore?: boolean; reparti?: AreaAccesso[] }) {
  const [isAdmin, setIsAdmin] = useState(amministratore);

  return (
    <div>
      <Label>Livello di accesso</Label>
      <label className="mt-1.5 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="amministratore"
          defaultChecked={amministratore}
          onChange={(e) => setIsAdmin(e.target.checked)}
          className="h-4 w-4"
        />
        Amministratore (vede e gestisce tutto)
      </label>
      <div className={`mt-2 flex flex-col gap-1.5 ${isAdmin ? "opacity-40" : ""}`}>
        <p className="text-xs text-muted-foreground">Reparti (se non amministratore)</p>
        {REPARTI.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="reparti"
              value={r}
              defaultChecked={reparti.includes(r)}
              disabled={isAdmin}
              className="h-4 w-4"
            />
            {r}
          </label>
        ))}
      </div>
    </div>
  );
}

function FormNuovaPersona({ onFatto }: { onFatto: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [inCorso, startTransizione] = useTransition();
  const [errore, setErrore] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const nome = String(dati.get("nome") || "").trim();
    if (!nome) {
      setErrore("Il nome è obbligatorio.");
      return;
    }
    startTransizione(async () => {
      const risultato = await creaPersona({
        nome,
        email: String(dati.get("email") || ""),
        amministratore: dati.get("amministratore") === "on",
        reparti: dati.getAll("reparti") as AreaAccesso[],
        password: String(dati.get("password") || ""),
      });
      if (risultato.errore) {
        setErrore(risultato.errore);
        return;
      }
      toast(`${nome} aggiunto.`, "successo");
      router.refresh();
      onFatto();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Aggiungi Persona</DialogTitle>
        <DialogDescription>Un membro reale del team, con il proprio livello di accesso.</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
        <SelettoreAccesso />
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" placeholder="lascia vuoto per non attivare il login ora" className="mt-1" />
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
        <Button type="submit" disabled={inCorso} className="mt-2 min-h-11">
          {inCorso && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />}
          {inCorso ? "Creazione in corso…" : "Aggiungi"}
        </Button>
      </form>
    </>
  );
}

function FormModificaPersona({ persona, onFatto }: { persona: Persona; onFatto: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [inCorso, startTransizione] = useTransition();
  const [errore, setErrore] = useState("");
  const [reset, setReset] = useState<{ inCorso: boolean; password: string | null; errore: string | null; avviso?: string | null }>({
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
    setReset({ inCorso: false, password: risultato.password, errore: risultato.errore, avviso: risultato.avviso });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    startTransizione(async () => {
      const risultato = await aggiornaPersona(persona.id, {
        nome: String(dati.get("nome") || persona.nome),
        email: String(dati.get("email") ?? persona.email ?? ""),
        amministratore: dati.get("amministratore") === "on",
        reparti: dati.getAll("reparti") as AreaAccesso[],
        attivo: dati.get("attivo") === "on",
        password: String(dati.get("password") || ""),
      });
      if (risultato.errore) {
        setErrore(risultato.errore);
        return;
      }
      toast("Modifiche salvate.", "successo");
      router.refresh();
      onFatto();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{persona.nome}</DialogTitle>
        <DialogDescription>Modifica livello di accesso, stato e password.</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="nome">Nome e cognome</Label>
          <Input id="nome" name="nome" defaultValue={persona.nome} autoFocus className="mt-1" />
        </div>
        <div>
          <Label htmlFor="email">Email (facoltativa)</Label>
          <Input id="email" name="email" type="email" defaultValue={persona.email ?? ""} placeholder="nome.cognome@donewifi.it" className="mt-1" />
        </div>
        <SelettoreAccesso amministratore={persona.amministratore} reparti={persona.reparti} />
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
          <Input id="password" name="password" type="password" placeholder="lascia vuoto per non cambiarla" className="mt-1" />
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
              <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={onReset} disabled={reset.inCorso}>
                {reset.inCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.25} />}
                {reset.inCorso ? "Reimposto in corso…" : "Reimposta password"}
              </Button>
            </div>
            {reset.password && <RigaPasswordProvvisoria password={reset.password} nomePersona={persona.nome} />}
            {reset.errore && (
              <p className="mt-2 rounded-md bg-critical/10 p-2 text-xs text-critical">{reset.errore}</p>
            )}
            {reset.avviso && (
              <p className="mt-2 rounded-md bg-warning/10 p-2 text-xs text-warning">{reset.avviso}</p>
            )}
          </div>
        )}

        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}
        <Button type="submit" disabled={inCorso} className="mt-2 min-h-11">
          {inCorso && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />}
          {inCorso ? "Salvataggio in corso…" : "Salva modifiche"}
        </Button>
      </form>

      <div className="mb-4 flex flex-col gap-3 border-t pt-4">
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

// ★ NUOVA — richiesta esplicita (audit grafico completo): la password
// provvisoria era solo testo da selezionare a mano — un pulsante "copia"
// evita l'errore di trascrizione mentre la si comunica alla persona.
function RigaPasswordProvvisoria({ password, nomePersona }: { password: string; nomePersona: string }) {
  const toast = useToast();
  const [copiato, setCopiato] = useState(false);

  function copia() {
    navigator.clipboard.writeText(password);
    setCopiato(true);
    toast("Password copiata.", "successo");
  }

  return (
    <div className="mt-2 rounded-md bg-success/10 p-2 text-xs text-success">
      <p>
        Nuova password provvisoria: <span className="font-mono font-semibold">{password}</span> — comunicala a {nomePersona} e
        falla cambiare al primo accesso.
      </p>
      <button
        type="button"
        onClick={copia}
        className="mt-1.5 flex items-center gap-1 rounded-md border border-success/30 bg-card px-2 py-1 font-semibold text-success transition hover:bg-success/10"
      >
        {copiato ? <Check className="h-3 w-3" strokeWidth={2.5} /> : <Copy className="h-3 w-3" strokeWidth={2.25} />}
        {copiato ? "Copiata" : "Copia password"}
      </button>
    </div>
  );
}
