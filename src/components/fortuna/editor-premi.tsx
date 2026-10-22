"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Plus, Equal, Trash2, ImagePlus, Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BUCKET_PREMI, IMMAGINI_PREDEFINITE, type RigaPremio } from "@/lib/fortuna/premi";

const COLORI = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4d7c0f", "#475569", "#ea580c"];
const MAX_LATO = 1200;

const pct = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 1 });

/** Rimpicciolisce le foto grandi (una foto da telefono può pesare 8 MB) prima di caricarle. */
async function preparaImmagine(file: File): Promise<{ blob: Blob; tipo: string }> {
  const tipo = file.type === "image/png" ? "image/png" : "image/jpeg";
  const bmp = await createImageBitmap(file);
  const scala = Math.min(1, MAX_LATO / Math.max(bmp.width, bmp.height));
  if (scala === 1 && file.size < 1_500_000 && ["image/png", "image/jpeg"].includes(file.type)) return { blob: file, tipo: file.type };
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scala);
  canvas.height = Math.round(bmp.height * scala);
  const ctx = canvas.getContext("2d")!;
  if (tipo === "image/jpeg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, tipo, 0.88));
  if (!blob) throw new Error("Immagine non leggibile.");
  return { blob, tipo };
}

async function caricaImmagine(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Usa un'immagine PNG, JPG o WebP.");
  if (file.size > 15_000_000) throw new Error("L'immagine è troppo pesante (massimo 15 MB).");
  const { blob, tipo } = await preparaImmagine(file);

  const r = await fetch("/api/fortuna/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.errore ?? "Caricamento non riuscito.");

  const supabase = createClient(process.env.NEXT_PUBLIC_FORTUNA_SUPABASE_URL!, process.env.NEXT_PUBLIC_FORTUNA_SUPABASE_KEY!);
  const { error } = await supabase.storage.from(BUCKET_PREMI).uploadToSignedUrl(j.path, j.token, blob, { contentType: tipo });
  if (error) throw new Error("Caricamento non riuscito: " + error.message);
  return j.urlPubblico as string;
}

export function EditorPremi({
  iniziali,
  azioneSalva,
}: {
  iniziali: RigaPremio[];
  azioneSalva: (formData: FormData) => void | Promise<void>;
}) {
  const [righe, setRighe] = useState<RigaPremio[]>(iniziali);
  const [libreriaPer, setLibreriaPer] = useState<string | null>(null);
  const [inCaricamento, setInCaricamento] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const contatore = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const caricaPer = useRef<string | null>(null);

  const modifica = (chiave: string, patch: Partial<RigaPremio>) => setRighe((rs) => rs.map((r) => (r.chiave === chiave ? { ...r, ...patch } : r)));

  // un premio è "in gara" se ha percentuale > 0 e non è esaurito (stessa regola della funzione SQL)
  const inGara = (r: RigaPremio) => r.percentuale > 0 && (r.quantita === null || (r.rimanenti ?? 0) > 0 || r.id === undefined);
  const totale = useMemo(() => righe.filter(inGara).reduce((s, r) => s + r.percentuale, 0), [righe]);
  const reale = (r: RigaPremio) => (inGara(r) && totale > 0 ? (r.percentuale / totale) * 100 : 0);
  const tolleranza = Math.abs(totale - 100) < 0.015;

  function aggiungi() {
    contatore.current += 1;
    setRighe((rs) => [
      ...rs,
      { chiave: `nuovo-${contatore.current}`, nome: "", immagine: IMMAGINI_PREDEFINITE[0], percentuale: 0, quantita: null, rimanenti: null, emessi: 0, firmati: 0 },
    ]);
  }

  function dividiEquamente() {
    const attivi = righe.filter((r) => r.quantita === null || (r.rimanenti ?? 0) > 0 || r.id === undefined);
    if (!attivi.length) return;
    // in centesimi di punto, così la somma fa esattamente 100 (es. 3 prodotti: 33,34 + 33,33 + 33,33)
    const base = Math.floor(10000 / attivi.length);
    const resto = 10000 - base * attivi.length;
    const nuove = new Map(attivi.map((r, i) => [r.chiave, (base + (i < resto ? 1 : 0)) / 100]));
    setRighe((rs) => rs.map((r) => (nuove.has(r.chiave) ? { ...r, percentuale: nuove.get(r.chiave)! } : r)));
  }

  async function scelto(file: File | undefined) {
    const chiave = caricaPer.current;
    if (!file || !chiave) return;
    setErrore(null);
    setInCaricamento(chiave);
    try {
      modifica(chiave, { immagine: await caricaImmagine(file) });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Caricamento non riuscito.");
    } finally {
      setInCaricamento(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const nonValido = righe.some((r) => !r.nome.trim());

  return (
    <form action={azioneSalva} className="flex flex-col gap-4">
      <input type="hidden" name="premi" value={JSON.stringify(righe.map(({ id, nome, immagine, percentuale, quantita }) => ({ id, nome, immagine, percentuale, quantita })))} />
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => scelto(e.target.files?.[0])} />

      {/* barra riassuntiva: quanto pesa ogni premio nel sorteggio */}
      <div>
        <div className="flex h-4 overflow-hidden rounded-full bg-muted">
          {righe.map((r, i) =>
            reale(r) > 0 ? <div key={r.chiave} title={`${r.nome || "Senza nome"}: ${pct(reale(r))}%`} style={{ width: `${reale(r)}%`, background: COLORI[i % COLORI.length] }} /> : null,
          )}
        </div>
        <p className={`mt-2 text-sm ${tolleranza ? "text-emerald-600" : "text-amber-600"}`}>
          {righe.length === 0
            ? "Nessun prodotto: aggiungine uno."
            : tolleranza
              ? `Totale ${pct(totale)}% ✓`
              : `Totale ${pct(totale)}%: non fa 100, ma non è un problema. Le percentuali vengono riproporzionate (vedi «Uscirà nel…» su ogni prodotto).`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={aggiungi}><Plus />Aggiungi prodotto</Button>
        <Button type="button" variant="outline" onClick={dividiEquamente}><Equal />Dividi in parti uguali</Button>
      </div>

      {errore && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">{errore}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {righe.map((r, i) => {
          const esaurito = r.quantita !== null && r.id !== undefined && (r.rimanenti ?? 0) <= 0;
          return (
            <div key={r.chiave} className="flex flex-col gap-3 rounded-2xl border-2 bg-card p-4" style={{ borderColor: COLORI[i % COLORI.length] }}>
              <div className="flex gap-3">
                <div className="flex shrink-0 flex-col items-center gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.immagine} alt="" className="h-24 w-24 rounded-xl border object-cover" />
                  <button
                    type="button"
                    disabled={inCaricamento === r.chiave}
                    onClick={() => { caricaPer.current = r.chiave; fileRef.current?.click(); }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  >
                    <ImagePlus className="h-3 w-3" />{inCaricamento === r.chiave ? "Carico…" : "Carica immagine"}
                  </button>
                  <button type="button" onClick={() => setLibreriaPer(libreriaPer === r.chiave ? null : r.chiave)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                    <Images className="h-3 w-3" />Libreria
                  </button>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Input value={r.nome} onChange={(e) => modifica(r.chiave, { nome: e.target.value })} placeholder="Nome del prodotto (es. 2 mesi gratis)" maxLength={80} required />
                  <label className="flex items-center gap-2 text-sm font-medium">
                    Percentuale
                    <Input
                      type="number" min={0} max={100} step={0.1} value={r.percentuale}
                      onChange={(e) => modifica(r.chiave, { percentuale: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                      className="w-24"
                    />
                    %
                  </label>
                  <input type="range" min={0} max={100} step={1} value={r.percentuale} onChange={(e) => modifica(r.chiave, { percentuale: Number(e.target.value) })} className="w-full" style={{ accentColor: COLORI[i % COLORI.length] }} aria-label="Percentuale" />
                </div>
              </div>

              <p className="text-sm">
                {esaurito ? <b className="text-destructive">Esaurito: non esce più.</b> : <>Uscirà nel <b>{pct(reale(r))}%</b> dei casi.</>}
              </p>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={r.quantita === null} onChange={(e) => modifica(r.chiave, { quantita: e.target.checked ? null : Math.max(r.firmati, 10) })} />
                  Quantità illimitata
                </label>
                {r.quantita !== null && (
                  <label className="flex items-center gap-2">
                    Disponibili
                    <Input type="number" min={r.firmati} step={1} value={r.quantita} onChange={(e) => modifica(r.chiave, { quantita: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className="w-24" />
                  </label>
                )}
                {r.id && <span className="text-muted-foreground">emessi {r.emessi} · firmati {r.firmati}{r.rimanenti !== null ? ` · rimanenti ${r.rimanenti}` : ""}</span>}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-destructive"
                  onClick={() => {
                    if (r.emessi > 0 && !confirm("Questo prodotto ha già coupon emessi: non può essere cancellato, verrà messo allo 0% (non uscirà più). Continuare?")) return;
                    setRighe((rs) => rs.filter((x) => x.chiave !== r.chiave));
                  }}
                >
                  <Trash2 />Rimuovi
                </Button>
              </div>

              {libreriaPer === r.chiave && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  {IMMAGINI_PREDEFINITE.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={src} src={src} alt="" onClick={() => { modifica(r.chiave, { immagine: src }); setLibreriaPer(null); }} className={`h-14 w-14 cursor-pointer rounded-lg border-2 object-cover ${r.immagine === src ? "border-primary" : "border-transparent"}`} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <Button size="lg" disabled={nonValido || !!inCaricamento}>Salva prodotti</Button>
        {nonValido && <span className="text-sm text-destructive">Dai un nome a ogni prodotto.</span>}
      </div>
    </form>
  );
}
