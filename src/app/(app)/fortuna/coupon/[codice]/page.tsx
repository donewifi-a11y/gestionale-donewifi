import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ArrowLeft, Ban, CheckCircle2, Hourglass, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createFortunaClient, fortunaConfigurata } from "@/lib/fortuna/client";
import { richiediFortuna } from "@/lib/fortuna/permessi";
import { formattaData, type StatoCoupon } from "@/lib/fortuna/premi";
import { FortunaNonConfigurata } from "@/components/fortuna/fortuna-non-configurata";

export const dynamic = "force-dynamic";

const CODICE = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;
const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

async function impostaStato(couponId: string, codice: string, nuovo: StatoCoupon) {
  "use server";
  // chi ha confermato resta nello storico del coupon: si usa il nome della Persona, non l'account condiviso
  const { persona } = await richiediFortuna("operatore");
  const { data, error } = await createFortunaClient().rpc("fortuna_imposta_stato", { p_coupon_id: couponId, p_stato: nuovo, p_utente: persona.nome });
  const esito = error ? "errore" : ((data as { esito?: string } | null)?.esito ?? "errore");
  revalidatePath(`/fortuna/coupon/${codice}`);
  revalidatePath("/fortuna");
  redirect(`/fortuna/coupon/${codice}?esito=${esito}`);
}

const MESSAGGI: Record<string, string> = {
  ok: "Stato aggiornato.",
  invariato: "Il coupon era già in questo stato.",
  premio_esaurito: "Il pezzo di questo prodotto è stato dato a un altro coupon: non si può più ripristinare. Aumenta la quantità in «Campagne e prodotti» e riprova.",
  non_trovato: "Coupon non trovato.",
  errore: "Errore durante l'aggiornamento. Riprova.",
};

export default async function SchedaCoupon({ params, searchParams }: { params: Promise<{ codice: string }>; searchParams: Promise<{ esito?: string }> }) {
  await richiediFortuna("operatore");
  if (!fortunaConfigurata()) return <div className="mx-auto max-w-2xl"><FortunaNonConfigurata /></div>;

  const codice = decodeURIComponent((await params).codice).toUpperCase();
  if (!CODICE.test(codice)) notFound();
  const { esito } = await searchParams;

  const db = createFortunaClient();
  const { data: c } = await db
    .from("fortuna_coupon")
    .select("id, codice, stato, emesso_at, contrattualizzato_at, annullato_at, email_inviata_at, email_errore, premio_nome, premio_immagine, premio:fortuna_premi(quantita_rimanenti, quantita_totale), part:fortuna_partecipanti(nome, cognome, telefono, email)")
    .eq("codice", codice)
    .maybeSingle();
  if (!c) notFound();

  const premio = uno(c.premio);
  const part = uno(c.part);
  const { data: storico } = await db.from("fortuna_log").select("azione, utente, at").eq("coupon_id", c.id).order("at", { ascending: false }).limit(20);
  const firmato = c.stato === "contrattualizzato";
  const annullato = c.stato === "annullato";
  const limitato = premio?.quantita_totale != null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/fortuna" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Torna ai coupon</Link>

      {esito && (
        <p role="status" className={`rounded-lg p-3 text-sm font-medium ${esito === "ok" || esito === "invariato" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
          {MESSAGGI[esito] ?? MESSAGGI.errore}
        </p>
      )}

      <Card>
        <CardContent className="flex flex-col gap-1 pt-4">
          <p className="font-mono text-3xl font-black tracking-widest">{c.codice}</p>
          <p className="text-lg font-semibold">{part?.nome} {part?.cognome}</p>
          <p className="text-muted-foreground">{part?.telefono} · {part?.email}</p>
          {/* nome e immagine sono quelli del momento dell'estrazione, anche se il prodotto è stato modificato dopo */}
          <p className="mt-2 text-base">🎁 <b>{c.premio_nome}</b>{" "}
            <span className="text-sm text-muted-foreground">({!limitato ? "scorta illimitata" : `pezzi rimasti: ${premio?.quantita_rimanenti ?? 0}`})</span>
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.premio_immagine} alt={c.premio_nome} className="mt-2 h-auto w-64 rounded-xl border" />
          <p className="mt-2 text-sm text-muted-foreground">
            Emesso: {formattaData(c.emesso_at)} · Email {c.email_inviata_at ? `inviata ${formattaData(c.email_inviata_at)}` : `non inviata${c.email_errore ? ` (${c.email_errore})` : ""}`}
          </p>
        </CardContent>
      </Card>

      <Card className={annullato ? "border-destructive/40 bg-destructive/5" : firmato ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}>
        <CardContent className="flex flex-col gap-3 pt-4">
          <p className="flex items-center gap-2 text-lg font-semibold">
            {annullato ? <Ban className="h-5 w-5 text-destructive" /> : firmato ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Hourglass className="h-5 w-5 text-amber-600" />}
            {annullato ? `Coupon annullato il ${formattaData(c.annullato_at)}` : firmato ? `Contratto firmato il ${formattaData(c.contrattualizzato_at)}` : "In attesa di sottoscrizione"}
          </p>
          <div className="flex flex-wrap gap-2">
            {annullato ? (
              <form action={impostaStato.bind(null, c.id, c.codice, "emesso")}>
                <Button size="lg" className="h-10 px-4 text-base"><Undo2 />Ripristina coupon</Button>
              </form>
            ) : (
              <>
                <form action={impostaStato.bind(null, c.id, c.codice, firmato ? "emesso" : "contrattualizzato")}>
                  <Button size="lg" variant={firmato ? "outline" : "default"} className="h-10 px-4 text-base">
                    {firmato ? "Annulla la firma: riporta a «in attesa»" : "Conferma contratto firmato"}
                  </Button>
                </form>
                <form action={impostaStato.bind(null, c.id, c.codice, "annullato")}>
                  <Button size="lg" variant="destructive" className="h-10 px-4 text-base"><Ban />Annulla coupon</Button>
                </form>
              </>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {annullato
              ? limitato ? "Il pezzo è tornato disponibile per altri giocatori. Ripristinando lo si riprenota, se nel frattempo non è stato dato a qualcun altro." : "Il coupon non è più valido."
              : limitato ? "Il pezzo è già prenotato per questo coupon. Se il cliente non lo userà, «Annulla coupon» lo rimette in gioco." : "Annullando, il coupon non è più valido."}
          </p>
        </CardContent>
      </Card>

      {!!storico?.length && (
        <Card>
          <CardContent className="pt-4">
            <h2 className="mb-2 font-semibold">Storico</h2>
            <ul className="text-sm text-muted-foreground">
              {storico.map((s, i) => (
                <li key={i}>{formattaData(s.at)} — {s.azione}{s.utente ? ` (${s.utente})` : ""}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
