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
import type { ModalitaPremio } from "@/lib/fortuna/probabilita";

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

type RigaInput = { id?: string; nome: string; immagine: string; modalita: ModalitaPremio; percentuale: number; quantita: number | null };

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
    if (x.modalita !== "percentuale" && x.modalita !== "pezzi") return { errore: `«${nome}»: modalità non valida.` };
    if (typeof x.percentuale !== "number" || !Number.isFinite(x.percentuale) || x.percentuale < 0 || x.percentuale > 100) return { errore: `«${nome}»: la percentuale deve essere tra 0 e 100.` };
    const q = x.quantita;
    if (q !== null && (typeof q !== "number" || !Number.isInteger(q) || q < 0 || q > 1_000_000)) return { errore: `«${nome}»: quantità non valida.` };
    if (x.modalita === "pezzi" && (q === null || (q as number) < 1)) return { errore: `«${nome}»: un prodotto a pezzi ha bisogno di almeno 1 pezzo.` };
    if (x.id !== undefined && (typeof x.id !== "string" || !UUID.test(x.id))) return { errore: "Dati non validi." };
    righe.push({ id: x.id as string | undefined, nome, immagine: x.immagine, modalita: x.modalita, percentuale: x.percentuale, quantita: q as number | null });
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

  const grezzoPrevisti = String(formData.get("previsti") ?? "").trim();
  const previsti = grezzoPrevisti === "" ? null : Number(grezzoPrevisti);
  if (previsti !== null && (!Number.isInteger(previsti) || previsti < 1 || previsti > 10_000_000)) return torna(id, "I partecipanti previsti devono essere un numero intero da 1 in su.");
  if (righe.some((r) => r.modalita === "pezzi") && previsti === null) return torna(id, "Indica i partecipanti previsti: servono a calcolare la percentuale dei prodotti a pezzi.");

  const db = createFortunaClient();
  const { data: esistenti } = await db.from("fortuna_riepilogo").select("premio_id, nome, emessi, totali").eq("campagna_id", id);
  const perId = new Map((esistenti ?? []).map((e) => [e.premio_id as string, e]));
  const emessiDi = (r: RigaInput) => (r.id ? Number(perId.get(r.id)!.emessi) : 0);

  // ── validazione completa: nessuna scrittura finché non è tutto a posto ──
  for (const r of righe) {
    if (r.id && !perId.has(r.id)) return torna(id, "Un prodotto non appartiene a questa campagna: ricarica la pagina.");
    // i pezzi già usciti (coupon non annullati) occupano la scorta: non si può scendere sotto
    if (r.quantita !== null && r.quantita < emessiDi(r)) {
      return torna(id, `«${r.nome}»: sono già usciti ${emessiDi(r)} coupon, le quantità disponibili non possono essere meno.`);
    }
  }

  const campi = (r: RigaInput, ordine: number) => ({
    nome: r.nome,
    immagine: r.immagine,
    modalita: r.modalita,
    percentuale: r.modalita === "pezzi" ? 0 : r.percentuale,
    ordine,
    quantita_totale: r.quantita,
    quantita_rimanenti: r.quantita === null ? null : r.quantita - emessiDi(r),
  });

  if (previsti !== undefined) {
    const { error } = await db.from("fortuna_campagne").update({ partecipanti_previsti: previsti }).eq("id", id);
    if (error) return torna(id, "Impossibile salvare i partecipanti previsti.");
  }

  for (const [i, r] of righe.entries()) {
    const { error } = r.id
      ? await db.from("fortuna_premi").update(campi(r, i)).eq("id", r.id).eq("campagna_id", id)
      : await db.from("fortuna_premi").insert({ campagna_id: id, ...campi(r, i) });
    if (error) {
      console.error("fortuna salvaPremi", error);
      return torna(id, `Impossibile salvare «${r.nome}».`);
    }
  }

  // prodotti tolti dall'editor: si cancellano se mai usciti, altrimenti si mettono fuori gioco per non perdere i coupon
  const spenti: string[] = [];
  const tenuti = new Set(righe.map((r) => r.id).filter(Boolean));
  for (const e of esistenti ?? []) {
    if (tenuti.has(e.premio_id)) continue;
    if (Number(e.totali) > 0) {
      await db.from("fortuna_premi").update({ modalita: "percentuale", percentuale: 0 }).eq("id", e.premio_id);
      spenti.push(e.nome as string);
    } else {
      await db.from("fortuna_premi").delete().eq("id", e.premio_id);
    }
  }

  revalidatePath(`/fortuna/campagne/${id}`);
  torna(id, spenti.length ? `Prodotti salvati. «${spenti.join("», «")}» ha già coupon emessi: non è stato cancellato ma messo fuori gioco.` : "Prodotti salvati.", true);
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
    modalita: p.modalita,
    percentuale: Number(p.percentuale),
    quantita: p.quantita_totale,
    rimanenti: p.quantita_rimanenti,
    emessi: Number(p.emessi),
    firmati: Number(p.contrattualizzati),
    totali: Number(p.totali),
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
          <h2 className="mb-1 font-semibold">Prodotti e probabilità</h2>
          <p className="mb-2 text-sm text-muted-foreground">
            Ogni prodotto può essere <b>a percentuale</b> (la scegli tu, es. «2 mesi gratis» 60%) oppure <b>a pezzi</b> (es. 1 router): per i pezzi la percentuale la calcola il sistema da
            <i> pezzi ÷ partecipanti previsti</i>, e i prodotti a percentuale si dividono il resto. Un pezzo che esce è subito prenotato; se il vincitore non firma, annulli il coupon dalla sua scheda e il pezzo torna in gioco.
          </p>
          <p className="mb-4 text-sm text-muted-foreground">
            Puoi cambiare immagine, nome, percentuali e pezzi anche con la campagna in corso: vale per i <b>nuovi</b> coupon, quelli già emessi restano come sono.
          </p>
          <EditorPremi iniziali={iniziali} previstiIniziali={c.partecipanti_previsti ?? null} azioneSalva={salvaPremi.bind(null, id)} />
        </CardContent>
      </Card>
    </div>
  );
}
