"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Wifi, Building2, Trash2, Loader2, Check, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatoVuoto } from "@/components/ui/stato-vuoto";
import { useToast } from "@/components/ui/toast";
import { creaLavorazione, cambiaStatoLavorazione, eliminaLavorazione } from "@/app/(app)/lavorazioni/actions";
import { CATEGORIE_LAVORAZIONE, STATI_LAVORAZIONE } from "@/lib/types";
import type { CategoriaLavorazione, LavorazioneInterna, Persona, StatoLavorazione } from "@/lib/types";

const ICONA_CATEGORIA: Record<CategoriaLavorazione, typeof Wifi> = { Rete: Wifi, Ufficio: Building2 };
const COLORE_CATEGORIA: Record<CategoriaLavorazione, string> = {
  Rete: "bg-[#3B6FA8]/10 text-[#3B6FA8] border-[#3B6FA8]/20",
  Ufficio: "bg-[#7A5CB8]/10 text-[#7A5CB8] border-[#7A5CB8]/20",
};

function giorniAperta(data: string) {
  const ms = Date.now() - new Date(data).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/** ★ NUOVA — richiesta esplicita: lavorazioni interne (Rete/Ufficio), non
 * pratiche cliente, assegnabili da un amministratore ad altro staff con
 * promemoria automatico se restano ferme (cron promemoria-lavorazioni).
 * Stesso linguaggio visivo/pattern già consolidato in Ticket/Segnalazioni
 * — bacheca a colonne per stato, un tab per categoria. */
export function LavorazioniBoard({
  lavorazioni,
  persone,
  currentPersonaId,
  isAdmin,
}: {
  lavorazioni: LavorazioneInterna[];
  persone: Persona[];
  currentPersonaId: string;
  isAdmin: boolean;
}) {
  const [categoria, setCategoria] = useState<CategoriaLavorazione>("Rete");
  const [nuova, setNuova] = useState(false);
  const [aperta, setAperta] = useState<LavorazioneInterna | null>(null);

  const trovaPersona = (id: string) => persone.find((p) => p.id === id) ?? null;

  const filtrate = useMemo(() => lavorazioni.filter((l) => l.categoria === categoria), [lavorazioni, categoria]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {CATEGORIE_LAVORAZIONE.map((c) => {
            const Icona = ICONA_CATEGORIA[c];
            const conteggio = lavorazioni.filter((l) => l.categoria === c && l.stato !== "Fatta").length;
            return (
              <Button key={c} size="sm" variant={categoria === c ? "default" : "outline"} onClick={() => setCategoria(c)}>
                <Icona className="h-3.5 w-3.5" strokeWidth={2.25} />
                {c}
                {conteggio > 0 && (
                  <span className="ml-0.5 rounded-full bg-black/15 px-1.5 text-[10px] font-bold tabular-nums">{conteggio}</span>
                )}
              </Button>
            );
          })}
        </div>
        <Button size="sm" onClick={() => setNuova(true)}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          Nuova lavorazione
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STATI_LAVORAZIONE.map((stato) => {
          const items = filtrate.filter((l) => l.stato === stato);
          return (
            <div key={stato} className="rounded-2xl bg-muted/50 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="font-heading text-sm font-bold">{stato}</span>
                <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground shadow-sm">
                  {items.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {items.length === 0 && <StatoVuoto icona={ClipboardList} titolo="Vuoto." compatto />}
                {items.map((l) => {
                  const assegnatario = trovaPersona(l.assegnato_a);
                  const giorni = giorniAperta(l.creato_il);
                  const ferma = stato !== "Fatta" && giorni >= 2;
                  return (
                    <div
                      key={l.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setAperta(l)}
                      onKeyDown={(e) => e.key === "Enter" && setAperta(l)}
                      className="cursor-pointer rounded-xl border bg-card p-3 text-left text-sm shadow-md transition hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40"
                    >
                      <div className="mb-1.5 font-semibold">{l.titolo}</div>
                      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-bold text-primary">
                          {assegnatario ? assegnatario.nome.slice(0, 2).toUpperCase() : "?"}
                        </span>
                        {assegnatario?.nome ?? "—"}
                      </div>
                      {ferma && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${
                            giorni >= 5 ? "bg-critical/10 text-critical" : "bg-warning/10 text-warning"
                          }`}
                        >
                          ⏳ Ferma da {giorni}g
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={nuova} onOpenChange={setNuova}>
        <DialogContent className="sm:max-w-md">
          <FormNuovaLavorazione
            persone={persone}
            currentPersonaId={currentPersonaId}
            isAdmin={isAdmin}
            categoriaIniziale={categoria}
            onFatto={() => setNuova(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!aperta} onOpenChange={(v) => !v && setAperta(null)}>
        <DialogContent className="sm:max-w-md">
          {aperta && (
            <DettaglioLavorazione
              lavorazione={aperta}
              persone={persone}
              isAdmin={isAdmin}
              onCambiata={(l) => setAperta(l)}
              onEliminata={() => setAperta(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormNuovaLavorazione({
  persone,
  currentPersonaId,
  isAdmin,
  categoriaIniziale,
  onFatto,
}: {
  persone: Persona[];
  currentPersonaId: string;
  isAdmin: boolean;
  categoriaIniziale: CategoriaLavorazione;
  onFatto: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [categoria, setCategoria] = useState<CategoriaLavorazione>(categoriaIniziale);
  const [titolo, setTitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [assegnatoA, setAssegnatoA] = useState(currentPersonaId);
  const [errore, setErrore] = useState("");
  const [inCorso, startTransizione] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrore("");
    if (!titolo.trim()) {
      setErrore("Il titolo è obbligatorio.");
      return;
    }
    startTransizione(async () => {
      const risultato = await creaLavorazione({ categoria, titolo, descrizione, assegnatoA });
      if (risultato.errore) {
        setErrore(risultato.errore);
        return;
      }
      toast("Lavorazione creata.", "successo");
      router.refresh();
      onFatto();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Nuova lavorazione</DialogTitle>
        <DialogDescription>Un compito interno — non una pratica cliente.</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-3 text-sm">
        <div>
          <Label>Categoria</Label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {CATEGORIE_LAVORAZIONE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoria(c)}
                className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold ${
                  categoria === c ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label htmlFor="titolo">Titolo *</Label>
          <input
            id="titolo"
            value={titolo}
            onChange={(e) => setTitolo(e.target.value)}
            autoFocus
            className="mt-1 h-11 w-full rounded-md border bg-background px-3 text-base sm:h-9 sm:text-sm"
          />
        </div>
        <div>
          <Label htmlFor="descrizione">Descrizione (facoltativa)</Label>
          <textarea
            id="descrizione"
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <Label htmlFor="assegnatoA">Assegnata a</Label>
          <select
            id="assegnatoA"
            value={assegnatoA}
            onChange={(e) => setAssegnatoA(e.target.value)}
            disabled={!isAdmin}
            className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-60"
          >
            {isAdmin ? (
              persone.map((p) => (
                <option key={p.id} value={p.id}>{p.id === currentPersonaId ? `${p.nome} (io)` : p.nome}</option>
              ))
            ) : (
              <option value={currentPersonaId}>Me stesso</option>
            )}
          </select>
          {!isAdmin && <p className="mt-1 text-[11px] text-muted-foreground">Solo un amministratore può assegnarla a qualcun altro.</p>}
        </div>
        {errore && <p className="text-xs text-critical">{errore}</p>}
        <Button type="submit" disabled={inCorso} className="mt-1 min-h-11">
          {inCorso && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />}
          {inCorso ? "Creazione in corso…" : "Crea lavorazione"}
        </Button>
      </form>
    </>
  );
}

function DettaglioLavorazione({
  lavorazione,
  persone,
  isAdmin,
  onCambiata,
  onEliminata,
}: {
  lavorazione: LavorazioneInterna;
  persone: Persona[];
  isAdmin: boolean;
  onCambiata: (l: LavorazioneInterna) => void;
  onEliminata: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [inCorsoStato, startStato] = useTransition();
  const [inCorsoElimina, startElimina] = useTransition();
  const assegnatario = persone.find((p) => p.id === lavorazione.assegnato_a);
  const assegnante = persone.find((p) => p.id === lavorazione.assegnato_da);
  const Icona = ICONA_CATEGORIA[lavorazione.categoria];

  function cambiaStato(nuovo: StatoLavorazione) {
    if (nuovo === lavorazione.stato) return;
    startStato(async () => {
      const risultato = await cambiaStatoLavorazione(lavorazione.id, nuovo);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      onCambiata({ ...lavorazione, stato: nuovo, completato_il: nuovo === "Fatta" ? new Date().toISOString() : null });
      toast(`Passata a "${nuovo}".`, "successo");
      router.refresh();
    });
  }

  function elimina() {
    if (!confirm(`Eliminare definitivamente la lavorazione "${lavorazione.titolo}"? L'operazione non è reversibile.`)) return;
    startElimina(async () => {
      const risultato = await eliminaLavorazione(lavorazione.id);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      toast("Lavorazione eliminata.", "successo");
      onEliminata();
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{lavorazione.titolo}</DialogTitle>
        <DialogDescription>
          <span className={`mr-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${COLORE_CATEGORIA[lavorazione.categoria]}`}>
            <Icona className="h-3 w-3" strokeWidth={2.5} />
            {lavorazione.categoria}
          </span>
          Assegnata a {assegnatario?.nome ?? "—"}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 text-sm">
        {lavorazione.descrizione && <p className="text-muted-foreground">{lavorazione.descrizione}</p>}

        <div className="flex flex-wrap gap-1.5">
          {STATI_LAVORAZIONE.map((s) => (
            <button
              key={s}
              disabled={inCorsoStato}
              onClick={() => cambiaStato(s)}
              className={`flex min-h-9 items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${
                s === lavorazione.stato
                  ? "border-primary bg-gradient-to-b from-primary to-[color-mix(in_oklch,var(--primary),black_14%)] text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:border-primary/40"
              }`}
            >
              {s === lavorazione.stato && s === "Fatta" && <Check className="h-3 w-3" strokeWidth={3} />}
              {s}
            </button>
          ))}
        </div>

        <div className="text-xs text-muted-foreground">
          Assegnata da {assegnante?.nome ?? "—"} il{" "}
          {new Date(lavorazione.creato_il).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
          {lavorazione.completato_il && (
            <>
              {" "}· Completata il{" "}
              {new Date(lavorazione.completato_il).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </>
          )}
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={elimina}
            disabled={inCorsoElimina}
            className="mt-1 flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-critical/30 px-3 py-3 text-xs font-semibold text-critical transition hover:bg-critical/10 disabled:opacity-50"
          >
            {inCorsoElimina ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />}
            {inCorsoElimina ? "Eliminazione in corso…" : "Elimina lavorazione"}
          </button>
        )}
      </div>
    </>
  );
}
