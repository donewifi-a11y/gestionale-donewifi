import Link from "next/link";
import { Search, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatoVuoto } from "@/components/ui/stato-vuoto";
import { FortunaIntestazione } from "@/components/fortuna/fortuna-intestazione";
import { FortunaNonConfigurata } from "@/components/fortuna/fortuna-non-configurata";
import { createFortunaClient, fortunaConfigurata } from "@/lib/fortuna/client";
import { richiediFortuna } from "@/lib/fortuna/permessi";
import { formattaData } from "@/lib/fortuna/premi";

export const dynamic = "force-dynamic";

// toglie i caratteri che hanno un significato nei filtri PostgREST (.or) e nei LIKE
const pulisci = (q: string) => q.replace(/[,()%*\\_"']/g, " ").trim().slice(0, 60);
const solaCifre = (q: string) => q.replace(/\D/g, "").replace(/^39(?=\d{9,})/, "");
const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

type Risultato = {
  codice: string;
  stato: string;
  emesso_at: string;
  premio_nome: string;
  segnalazione_numero: number | null;
  part: { nome: string; cognome: string; telefono: string } | { nome: string; cognome: string; telefono: string }[] | null;
};

export default async function FortunaPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { isAdmin } = await richiediFortuna("operatore");
  const intestazione = <FortunaIntestazione attiva="coupon" isAdmin={isAdmin} />;
  if (!fortunaConfigurata()) return <div className="mx-auto max-w-5xl">{intestazione}<FortunaNonConfigurata /></div>;

  const { q: qGrezza } = await searchParams;
  const q = pulisci(qGrezza ?? "");
  const db = createFortunaClient();

  let risultati: Risultato[] = [];
  if (q) {
    const tel = solaCifre(q);
    const filtri = [`nome.ilike.%${q}%`, `cognome.ilike.%${q}%`, `email.ilike.%${q}%`];
    if (tel.length >= 4) filtri.push(`telefono.ilike.%${tel}%`);
    const { data: parts } = await db.from("fortuna_partecipanti").select("id").or(filtri.join(",")).limit(100);
    const ids = (parts ?? []).map((p) => p.id);
    const orCoupon = [`codice.ilike.%${q.toUpperCase()}%`, ...(ids.length ? [`partecipante_id.in.(${ids.join(",")})`] : [])].join(",");
    const { data } = await db
      .from("fortuna_coupon")
      .select("codice, stato, emesso_at, premio_nome, segnalazione_numero, part:fortuna_partecipanti(nome, cognome, telefono)")
      .or(orCoupon)
      .order("emesso_at", { ascending: false })
      .limit(50);
    risultati = (data ?? []) as Risultato[];
  }

  // coupon che nessuno ha ancora aperto: sono i nuovi arrivi, da vedere e, volendo, trasformare in segnalazione
  type DaVedere = { codice: string; emesso_at: string; premio_nome: string; part: { nome: string; cognome: string; telefono: string } | { nome: string; cognome: string; telefono: string }[] | null };
  const { data: daVedereDati } = q
    ? { data: [] }
    : await db
        .from("fortuna_coupon")
        .select("codice, emesso_at, premio_nome, part:fortuna_partecipanti(nome, cognome, telefono)")
        .is("visto_at", null)
        .neq("stato", "annullato")
        .order("emesso_at", { ascending: false })
        .limit(30);
  const daVedere = (daVedereDati ?? []) as DaVedere[];

  // riepilogo della campagna attiva (o, in mancanza, l'ultima creata)
  const { data: camp } = await db
    .from("fortuna_campagne")
    .select("id, nome, stato, inizio, fine")
    .order("stato", { ascending: true }) // 'attiva' viene prima di bozza/chiusa/sospesa
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: riepilogo } = camp
    ? await db.from("fortuna_riepilogo").select("*").eq("campagna_id", camp.id).order("ordine").order("nome")
    : { data: [] };
  // probabilità reale adesso (stessa funzione SQL dell'estrazione): i prodotti fuori gara non compaiono
  const { data: probabilita } = camp ? await db.rpc("fortuna_probabilita", { p_campagna: camp.id }) : { data: [] };
  const pAttuale = new Map(((probabilita ?? []) as { premio_id: string; probabilita: number }[]).map((x) => [x.premio_id, Number(x.probabilita) * 100]));
  const formatoP = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: n < 1 ? 2 : 1 });

  return (
    <div className="mx-auto max-w-5xl">
      {intestazione}

      <form className="mb-6 flex gap-2">
        <Input name="q" defaultValue={q} autoFocus placeholder="Cerca per codice, nome, cognome, telefono o email" className="h-10 text-base" />
        <Button type="submit" size="lg" className="h-10 px-4"><Search />Cerca</Button>
      </form>

      {!q && daVedere.length > 0 && (
        <section className="mb-8">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-primary">Da vedere</h2>
            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{daVedere.length}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {daVedere.map((d) => {
              const p = uno(d.part);
              return (
                <li key={d.codice}>
                  <Link href={`/fortuna/coupon/${d.codice}`} className="flex flex-col gap-0.5 rounded-xl border-2 border-primary/50 bg-primary/5 p-3 transition hover:bg-primary/10">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-base font-bold">{p?.nome} {p?.cognome}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formattaData(d.emesso_at)}</span>
                    </span>
                    <span className="text-sm text-muted-foreground">{p?.telefono} · {d.premio_nome}</span>
                    <span className="font-mono text-sm font-bold tracking-wider text-primary">{d.codice}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {q && (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{risultati.length} {risultati.length === 1 ? "risultato" : "risultati"}</h2>
          {risultati.length === 0 ? (
            <StatoVuoto icona={Ticket} titolo="Nessun coupon trovato." compatto />
          ) : (
            <ul className="flex flex-col gap-2">
              {risultati.map((r) => {
                const p = uno(r.part);
                return (
                  <li key={r.codice}>
                    <Link href={`/fortuna/coupon/${r.codice}`} className="flex flex-col gap-1 rounded-xl border bg-card p-3 transition hover:bg-muted">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-base font-bold">{p?.nome} {p?.cognome}</span>
                        <span className="font-mono text-sm font-bold tracking-wider text-primary">{r.codice}</span>
                      </span>
                      <span className="text-sm text-muted-foreground">{p?.telefono} · {r.premio_nome} · {formattaData(r.emesso_at)}</span>
                      <span className="flex flex-wrap gap-1.5">
                        {r.stato === "contrattualizzato" ? <Badge>Contratto firmato</Badge> : r.stato === "annullato" ? <Badge variant="destructive">Annullato</Badge> : <Badge variant="secondary">In attesa</Badge>}
                        {r.segnalazione_numero != null && <Badge variant="outline">Segnalazione #{r.segnalazione_numero}</Badge>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {camp ? (
        <section>
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="text-lg font-semibold">{camp.nome}</h2>
            <Badge variant={camp.stato === "attiva" ? "default" : "outline"}>{camp.stato}</Badge>
            <span className="text-sm text-muted-foreground">{formattaData(camp.inizio)} → {formattaData(camp.fine)}</span>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Premio</TableHead><TableHead>Tipo</TableHead><TableHead>Probabilità ora</TableHead><TableHead>Scorta</TableHead><TableHead>Coupon emessi</TableHead><TableHead>Firmati</TableHead><TableHead>Annullati</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {(riepilogo ?? []).map((r) => (
                    <TableRow key={r.premio_id}>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell>{r.modalita === "pezzi" ? "a pezzi" : "a percentuale"}</TableCell>
                      <TableCell>{pAttuale.has(r.premio_id) ? `${formatoP(pAttuale.get(r.premio_id)!)}%` : <span className="text-muted-foreground">fuori gioco</span>}</TableCell>
                      <TableCell>{r.quantita_totale === null ? "illimitata" : `${r.quantita_rimanenti} / ${r.quantita_totale}`}</TableCell>
                      <TableCell>{r.emessi}</TableCell>
                      <TableCell>{r.contrattualizzati}</TableCell>
                      <TableCell>{r.annullati}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      ) : (
        <StatoVuoto icona={Ticket} titolo="Nessuna campagna ancora creata." azione={isAdmin ? { testo: "Crea la prima campagna", href: "/fortuna/campagne" } : undefined} />
      )}
    </div>
  );
}
