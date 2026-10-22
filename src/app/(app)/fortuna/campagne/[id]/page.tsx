import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EditorPremi } from "@/components/fortuna/editor-premi";
import { FortunaIntestazione } from "@/components/fortuna/fortuna-intestazione";
import { FortunaNonConfigurata } from "@/components/fortuna/fortuna-non-configurata";
import { createFortunaClient, fortunaConfigurata } from "@/lib/fortuna/client";
import { richiediFortuna } from "@/lib/fortuna/permessi";
import { daOraRoma, formattaData, immagineValida, versoOraRoma, type RigaPremio } from "@/lib/fortuna/premi";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATI = ["bozza", "attiva", "sospesa", "chiusa"] as const;

function torna(id: string, msg: string, ok = false): never {
  redirect(`/fortuna/campagne/${id}?${ok ? "ok" : "errore"}=${encodeURIComponent(msg)}`);
}

async function salvaCampagna(id: string, formData: FormData) {
  "use server";
  await richiediFortuna("admin");
  const stato = String(formData.get("stato"));
  const nome = String(formData.get("nome") ?? "").trim();
  const inizio = String(formData.get("inizio") ?? "");
  const fine = String(formData.get("fine") ?? "");
  if (!STATI.includes(stato as (typeof STATI)[number]) || !nome || !inizio || !fine) torna(id, "Dati non validi.");

  const { error } = await createFortunaClient()
    .from("fortuna_campagne")
    .update({ nome, inizio: daOraRoma(inizio), fine: daOraRoma(fine), stato })
    .eq("id", id);
  if (error) {
    // l'indice univoco del database impedisce due campagne attive insieme
    torna(id, error.code === "23505" ? "C'è già un'altra campagna attiva: sospendila o chiudila prima." : "Dati non validi (la fine deve seguire l'inizio).");
  }
  revalidatePath("/fortuna", "layout");
  torna(id, "Campagna salvata.", true);
}

type RigaInput = { id?: string; nome: string; immagine: string; percentuale: number; quantita: number | null };

/** Legge e valida il JSON dell'editor: ritorna le righe pulite oppure un messaggio d'errore. */
function leggiRighe(grezzo: string): { righe: RigaInput[] } | { errore: string } {
  let json: unknown;
  try {
    json = JSON.parse(grezzo);
  } catch {
    return { errore: "Dati non validi." };
  }
  if (!Array.isArray(json) || json.length > 500) return { errore: "Dati non validi." };
  const righe: RigaInput[] = [];
  for (const x of json as Record<string, unknown>[]) {
    const nome = typeof x.nome === "string" ? x.nome.trim() : "";
    if (!nome || nome.length > 80) return { errore: "Dai un nome (massimo 80 caratteri) a ogni prodotto." };
    if (typeof x.immagine !== "string" || !immagineValida(x.immagine)) return { errore: `«${nome}»: immagine non valida.` };
    if (typeof x.percentuale !== "number" || !Number.isFinite(x.percentuale) || x.percentuale < 0 || x.percentuale > 100) return { errore: `«${nome}»: la percentuale deve essere tra 0 e 100.` };
    const q = x.quantita;
    if (q !== null && (typeof q !== "number" || !Number.isInteger(q) || q < 0 || q > 1_000_000)) return { errore: `«${nome}»: quantità non valida.` };
    if (x.id !== undefined && (typeof x.id !== "string" || !UUID.test(x.id))) return { errore: "Dati non validi." };
    righe.push({ id: x.id as string | undefined, nome, immagine: x.immagine, percentuale: x.percentuale, quantita: q as number | null });
  }
  return { righe };
}

/** Salva TUTTI i prodotti della campagna in un colpo: valida prima, scrive dopo. */
async function salvaPremi(id: string, formData: FormData) {
  "use server";
  await richiediFortuna("admin");
  const letto = leggiRighe(String(formData.get("premi") ?? "[]"));
  if ("errore" in letto) return torna(id, letto.errore);
  const { righe } = letto;

  const db = createFortunaClient();
  const { data: esistenti } = await db.from("fortuna_riepilogo").select("premio_id, nome, emessi, contrattualizzati").eq("campagna_id", id);
  const perId = new Map((esistenti ?? []).map((e) => [e.premio_id as string, e]));

  // ── validazione completa: nessuna scrittura finché non è tutto a posto ──
  for (const r of righe) {
    if (r.id && !perId.has(r.id)) return torna(id, "Un prodotto non appartiene a questa campagna: ricarica la pagina.");
    const firmati = r.id ? Number(perId.get(r.id)!.contrattualizzati) : 0;
    if (r.quantita !== null && r.quantita < firmati) {
      return torna(id, `«${r.nome}»: ci sono già ${firmati} contratti firmati, le quantità disponibili non possono essere meno.`);
    }
  }

  const campi = (r: RigaInput, ordine: number) => {
    const firmati = r.id ? Number(perId.get(r.id)!.contrattualizzati) : 0;
    return {
      nome: r.nome,
      immagine: r.immagine,
      percentuale: r.percentuale,
      ordine,
      quantita_totale: r.quantita,
      quantita_rimanenti: r.quantita === null ? null : r.quantita - firmati,
    };
  };

  for (const [i, r] of righe.entries()) {
    const { error } = r.id
      ? await db.from("fortuna_premi").update(campi(r, i)).eq("id", r.id).eq("campagna_id", id)
      : await db.from("fortuna_premi").insert({ campagna_id: id, ...campi(r, i) });
    if (error) {
      console.error("fortuna salvaPremi", error);
      return torna(id, `Impossibile salvare «${r.nome}».`);
    }
  }

  // prodotti tolti dall'editor: si cancellano se mai usciti, altrimenti si "spengono" (0%) per non perdere i coupon
  const spenti: string[] = [];
  const tenuti = new Set(righe.map((r) => r.id).filter(Boolean));
  for (const e of esistenti ?? []) {
    if (tenuti.has(e.premio_id)) continue;
    if (Number(e.emessi) > 0) {
      await db.from("fortuna_premi").update({ percentuale: 0 }).eq("id", e.premio_id);
      spenti.push(e.nome as string);
    } else {
      await db.from("fortuna_premi").delete().eq("id", e.premio_id);
    }
  }

  revalidatePath(`/fortuna/campagne/${id}`);
  torna(id, spenti.length ? `Prodotti salvati. «${spenti.join("», «")}» ha già coupon emessi: non è stato cancellato ma messo allo 0%.` : "Prodotti salvati.", true);
}

export default async function DettaglioCampagna({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; errore?: string }> }) {
  await richiediFortuna("admin");
  const intestazione = <FortunaIntestazione attiva="campagne" isAdmin />;
  if (!fortunaConfigurata()) return <div className="mx-auto max-w-5xl">{intestazione}<FortunaNonConfigurata /></div>;

  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { ok, errore } = await searchParams;

  const db = createFortunaClient();
  const { data: c } = await db.from("fortuna_campagne").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const { data: premi } = await db.from("fortuna_riepilogo").select("*").eq("campagna_id", id).order("ordine").order("nome");

  const iniziali: RigaPremio[] = (premi ?? []).map((p) => ({
    chiave: p.premio_id,
    id: p.premio_id,
    nome: p.nome,
    immagine: p.immagine,
    percentuale: Number(p.percentuale),
    quantita: p.quantita_totale,
    rimanenti: p.quantita_rimanenti,
    emessi: Number(p.emessi),
    firmati: Number(p.contrattualizzati),
  }));

  return (
    <div className="mx-auto max-w-5xl">
      {intestazione}
      <Link href="/fortuna/campagne" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Tutte le campagne</Link>
      {ok && <p role="status" className="mb-4 rounded-lg bg-emerald-500/10 p-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">{ok}</p>}
      {errore && <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">{errore}</p>}

      <Card className="mb-6">
        <CardContent className="pt-4">
          <h2 className="mb-3 font-semibold">Campagna</h2>
          <form action={salvaCampagna.bind(null, id)} className="flex max-w-md flex-col gap-3">
            <Input name="nome" defaultValue={c.nome} required />
            <label className="flex flex-col gap-1 text-sm">Inizio (ora italiana)<Input name="inizio" type="datetime-local" defaultValue={versoOraRoma(c.inizio)} required /></label>
            <label className="flex flex-col gap-1 text-sm">Fine (ora italiana)<Input name="fine" type="datetime-local" defaultValue={versoOraRoma(c.fine)} required /></label>
            <label className="flex flex-col gap-1 text-sm">Stato
              <select name="stato" defaultValue={c.stato} className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm">
                {STATI.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <Button size="lg" className="h-9 px-4">Salva campagna</Button>
          </form>
          <p className="mt-3 text-sm text-muted-foreground">Il gioco è aperto solo se lo stato è «attiva» e l&apos;ora attuale è tra inizio e fine ({formattaData(c.inizio)} → {formattaData(c.fine)}).</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <h2 className="mb-1 font-semibold">Prodotti e percentuali</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Aggiungi quanti prodotti vuoi e dai a ciascuno una percentuale di uscita. Se la quantità è «illimitata» il prodotto esce sempre; se imposti una quantità,
            scende quando confermi il contratto firmato e a zero il prodotto smette di uscire.
          </p>
          <EditorPremi iniziali={iniziali} azioneSalva={salvaPremi.bind(null, id)} />
        </CardContent>
      </Card>
    </div>
  );
}
