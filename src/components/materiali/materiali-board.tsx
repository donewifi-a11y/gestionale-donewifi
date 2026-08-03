"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { creaMateriale, aggiornaMateriale, eliminaMateriale } from "@/app/(app)/materiali/actions";
import type { MaterialeMagazzino } from "@/lib/types";

export function MaterialiBoard({ materiali }: { materiali: MaterialeMagazzino[] }) {
  const [nuovo, setNuovo] = useState(false);
  const [modifica, setModifica] = useState<MaterialeMagazzino | null>(null);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setNuovo(true)}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Aggiungi Materiale
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {materiali.length === 0 && (
          <p className="p-5 text-center text-sm text-muted-foreground">Nessun materiale ancora. Aggiungine uno sopra.</p>
        )}
        {materiali.map((m) => (
          <button
            key={m.id}
            onClick={() => setModifica(m)}
            className="flex w-full items-center justify-between gap-3 border-t p-3.5 text-left text-sm transition first:border-t-0 hover:bg-muted/40"
          >
            <div>
              <div className="font-semibold">{m.nome}</div>
              <div className="text-xs text-muted-foreground">
                {m.comodato_uso ? "Comodato d'uso gratuito" : `€${m.prezzo_unitario.toFixed(2)} / ${m.unita_misura}`}
              </div>
            </div>
            {!m.attivo && (
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Disattivato</span>
            )}
          </button>
        ))}
      </div>

      <Sheet open={nuovo} onOpenChange={setNuovo}>
        <SheetContent>
          <FormMateriale onFatto={() => setNuovo(false)} />
        </SheetContent>
      </Sheet>

      <Sheet open={!!modifica} onOpenChange={(v) => !v && setModifica(null)}>
        <SheetContent>
          {modifica && <FormMateriale materiale={modifica} onFatto={() => setModifica(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FormMateriale({ materiale, onFatto }: { materiale?: MaterialeMagazzino; onFatto: () => void }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [comodato, setComodato] = useState(materiale?.comodato_uso ?? false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const nome = String(dati.get("nome") || "").trim();
    if (!nome) return setErrore("Il nome è obbligatorio.");

    const payload = {
      nome,
      prezzo_unitario: comodato ? 0 : Number(dati.get("prezzo_unitario") || 0),
      unita_misura: String(dati.get("unita_misura") || "pz").trim() || "pz",
      comodato_uso: comodato,
      attivo: dati.get("attivo") === "on" || !materiale,
      ordine: materiale?.ordine ?? 0,
    };

    setInCorso(true);
    const risultato = materiale ? await aggiornaMateriale(materiale.id, payload) : await creaMateriale(payload);
    setInCorso(false);
    if (risultato.errore) return setErrore(risultato.errore);
    router.refresh();
    onFatto();
  }

  async function elimina() {
    if (!materiale || !confirm(`Eliminare il materiale "${materiale.nome}"?`)) return;
    setInCorso(true);
    const risultato = await eliminaMateriale(materiale.id);
    setInCorso(false);
    if (risultato.errore) return setErrore(risultato.errore);
    router.refresh();
    onFatto();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{materiale ? materiale.nome : "Aggiungi Materiale"}</SheetTitle>
        <SheetDescription>Selezionabile nelle Schede di Installazione e Lavorazione Tecnica.</SheetDescription>
      </SheetHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-4">
        <div>
          <Label htmlFor="nome">Nome *</Label>
          <Input id="nome" name="nome" defaultValue={materiale?.nome} autoFocus required className="mt-1" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={comodato} onChange={(e) => setComodato(e.target.checked)} className="h-4 w-4" />
          Comodato d&apos;uso gratuito (prezzo sempre € 0)
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="prezzo_unitario">Prezzo unitario (€, IVA escl.)</Label>
            <Input
              id="prezzo_unitario"
              name="prezzo_unitario"
              type="number"
              step="0.01"
              min="0"
              disabled={comodato}
              defaultValue={materiale?.prezzo_unitario ?? ""}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="unita_misura">Unità di misura</Label>
            <Input id="unita_misura" name="unita_misura" defaultValue={materiale?.unita_misura ?? "pz"} placeholder="pz, mt..." className="mt-1" />
          </div>
        </div>
        {materiale && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="attivo" defaultChecked={materiale.attivo} className="h-4 w-4" />
            Materiale attivo (selezionabile nelle schede)
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
            {inCorso ? "Salvataggio..." : materiale ? "Salva modifiche" : "Aggiungi"}
          </Button>
          {materiale && (
            <Button type="button" variant="outline" disabled={inCorso} onClick={elimina}>
              <Trash2 className="h-4 w-4" strokeWidth={2.25} />
            </Button>
          )}
        </div>
      </form>
    </>
  );
}
