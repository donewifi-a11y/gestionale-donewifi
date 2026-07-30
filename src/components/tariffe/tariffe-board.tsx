"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertTriangle, Trash2 } from "lucide-react";
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
import { creaTariffa, aggiornaTariffa, eliminaTariffa } from "@/app/(app)/tariffe/actions";
import type { Tariffa } from "@/lib/types";

const TIPOLOGIE: Tariffa["tipologia_cliente"][] = ["Tutti", "Privato", "Azienda"];

export function TariffeBoard({ tariffe }: { tariffe: Tariffa[] }) {
  const [nuova, setNuova] = useState(false);
  const [modifica, setModifica] = useState<Tariffa | null>(null);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setNuova(true)}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Aggiungi Tariffa
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {tariffe.length === 0 && (
          <p className="p-5 text-center text-sm text-muted-foreground">Nessuna tariffa ancora. Aggiungine una sopra.</p>
        )}
        {tariffe.map((t) => (
          <button
            key={t.id}
            onClick={() => setModifica(t)}
            className="flex w-full items-center justify-between gap-3 border-t p-3.5 text-left text-sm transition first:border-t-0 hover:bg-muted/40"
          >
            <div>
              <div className="font-semibold">{t.nome}</div>
              <div className="text-xs text-muted-foreground">
                {t.tipologia_cliente}
                {t.velocita && ` · ${t.velocita}`}
                {t.prezzo_mensile != null && ` · €${t.prezzo_mensile}/mese`}
              </div>
            </div>
            {t.attivo ? (
              <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Attiva</span>
            ) : (
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Disattivata</span>
            )}
          </button>
        ))}
      </div>

      <Sheet open={nuova} onOpenChange={setNuova}>
        <SheetContent>
          <FormTariffa onFatto={() => setNuova(false)} />
        </SheetContent>
      </Sheet>

      <Sheet open={!!modifica} onOpenChange={(v) => !v && setModifica(null)}>
        <SheetContent>
          {modifica && <FormTariffa tariffa={modifica} onFatto={() => setModifica(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FormTariffa({ tariffa, onFatto }: { tariffa?: Tariffa; onFatto: () => void }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const nome = String(dati.get("nome") || "").trim();
    if (!nome) return setErrore("Il nome è obbligatorio.");

    const payload = {
      nome,
      tipologia_cliente: String(dati.get("tipologia_cliente") || "Tutti") as Tariffa["tipologia_cliente"],
      velocita: String(dati.get("velocita") || "").trim() || null,
      prezzo_mensile: dati.get("prezzo_mensile") ? Number(dati.get("prezzo_mensile")) : null,
      descrizione: String(dati.get("descrizione") || "").trim() || null,
      attivo: dati.get("attivo") === "on" || !tariffa,
      ordine: tariffa?.ordine ?? 0,
    };

    setInCorso(true);
    const risultato = tariffa ? await aggiornaTariffa(tariffa.id, payload) : await creaTariffa(payload);
    setInCorso(false);
    if (risultato.errore) return setErrore(risultato.errore);
    router.refresh();
    onFatto();
  }

  async function elimina() {
    if (!tariffa || !confirm(`Eliminare la tariffa "${tariffa.nome}"?`)) return;
    setInCorso(true);
    const risultato = await eliminaTariffa(tariffa.id);
    setInCorso(false);
    if (risultato.errore) return setErrore(risultato.errore);
    router.refresh();
    onFatto();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{tariffa ? tariffa.nome : "Aggiungi Tariffa"}</SheetTitle>
        <SheetDescription>Visibile nel form pubblico &quot;scegli il tuo piano&quot; per Nuovo Contratto.</SheetDescription>
      </SheetHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-4">
        <div>
          <Label htmlFor="nome">Nome piano *</Label>
          <Input id="nome" name="nome" defaultValue={tariffa?.nome} autoFocus required className="mt-1" />
        </div>
        <div>
          <Label htmlFor="tipologia_cliente">Tipologia cliente</Label>
          <select
            id="tipologia_cliente"
            name="tipologia_cliente"
            defaultValue={tariffa?.tipologia_cliente ?? "Tutti"}
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            {TIPOLOGIE.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="velocita">Velocità</Label>
            <Input id="velocita" name="velocita" defaultValue={tariffa?.velocita ?? ""} placeholder="Es. 1 Gbps" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="prezzo_mensile">Prezzo mensile (€)</Label>
            <Input id="prezzo_mensile" name="prezzo_mensile" type="number" step="0.01" defaultValue={tariffa?.prezzo_mensile ?? ""} className="mt-1" />
          </div>
        </div>
        <div>
          <Label htmlFor="descrizione">Descrizione</Label>
          <textarea
            id="descrizione"
            name="descrizione"
            defaultValue={tariffa?.descrizione ?? ""}
            rows={3}
            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        {tariffa && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="attivo" defaultChecked={tariffa.attivo} className="h-4 w-4" />
            Tariffa attiva (visibile ai clienti)
          </label>
        )}
        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}
        <div className="mt-2 flex gap-2">
          <Button type="submit" disabled={inCorso} className="flex-1">
            {inCorso ? "Salvataggio..." : tariffa ? "Salva modifiche" : "Aggiungi"}
          </Button>
          {tariffa && (
            <Button type="button" variant="outline" disabled={inCorso} onClick={elimina}>
              <Trash2 className="h-4 w-4" strokeWidth={2.25} />
            </Button>
          )}
        </div>
      </form>
    </>
  );
}
