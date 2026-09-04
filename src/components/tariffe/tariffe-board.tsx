"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, AlertTriangle, Trash2, Copy, Percent, TriangleAlert, Ban, RotateCcw, Archive, Eye, EyeOff, Wifi, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatoVuoto } from "@/components/ui/stato-vuoto";
import { useToast } from "@/components/ui/toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  creaTariffa,
  aggiornaTariffa,
  eliminaTariffa,
  duplicaTariffa,
  impostaSottoscrivibileTariffa,
  impostaPubblicaTariffa,
  creaPromozione,
  aggiornaPromozione,
  eliminaPromozione,
} from "@/app/(app)/tariffe/actions";
import { prezziNettoLordo } from "@/lib/types";
import type { Promozione, Tariffa, TipoPromozione } from "@/lib/types";

const TIPOLOGIE: Tariffa["tipologia_cliente"][] = ["Tutti", "Privato", "Azienda"];
const TIPI_PROMO: TipoPromozione[] = ["Sconto % / mese", "Sconto fisso / mese", "Mesi omaggio", "Attivazione gratuita"];

// ★ NUOVA (2026-08) — richiesta esplicita: uniformare Tariffe al resto del
// gestionale — proposta con artifact (audit grafico completo), opzione
// "B · Card-row come Preventivi" scelta implicitamente ("fai come
// suggerito" = la consigliata). Badge component al posto di `<span>`
// ad-hoc, stesso principio di COLORE_STATO in preventivi-board.tsx.
const COLORE_STATO_PROMO: Record<"Attiva" | "Programmata" | "Scaduta", string> = {
  Attiva: "bg-success/10 text-success border-success/20",
  Programmata: "bg-primary/10 text-primary border-primary/20",
  Scaduta: "bg-muted text-muted-foreground border-transparent",
};

function statoPromozione(promo: Promozione): "Attiva" | "Programmata" | "Scaduta" {
  const oggi = new Date().toISOString().slice(0, 10);
  if (promo.a < oggi) return "Scaduta";
  if (promo.da > oggi) return "Programmata";
  return "Attiva";
}

export function TariffeBoard({ tariffe, promozioni, isAdmin }: { tariffe: Tariffa[]; promozioni: Promozione[]; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [nuova, setNuova] = useState(false);
  const [modifica, setModifica] = useState<Tariffa | null>(null);
  const [nuovaPromo, setNuovaPromo] = useState(false);
  const [modificaPromo, setModificaPromo] = useState<Promozione | null>(null);

  // ★ FIX (2026-08-31, controllo d'oro usabilità) — le 3 funzioni sotto non
  // davano MAI un riscontro: in caso di errore non succedeva letteralmente
  // nulla (nessun toast, nessun refresh), l'unico segnale era un clic senza
  // effetto apparente. Ora un fallimento si vede, e un successo lo conferma
  // — stesso standard già in uso nel resto del gestionale.
  async function duplica(t: Tariffa) {
    const risultato = await duplicaTariffa(t.id);
    if (risultato.errore) {
      toast(risultato.errore);
      return;
    }
    toast("Tariffa duplicata.", "successo");
    router.refresh();
  }

  async function toggleSottoscrivibile(t: Tariffa) {
    const risultato = await impostaSottoscrivibileTariffa(t.id, !t.attivo);
    if (risultato.errore) {
      toast(risultato.errore);
      return;
    }
    toast(t.attivo ? "Tariffa resa non sottoscrivibile." : "Tariffa resa sottoscrivibile.", "successo");
    router.refresh();
  }

  async function togglePubblica(t: Tariffa) {
    const risultato = await impostaPubblicaTariffa(t.id, !t.pubblica);
    if (risultato.errore) {
      toast(risultato.errore);
      return;
    }
    toast(t.pubblica ? "Tariffa resa non pubblica." : "Tariffa resa pubblica.", "successo");
    router.refresh();
  }

  // ★ come nel vecchio gestionale: avviso se una tariffa ha più promo attive insieme (rischio di sconti che si sommano per errore).
  const promoAttive = promozioni.filter((p) => statoPromozione(p) === "Attiva");
  const tariffeConPiuPromo = tariffe.filter((t) => promoAttive.filter((p) => p.tariffe_ids.includes(t.id)).length > 1);

  const tariffeAttive = tariffe.filter((t) => t.attivo);
  const tariffeNonSottoscrivibili = tariffe.filter((t) => !t.attivo);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setNuova(true)}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Aggiungi Tariffa
        </Button>
      </div>

      <h2 className="mb-2 font-heading text-sm font-bold text-muted-foreground">
        Attive ({tariffeAttive.length}) — proposte ai nuovi clienti
      </h2>
      {tariffeAttive.length === 0 ? (
        <StatoVuoto icona={Wifi} titolo="Nessuna tariffa attiva ancora." compatto />
      ) : (
        <div className="mb-8 flex flex-col gap-2">
          {tariffeAttive.map((t) => (
            <RigaTariffa
              key={t.id}
              t={t}
              onApri={() => setModifica(t)}
              onDuplica={() => duplica(t)}
              onToggle={() => toggleSottoscrivibile(t)}
              onTogglePubblica={() => togglePubblica(t)}
            />
          ))}
        </div>
      )}

      <Dialog open={nuova} onOpenChange={setNuova}>
        <DialogContent>
          <FormTariffa onFatto={() => setNuova(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!modifica} onOpenChange={(v) => !v && setModifica(null)}>
        <DialogContent>
          {modifica && <FormTariffa tariffa={modifica} isAdmin={isAdmin} onFatto={() => setModifica(null)} />}
        </DialogContent>
      </Dialog>

      <div className="mt-10 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Percent className="h-4 w-4 text-primary" strokeWidth={2.5} />
          <h2 className="font-heading text-lg font-bold">Promozioni</h2>
        </div>
        <Button onClick={() => setNuovaPromo(true)}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Aggiungi Promozione
        </Button>
      </div>

      {tariffeConPiuPromo.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 p-3.5 text-sm text-warning-foreground">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" strokeWidth={2.25} />
          <div>
            <span className="font-semibold">{tariffeConPiuPromo.map((t) => t.nome).join(", ")}</span>{" "}
            {tariffeConPiuPromo.length > 1 ? "hanno" : "ha"} più di una promozione attiva contemporaneamente — controlla
            che gli sconti non si sommino per errore.
          </div>
        </div>
      )}

      {promozioni.length === 0 ? (
        <StatoVuoto icona={Percent} titolo="Nessuna promozione ancora." compatto />
      ) : (
        <div className="flex flex-col gap-2">
          {promozioni.map((p) => {
            const stato = statoPromozione(p);
            return (
              <button
                key={p.id}
                onClick={() => setModificaPromo(p)}
                className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Tag className="h-4 w-4" strokeWidth={2.25} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{p.nome}</div>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.tipo}
                      {p.valore != null && ` · ${p.valore}`}
                      {p.codice && ` · codice ${p.codice}`} · {p.da} → {p.a}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={`shrink-0 ${COLORE_STATO_PROMO[stato]}`}>
                  {stato}
                </Badge>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={nuovaPromo} onOpenChange={setNuovaPromo}>
        <DialogContent>
          <FormPromozione tariffe={tariffe} onFatto={() => setNuovaPromo(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!modificaPromo} onOpenChange={(v) => !v && setModificaPromo(null)}>
        <DialogContent>
          {modificaPromo && <FormPromozione tariffe={tariffe} promozione={modificaPromo} isAdmin={isAdmin} onFatto={() => setModificaPromo(null)} />}
        </DialogContent>
      </Dialog>

      <div className="mt-10 border-t pt-6 text-center">
        <Link
          href="/tariffe/non-sottoscrivibili"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <Archive className="h-3.5 w-3.5" strokeWidth={2.25} />
          Tariffe non più sottoscrivibili ({tariffeNonSottoscrivibili.length}) →
        </Link>
      </div>
    </div>
  );
}

export function RigaTariffa({
  t,
  onApri,
  onDuplica,
  onToggle,
  onTogglePubblica,
}: {
  t: Tariffa;
  onApri: () => void;
  onDuplica: () => void;
  onToggle: () => void;
  onTogglePubblica: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm transition hover:border-primary/40 hover:shadow-md">
      <button onClick={onApri} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Wifi className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <div className="truncate font-semibold">{t.nome}</div>
          <p className="truncate text-xs text-muted-foreground">
            {t.tipologia_cliente}
            {t.velocita && ` · ${t.velocita}`}
            {t.prezzo_mensile != null && (() => {
              const { netto, lordo } = prezziNettoLordo(t.prezzo_mensile, t.iva_inclusa);
              return ` · €${lordo.toFixed(2)}/mese IVA incl. (€${netto.toFixed(2)} netto)`;
            })()}
            {t.prezzo_attivazione != null && ` · attivazione € ${t.prezzo_attivazione.toFixed(2)} una tantum`}
          </p>
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        {t.attivo && !t.pubblica && (
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20" title="Non compare nella documentazione inviata al cliente">
            Solo trattativa diretta
          </Badge>
        )}
        {t.attivo ? (
          <Badge variant="outline" className="bg-success/10 text-success border-success/20">Attiva</Badge>
        ) : (
          <Badge variant="outline" className="bg-muted text-muted-foreground border-transparent">Non sottoscrivibile</Badge>
        )}
        {t.attivo && (
          <Button
            size="icon"
            variant="ghost"
            title={t.pubblica ? "Nascondi dalla documentazione inviata al cliente" : "Mostra nella documentazione inviata al cliente"}
            aria-label={t.pubblica ? "Nascondi dalla documentazione inviata al cliente" : "Mostra nella documentazione inviata al cliente"}
            onClick={onTogglePubblica}
          >
            {t.pubblica ? <Eye className="h-3.5 w-3.5" strokeWidth={2.25} /> : <EyeOff className="h-3.5 w-3.5" strokeWidth={2.25} />}
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          title={t.attivo ? "Rendi non più sottoscrivibile" : "Riattiva (torna sottoscrivibile)"}
          aria-label={t.attivo ? "Rendi non più sottoscrivibile" : "Riattiva (torna sottoscrivibile)"}
          onClick={onToggle}
        >
          {t.attivo ? <Ban className="h-3.5 w-3.5" strokeWidth={2.25} /> : <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.25} />}
        </Button>
        <Button size="icon" variant="ghost" title="Duplica tariffa" aria-label="Duplica tariffa" onClick={onDuplica}>
          <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />
        </Button>
      </div>
    </div>
  );
}

export function FormTariffa({ tariffa, isAdmin = false, onFatto }: { tariffa?: Tariffa; isAdmin?: boolean; onFatto: () => void }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [prezzo, setPrezzo] = useState<string>(tariffa?.prezzo_mensile != null ? String(tariffa.prezzo_mensile) : "");
  const [ivaInclusa, setIvaInclusa] = useState(tariffa?.iva_inclusa ?? true);
  const anteprima = prezzo && !Number.isNaN(Number(prezzo)) ? prezziNettoLordo(Number(prezzo), ivaInclusa) : null;

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
      iva_inclusa: String(dati.get("iva_inclusa") || "si") === "si",
      prezzo_attivazione: dati.get("prezzo_attivazione") ? Number(dati.get("prezzo_attivazione")) : null,
      descrizione: String(dati.get("descrizione") || "").trim() || null,
      attivo: dati.get("attivo") === "on" || !tariffa,
      pubblica: dati.get("pubblica") === "on" || !tariffa,
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
      <DialogHeader>
        <DialogTitle>{tariffa ? tariffa.nome : "Aggiungi Tariffa"}</DialogTitle>
        <DialogDescription>Visibile nel form pubblico &quot;scegli il tuo piano&quot; per Nuovo Contratto.</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
            <Input
              id="prezzo_mensile"
              name="prezzo_mensile"
              type="number"
              step="0.01"
              value={prezzo}
              onChange={(e) => setPrezzo(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="prezzo_attivazione">Costo di attivazione una tantum (€)</Label>
          <Input
            id="prezzo_attivazione"
            name="prezzo_attivazione"
            type="number"
            step="0.01"
            defaultValue={tariffa?.prezzo_attivazione ?? ""}
            placeholder="Es. 77.87 — lascia vuoto se nessun costo di attivazione"
            className="mt-1"
          />
        </div>
        <div>
          <Label>Il prezzo mensile inserito è</Label>
          <div className="mt-1.5 flex gap-4">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="iva_inclusa"
                value="si"
                checked={ivaInclusa}
                onChange={() => setIvaInclusa(true)}
                className="h-3.5 w-3.5"
              />
              IVA inclusa (22%)
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="iva_inclusa"
                value="no"
                checked={!ivaInclusa}
                onChange={() => setIvaInclusa(false)}
                className="h-3.5 w-3.5"
              />
              IVA esclusa
            </label>
          </div>
          {anteprima && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              → € {anteprima.netto.toFixed(2)} netto · € {anteprima.lordo.toFixed(2)} IVA inclusa
            </p>
          )}
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
          <div className="flex flex-col gap-2 rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="attivo" defaultChecked={tariffa.attivo} className="h-4 w-4" />
              Sottoscrivibile dai nuovi clienti (se disattivi, la tariffa resta salvata per chi ce l&apos;ha già)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="pubblica" defaultChecked={tariffa.pubblica} className="h-4 w-4" />
              Compare nella documentazione inviata al cliente (se disattivi, resta sottoscrivibile ma solo su
              trattativa diretta)
            </label>
          </div>
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
          {tariffa && isAdmin && (
            <Button type="button" variant="outline" disabled={inCorso} onClick={elimina} title="Elimina (solo Admin)" aria-label="Elimina (solo Admin)">
              <Trash2 className="h-4 w-4" strokeWidth={2.25} />
            </Button>
          )}
        </div>
      </form>
    </>
  );
}

function FormPromozione({
  tariffe,
  promozione,
  isAdmin = false,
  onFatto,
}: {
  tariffe: Tariffa[];
  promozione?: Promozione;
  isAdmin?: boolean;
  onFatto: () => void;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const nome = String(dati.get("nome") || "").trim();
    if (!nome) return setErrore("Il nome è obbligatorio.");
    const da = String(dati.get("da") || "");
    const a = String(dati.get("a") || "");
    if (!da || !a) return setErrore("Imposta il periodo di validità (Da/A).");

    const payload = {
      nome,
      tipo: String(dati.get("tipo") || TIPI_PROMO[0]) as TipoPromozione,
      valore: dati.get("valore") ? Number(dati.get("valore")) : null,
      tariffe_ids: dati.getAll("tariffe_ids") as string[],
      da,
      a,
      codice: String(dati.get("codice") || "").trim() || null,
    };

    setInCorso(true);
    const risultato = promozione ? await aggiornaPromozione(promozione.id, payload) : await creaPromozione(payload);
    setInCorso(false);
    if (risultato.errore) return setErrore(risultato.errore);
    router.refresh();
    onFatto();
  }

  async function elimina() {
    if (!promozione || !confirm(`Eliminare la promozione "${promozione.nome}"?`)) return;
    setInCorso(true);
    const risultato = await eliminaPromozione(promozione.id);
    setInCorso(false);
    if (risultato.errore) return setErrore(risultato.errore);
    router.refresh();
    onFatto();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{promozione ? promozione.nome : "Aggiungi Promozione"}</DialogTitle>
        <DialogDescription>Lo stato (Attiva/Programmata/Scaduta) si calcola da sé dalle date.</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="nome">Nome promozione *</Label>
          <Input id="nome" name="nome" defaultValue={promozione?.nome} autoFocus required className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="tipo">Tipo</Label>
            <select id="tipo" name="tipo" defaultValue={promozione?.tipo ?? TIPI_PROMO[0]} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
              {TIPI_PROMO.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="valore">Valore</Label>
            <Input id="valore" name="valore" type="number" step="0.01" defaultValue={promozione?.valore ?? ""} placeholder="Es. 20" className="mt-1" />
          </div>
        </div>
        <div>
          <Label>Piani applicabili *</Label>
          <div className="mt-1.5 flex flex-col gap-1.5 rounded-md border p-2.5">
            {tariffe.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="tariffe_ids" value={t.id} defaultChecked={promozione?.tariffe_ids.includes(t.id)} className="h-4 w-4" />
                {t.nome}
              </label>
            ))}
            {tariffe.length === 0 && <p className="text-xs text-muted-foreground">Crea prima almeno una tariffa.</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="da">Valida dal *</Label>
            <Input id="da" name="da" type="date" defaultValue={promozione?.da} required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="a">Al *</Label>
            <Input id="a" name="a" type="date" defaultValue={promozione?.a} required className="mt-1" />
          </div>
        </div>
        <div>
          <Label htmlFor="codice">Codice promo (facoltativo)</Label>
          <Input id="codice" name="codice" defaultValue={promozione?.codice ?? ""} placeholder="Es. ESTATE2026" className="mt-1" />
        </div>
        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}
        <div className="mt-2 flex gap-2">
          <Button type="submit" disabled={inCorso} className="flex-1">
            {inCorso ? "Salvataggio..." : promozione ? "Salva modifiche" : "Aggiungi"}
          </Button>
          {promozione && isAdmin && (
            <Button type="button" variant="outline" disabled={inCorso} onClick={elimina} title="Elimina (solo Admin)" aria-label="Elimina (solo Admin)">
              <Trash2 className="h-4 w-4" strokeWidth={2.25} />
            </Button>
          )}
        </div>
      </form>
    </>
  );
}
