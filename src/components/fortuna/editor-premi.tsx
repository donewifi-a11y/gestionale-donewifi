"use client";

import { useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Plus, Equal, Trash2, ImagePlus, Images, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BUCKET_PREMI, IMMAGINI_PREDEFINITE, type RigaPremio } from "@/lib/fortuna/premi";
import { calcolaProbabilita, type ModalitaPremio } from "@/lib/fortuna/probabilita";

const COLORI = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#4d7c0f", "#475569", "#ea580c"];
const MAX_LATO = 1200;

/** 0,2% resta 0,2%: sotto l'1% servono i decimali, sopra basta uno. */
const pct = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: n < 1 ? 2 : 1 });

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

const MODALITA: { id: ModalitaPremio; etichetta: string }[] = [
  { id: "percentuale", etichetta: "Percentuale" },
  { id: "pezzi", etichetta: "A pezzi" },
];

export function EditorPremi({
  iniziali,
  previstiIniziali,
  azioneSalva,
}: {
  iniziali: RigaPremio[];
  previstiIniziali: number | null;
  azioneSalva: (formData: FormData) => void | Promise<void>;
}) {
  const [righe, setRighe] = useState<RigaPremio[]>(iniziali);
  const [previsti, setPrevisti] = useState<string>(previstiIniziali ? String(previstiIniziali) : "");
  const [libreriaPer, setLibreriaPer] = useState<string | null>(null);
  const [inCaricamento, setInCaricamento] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const contatore = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const caricaPer = useRef<string | null>(null);

  const modifica = (chiave: string, patch: Partial<RigaPremio>) => setRighe((rs) => rs.map((r) => (r.chiave === chiave ? { ...r, ...patch } : r)));
  const nPrevisti = Number(previsti) > 0 ? Math.floor(Number(previsti)) : null;

  // pezzi che resterebbero dopo il salvataggio (la scorta è già prenotata dai coupon emessi)
  const rimanentiDopo = (r: RigaPremio) => (r.quantita === null ? null : Math.max(0, r.quantita - r.emessi));

  const esito = useMemo(
    () =>
      calcolaProbabilita(
        righe.map((r) => ({ chiave: r.chiave, modalita: r.modalita, percentuale: r.percentuale, quantita: r.quantita, rimanenti: rimanentiDopo(r) })),
        nPrevisti,
      ),
    [righe, nPrevisti],
  );
  const reale = (r: RigaPremio) => (esito.perPremio.get(r.chiave) ?? 0) * 100;

  const haPezzi = righe.some((r) => r.modalita === "pezzi");
  const haPercentualeInGara = righe.some((r) => r.modalita === "percentuale" && r.percentuale > 0 && (r.quantita === null || (rimanentiDopo(r) ?? 0) > 0));
  const nessunPremio = Math.max(0, 1 - esito.somma) * 100;

  function aggiungi() {
    contatore.current += 1;
    setRighe((rs) => [
      ...rs,
      { chiave: `nuovo-${contatore.current}`, nome: "", immagine: IMMAGINI_PREDEFINITE[0], modalita: "percentuale", percentuale: 0, quantita: null, rimanenti: null, emessi: 0, firmati: 0, totali: 0 },
    ]);
  }

  function dividiEquamente() {
    // solo i prodotti a percentuale ancora in gara: i pezzi hanno la loro percentuale automatica
    const attivi = righe.filter((r) => r.modalita === "percentuale" && (r.quantita === null || (rimanentiDopo(r) ?? 0) > 0));
    if (!attivi.length) return;
    // in centesimi di punto, così la somma fa esattamente 100 (es. 3 prodotti: 33,34 + 33,33 + 33,33)
    const base = Math.floor(10000 / attivi.length);
    const resto = 10000 - base * attivi.length;
    const nuove = new Map(attivi.map((r, i) => [r.chiave, (base + (i < resto ? 1 : 0)) / 100]));
    setRighe((rs) => rs.map((r) => (nuove.has(r.chiave) ? { ...r, percentuale: nuove.get(r.chiave)! } : r)));
  }

  function cambiaModalita(r: RigaPremio, modalita: ModalitaPremio) {
    if (r.modalita === modalita) return;
    if (modalita === "pezzi") modifica(r.chiave, { modalita, quantita: Math.max(1, r.quantita ?? 1, r.emessi) });
    else modifica(r.chiave, { modalita, quantita: null });
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

  const nonValido = righe.some((r) => !r.nome.trim()) || (haPezzi && !nPrevisti);

  return (
    <form action={azioneSalva} className="flex flex-col gap-4">
      <input
        type="hidden"
        name="premi"
        value={JSON.stringify(righe.map(({ id, nome, immagine, modalita, percentuale, quantita }) => ({ id, nome, immagine, modalita, percentuale: modalita === "pezzi" ? 0 : percentuale, quantita })))}
      />
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => scelto(e.target.files?.[0])} />

      <label className="flex max-w-md flex-col gap-1 text-sm">
        <span className="font-medium">Partecipanti previsti</span>
        <Input name="previsti" type="number" min={1} step={1} value={previsti} onChange={(e) => setPrevisti(e.target.value)} placeholder="es. 500" />
        <span className="text-muted-foreground">
          Serve a trasformare i pezzi in percentuale: 1 router su 500 partecipanti = 0,2%. Non è un limite: il gioco non si ferma a questo numero.
        </span>
      </label>

      {/* barra riassuntiva: quanto pesa ogni prodotto nel sorteggio */}
      <div>
        <div className="flex h-4 overflow-hidden rounded-full bg-muted">
          {righe.map((r, i) =>
            reale(r) > 0 ? <div key={r.chiave} title={`${r.nome || "Senza nome"}: ${pct(reale(r))}%`} style={{ width: `${reale(r)}%`, background: COLORI[i % COLORI.length] }} /> : null,
          )}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {righe.length === 0 ? "Nessun prodotto: aggiungine uno." : "La barra mostra la probabilità reale di ciascun prodotto (le percentuali vengono riproporzionate, non serve che sommino a 100)."}
        </p>
      </div>

      {haPezzi && !nPrevisti && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />Indica i partecipanti previsti: senza, la percentuale dei prodotti a pezzi non si può calcolare.
        </p>
      )}
      {haPezzi && !!nPrevisti && !haPercentualeInGara && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Non c&apos;è nessun prodotto a percentuale in gara: il {pct(nessunPremio)}% dei giocatori non vincerebbe niente e vedrebbe «premi terminati». Aggiungi un prodotto a percentuale (es. «2 mesi gratis»).
        </p>
      )}
      {esito.pezziEccedenti && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />I pezzi superano i partecipanti previsti: i prodotti a percentuale non uscirebbero mai. Aumenta i partecipanti previsti o riduci i pezzi.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={aggiungi}><Plus />Aggiungi prodotto</Button>
        <Button type="button" variant="outline" onClick={dividiEquamente}><Equal />Dividi in parti uguali le percentuali</Button>
      </div>

      {errore && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">{errore}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {righe.map((r, i) => {
          const colore = COLORI[i % COLORI.length];
          const esaurito = r.quantita !== null && r.id !== undefined && (rimanentiDopo(r) ?? 0) <= 0;
          const pezzi = r.modalita === "pezzi";
          return (
            <div key={r.chiave} className="flex flex-col gap-3 rounded-2xl border-2 bg-card p-4" style={{ borderColor: colore }}>
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
                    <ImagePlus className="h-3 w-3" />{inCaricamento === r.chiave ? "Carico…" : "Cambia immagine"}
                  </button>
                  <button type="button" onClick={() => setLibreriaPer(libreriaPer === r.chiave ? null : r.chiave)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                    <Images className="h-3 w-3" />Libreria
                  </button>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Input value={r.nome} onChange={(e) => modifica(r.chiave, { nome: e.target.value })} placeholder="Nome del prodotto (es. 2 mesi gratis)" maxLength={80} required />
                  <div className="inline-flex w-fit rounded-lg border p-0.5 text-xs font-medium" role="group" aria-label="Come si definisce la probabilità">
                    {MODALITA.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => cambiaModalita(r, m.id)}
                        className={`rounded-md px-3 py-1 ${r.modalita === m.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        {m.etichetta}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {pezzi ? (
                <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  Pezzi disponibili
                  <Input
                    type="number" min={Math.max(1, r.emessi)} step={1} value={r.quantita ?? 1}
                    onChange={(e) => modifica(r.chiave, { quantita: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                    className="w-24"
                  />
                  <span className="font-normal text-muted-foreground">
                    {nPrevisti ? `= ${pct(((r.quantita ?? 1) / nPrevisti) * 100)}% di base (${r.quantita ?? 1} su ${nPrevisti})` : "indica i partecipanti previsti"}
                  </span>
                </label>
              ) : (
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium">
                    Percentuale
                    <Input
                      type="number" min={0} max={100} step={0.1} value={r.percentuale}
                      onChange={(e) => modifica(r.chiave, { percentuale: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                      className="w-24"
                    />
                    %
                  </label>
                  <input type="range" min={0} max={100} step={1} value={r.percentuale} onChange={(e) => modifica(r.chiave, { percentuale: Number(e.target.value) })} className="w-full" style={{ accentColor: colore }} aria-label="Percentuale" />
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={r.quantita === null} onChange={(e) => modifica(r.chiave, { quantita: e.target.checked ? null : Math.max(r.emessi, 10) })} />
                      Quantità illimitata
                    </label>
                    {r.quantita !== null && (
                      <label className="flex items-center gap-2">
                        Disponibili
                        <Input type="number" min={r.emessi} step={1} value={r.quantita} onChange={(e) => modifica(r.chiave, { quantita: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className="w-24" />
                      </label>
                    )}
                  </div>
                </div>
              )}

              <p className="text-sm">
                {esaurito ? <b className="text-destructive">Esaurito: non esce più.</b> : <>Uscirà nel <b>{pct(reale(r))}%</b> dei casi.</>}
              </p>

              <div className="flex flex-wrap items-center gap-3 text-sm">
                {r.id && (
                  <span className="text-muted-foreground">
                    emessi {r.emessi} · firmati {r.firmati}{rimanentiDopo(r) !== null ? ` · rimanenti ${rimanentiDopo(r)}` : ""}
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-destructive"
                  onClick={() => {
                    if (r.totali > 0 && !confirm("Questo prodotto ha già coupon emessi: non può essere cancellato, verrà messo fuori gioco (non uscirà più). Continuare?")) return;
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
        {righe.some((r) => !r.nome.trim()) && <span className="text-sm text-destructive">Dai un nome a ogni prodotto.</span>}
        <span className="text-xs text-muted-foreground">Le modifiche valgono per i nuovi coupon: quelli già emessi restano come sono.</span>
      </div>
    </form>
  );
}
