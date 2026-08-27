"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SuggerimentoCampo } from "@/components/ui/suggerimento-campo";
import { creaMateriale, aggiornaMateriale, eliminaMateriale } from "@/app/(app)/materiali/actions";
import { SelettoreVisibilitaSchede } from "@/components/materiali/selettore-visibilita-schede";
import { MagazzinoVista } from "@/components/materiali/magazzino-vista";
import { AntenneVista } from "@/components/materiali/antenne-vista";
import { AntenneEsterneVista } from "@/components/materiali/antenne-esterne-vista";
import { formattaValuta, prezzoPerTipoCliente } from "@/lib/types";
import type { AntennaInventario, MaterialeMagazzino } from "@/lib/types";
import type { SchedaDaTrasferireAntenne } from "@/app/(app)/materiali/actions";

const CATEGORIA_SENZA = "Senza categoria";

export function MaterialiBoard({
  materiali,
  antenne,
  daTrasferire,
  isAdmin,
  puoPrenotare,
}: {
  materiali: MaterialeMagazzino[];
  antenne: AntennaInventario[];
  daTrasferire: SchedaDaTrasferireAntenne[];
  isAdmin: boolean;
  puoPrenotare: boolean;
}) {
  const [nuovo, setNuovo] = useState(false);
  const [modifica, setModifica] = useState<MaterialeMagazzino | null>(null);
  // ★ NUOVA — richiesta esplicita: "quali materiali mostrare in Scheda di
  // lavoro" come schermata dedicata (tab a sé), poi estesa con Magazzino
  // (giacenza + avviso mancanza), Antenne (inventario per MAC) e "Da
  // trasferire" (coda di riserva verso il gestionale esterno antenne).
  const [vista, setVista] = useState<"catalogo" | "magazzino" | "antenne" | "trasferire" | "schede">("catalogo");

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
            onClick={() => setVista("magazzino")}
            className={`px-3 py-1.5 text-xs font-semibold transition ${vista === "magazzino" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            Magazzino
          </button>
          <button
            onClick={() => setVista("antenne")}
            className={`px-3 py-1.5 text-xs font-semibold transition ${vista === "antenne" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            Antenne
          </button>
          <button
            onClick={() => setVista("trasferire")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition ${vista === "trasferire" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
          >
            Da trasferire
            {daTrasferire.length > 0 && (
              <span
                className={`rounded-full px-1.5 text-[10px] font-bold ${vista === "trasferire" ? "bg-primary-foreground/20" : "bg-warning/15 text-warning"}`}
              >
                {daTrasferire.length}
              </span>
            )}
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
      ) : vista === "magazzino" ? (
        <MagazzinoVista materiali={materiali} isAdmin={isAdmin} />
      ) : vista === "antenne" ? (
        <AntenneVista antenne={antenne} isAdmin={isAdmin} puoPrenotare={puoPrenotare} />
      ) : vista === "trasferire" ? (
        <AntenneEsterneVista schede={daTrasferire} />
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
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold">{m.nome}</span>
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                            m.tipo_riga === "Comodato" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {m.tipo_riga}
                        </span>
                        {m.attivazione_predefinita && (
                          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                            ⚡ Attivazione {m.attivazione_predefinita}
                          </span>
                        )}
                      </div>
                      {m.descrizione && <div className="truncate text-xs text-muted-foreground">{m.descrizione}</div>}
                      <div className="text-xs text-muted-foreground">
                        {m.comodato_uso ? (
                          "Comodato d'uso gratuito"
                        ) : m.attivazione_predefinita ? (
                          <>{formattaValuta(m.prezzo_unitario)} — prezzo fisso, non ricalcolato</>
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

      {/* ★ FIX (2026-08, controllo d'oro) — ultimo popup a pannello laterale
      (Sheet) rimasto in Materiali, mentre il resto del gestionale è già
      uniformato al popup centrale (Dialog). */}
      <Dialog open={nuovo} onOpenChange={setNuovo}>
        <DialogContent>
          <FormMateriale categorieEsistenti={categorieEsistenti} onFatto={() => setNuovo(false)} isAdmin={isAdmin} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!modifica} onOpenChange={(v) => !v && setModifica(null)}>
        <DialogContent>
          {modifica && <FormMateriale materiale={modifica} categorieEsistenti={categorieEsistenti} onFatto={() => setModifica(null)} isAdmin={isAdmin} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormMateriale({
  materiale,
  categorieEsistenti,
  onFatto,
  isAdmin,
}: {
  materiale?: MaterialeMagazzino;
  categorieEsistenti: string[];
  onFatto: () => void;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [tipoRiga, setTipoRiga] = useState<MaterialeMagazzino["tipo_riga"]>(materiale?.tipo_riga ?? "Prodotto");
  const [attivazionePredefinita, setAttivazionePredefinita] = useState<MaterialeMagazzino["attivazione_predefinita"]>(
    materiale?.attivazione_predefinita ?? null
  );
  const comodato = tipoRiga === "Comodato";
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
      tipo_riga: tipoRiga,
      attivazione_predefinita: comodato ? null : attivazionePredefinita,
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
      <DialogHeader>
        <DialogTitle>{materiale ? materiale.nome : "Aggiungi Materiale"}</DialogTitle>
        <DialogDescription>Selezionabile nelle Schede di Installazione e Lavorazione Tecnica.</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
        <div>
          <Label htmlFor="tipo_riga">
            Classificazione <SuggerimentoCampo testo="Decide in quale dei tre gruppi questa voce compare nel passo Materiali della Scheda di Installazione/Lavorazione — Comodato forza il prezzo a € 0." />
          </Label>
          <div className="mt-1 flex overflow-hidden rounded-lg border">
            {(["Comodato", "Prodotto", "Servizio"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipoRiga(t)}
                className={`flex-1 px-2.5 py-2 text-xs font-semibold transition ${
                  tipoRiga === t ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {comodato && <p className="mt-1.5 text-xs text-muted-foreground">Apparato installato, non fatturato — prezzo sempre € 0.</p>}
        </div>
        {!comodato && (
          <div>
            <Label htmlFor="attivazione_predefinita">
              Attivazione predefinita <SuggerimentoCampo testo="Se scelto, questa voce si aggiunge da sola nella Scheda per il tipo cliente indicato — il prezzo qui sotto viene usato così com'è, senza applicare la formula IVA Privato/Business." />
            </Label>
            <select
              id="attivazione_predefinita"
              value={attivazionePredefinita ?? ""}
              onChange={(e) => setAttivazionePredefinita((e.target.value || null) as MaterialeMagazzino["attivazione_predefinita"])}
              className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Nessuna — voce scelta manualmente</option>
              <option value="Privato">Aggiungi da sola per clienti Privato</option>
              <option value="Business">Aggiungi da sola per clienti Business</option>
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="prezzo_unitario">{attivazionePredefinita ? "Prezzo finale (€)" : "Prezzo cliente Privato (€, IVA incl.)"}</Label>
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
            {attivazionePredefinita && (
              <p className="mt-1 text-xs text-muted-foreground">Usato così com&apos;è nella Scheda — non passa per la formula IVA Privato/Business.</p>
            )}
          </div>
          <div>
            <Label htmlFor="unita_misura">Unità di misura</Label>
            <Input id="unita_misura" name="unita_misura" defaultValue={materiale?.unita_misura ?? "pz"} placeholder="pz, mt..." className="mt-1" />
          </div>
        </div>
        {anteprima != null && !attivazionePredefinita && (
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
          {/* ★ FIX (2026-08-27, trovato in un audit) — eliminaMateriale() ora
          richiede un amministratore lato server (prima bastava essere
          staff attivo, l'unica eccezione a "elimina = admin" in tutto il
          gestionale): il pulsante segue la stessa regola invece di restare
          visibile a chi poi riceverebbe solo un errore al click. */}
          {materiale && isAdmin && (
            <Button type="button" variant="outline" disabled={inCorso} onClick={elimina} title="Elimina materiale" aria-label="Elimina materiale">
              <Trash2 className="h-4 w-4" strokeWidth={2.25} />
            </Button>
          )}
        </div>
      </form>
    </>
  );
}
