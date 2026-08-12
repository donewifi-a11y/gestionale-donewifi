"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { creaMateriale, aggiornaMateriale, eliminaMateriale } from "@/app/(app)/materiali/actions";
import { SelettoreVisibilitaSchede } from "@/components/materiali/selettore-visibilita-schede";
import { formattaValuta, prezzoPerTipoCliente } from "@/lib/types";
import type { MaterialeMagazzino } from "@/lib/types";

const CATEGORIA_SENZA = "Senza categoria";

export function MaterialiBoard({ materiali }: { materiali: MaterialeMagazzino[] }) {
  const [nuovo, setNuovo] = useState(false);
  const [modifica, setModifica] = useState<MaterialeMagazzino | null>(null);
  // ★ NUOVA — richiesta esplicita: "quali materiali mostrare in Scheda di
  // lavoro" come schermata dedicata (tab a sé), non più solo il catalogo
  // prezzi generale.
  const [vista, setVista] = useState<"catalogo" | "schede">("catalogo");

  const categorieEsistenti = useMemo(
    () => Array.from(new Set(materiali.map((m) => m.categoria).filter((c): c is string => !!c))).sort(),
    [materiali]
  );

  const gruppi = useMemo(() => {
    const mappa = new Map<string, MaterialeMagazzino[]>();
    for (const m of materiali) {
      const chiave = m.categoria || CATEGORIA_SENZA;
      if (!mappa.has(chiave)) mappa.set(chiave, []);
      mappa.get(chiave)!.push(m);
    }
    return Array.from(mappa.entries()).sort(([a], [b]) => (a === CATEGORIA_SENZA ? 1 : b === CATEGORIA_SENZA ? -1 : a.localeCompare(b)));
  }, [materiali]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex overflow-hidden rounded-lg border">
          <button
            onClick={() => setVista("catalogo")}
            className={`px-3 py-1.5 text-xs font-semibold transition ${vista === "catalogo" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            Catalogo
          </button>
          <button
            onClick={() => setVista("schede")}
            className={`px-3 py-1.5 text-xs font-semibold transition ${vista === "schede" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            In Scheda di lavoro
          </button>
        </div>
        {vista === "catalogo" && (
          <Button onClick={() => setNuovo(true)}>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Aggiungi Materiale
          </Button>
        )}
      </div>

      {vista === "schede" ? (
        <SelettoreVisibilitaSchede materiali={materiali} />
      ) : (
        <>
          {materiali.length === 0 && (
            <p className="rounded-2xl border bg-card p-5 text-center text-sm text-muted-foreground shadow-sm">
              Nessun materiale ancora. Aggiungine uno sopra.
            </p>
          )}

          {gruppi.map(([categoria, voci]) => (
            <div key={categoria} className="mb-6">
              <h2 className="mb-2 font-heading text-xs font-bold uppercase tracking-wide text-muted-foreground">{categoria}</h2>
              <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                {voci.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModifica(m)}
                    className="flex w-full items-center justify-between gap-3 border-t p-3.5 text-left text-sm transition first:border-t-0 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold">{m.nome}</div>
                      {m.descrizione && <div className="truncate text-xs text-muted-foreground">{m.descrizione}</div>}
                      <div className="text-xs text-muted-foreground">
                        {m.comodato_uso ? (
                          "Comodato d'uso gratuito"
                        ) : (
                          <>
                            {formattaValuta(prezzoPerTipoCliente(m.prezzo_unitario, "Privato"))} privato · {formattaValuta(prezzoPerTipoCliente(m.prezzo_unitario, "Business"))} business
                            {m.unita_misura !== "pz" && ` / ${m.unita_misura}`}
                          </>
                        )}
                      </div>
                    </div>
                    {!m.attivo && (
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Disattivato</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      <Sheet open={nuovo} onOpenChange={setNuovo}>
        <SheetContent>
          <FormMateriale categorieEsistenti={categorieEsistenti} onFatto={() => setNuovo(false)} />
        </SheetContent>
      </Sheet>

      <Sheet open={!!modifica} onOpenChange={(v) => !v && setModifica(null)}>
        <SheetContent>
          {modifica && <FormMateriale materiale={modifica} categorieEsistenti={categorieEsistenti} onFatto={() => setModifica(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FormMateriale({
  materiale,
  categorieEsistenti,
  onFatto,
}: {
  materiale?: MaterialeMagazzino;
  categorieEsistenti: string[];
  onFatto: () => void;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [comodato, setComodato] = useState(materiale?.comodato_uso ?? false);
  const [prezzo, setPrezzo] = useState<string>(materiale?.prezzo_unitario != null ? String(materiale.prezzo_unitario) : "");
  const prezzoNumero = Number(prezzo);
  const anteprima = prezzo && !Number.isNaN(prezzoNumero) && !comodato ? prezzoNumero : null;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const nome = String(dati.get("nome") || "").trim();
    if (!nome) return setErrore("Il nome è obbligatorio.");

    const payload = {
      nome,
      categoria: String(dati.get("categoria") || "").trim() || null,
      descrizione: String(dati.get("descrizione") || "").trim() || null,
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
        <div>
          <Label htmlFor="categoria">Categoria</Label>
          <Input id="categoria" name="categoria" list="categorie-materiali" defaultValue={materiale?.categoria ?? ""} placeholder="Es. ATTIVAZIONI, CPE..." className="mt-1" />
          <datalist id="categorie-materiali">
            {categorieEsistenti.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div>
          <Label htmlFor="descrizione">Descrizione (facoltativa)</Label>
          <textarea id="descrizione" name="descrizione" rows={2} defaultValue={materiale?.descrizione ?? ""} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={comodato} onChange={(e) => setComodato(e.target.checked)} className="h-4 w-4" />
          Comodato d&apos;uso gratuito (prezzo sempre € 0)
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="prezzo_unitario">Prezzo cliente Privato (€, IVA incl.)</Label>
            <Input
              id="prezzo_unitario"
              name="prezzo_unitario"
              type="number"
              step="0.01"
              min="0"
              disabled={comodato}
              value={prezzo}
              onChange={(e) => setPrezzo(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="unita_misura">Unità di misura</Label>
            <Input id="unita_misura" name="unita_misura" defaultValue={materiale?.unita_misura ?? "pz"} placeholder="pz, mt..." className="mt-1" />
          </div>
        </div>
        {anteprima != null && (
          <p className="-mt-2 text-xs text-muted-foreground">
            → € {anteprima.toFixed(2)} cliente Privato · € {(anteprima * 1.22).toFixed(2)} cliente Business (IVA 22% aggiunta in fattura)
          </p>
        )}
        {materiale && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="attivo" defaultChecked={materiale.attivo} className="h-4 w-4" />
            Materiale attivo (presente nel listino/Preventivi)
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
