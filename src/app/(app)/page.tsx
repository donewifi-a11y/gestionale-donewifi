import Link from "next/link";
import { Ticket, PhoneCall, Plus, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

/**
 * ★ NUOVA — home come vero punto di partenza della giornata: non solo le
 * due porte d'ingresso, ma anche i numeri di oggi e una scorciatoia diretta
 * per creare Ticket/Segnalazione senza dover prima entrare nella sezione.
 */
export default async function HomePage() {
  const supabase = await createClient();

  const [{ count: ticketAperti }, { count: segnalazioniDaContattare }, { count: segnalazioniInGestione }] =
    await Promise.all([
      supabase
        .from("tickets")
        .select("*", { count: "exact", head: true })
        .not("stato", "in", "(Completato,Annullato)"),
      supabase
        .from("segnalazioni")
        .select("*", { count: "exact", head: true })
        .eq("stato", "Da Contattare"),
      supabase
        .from("segnalazioni")
        .select("*", { count: "exact", head: true })
        .eq("stato", "Gestione Cliente"),
    ]);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-heading mb-1 text-2xl font-bold tracking-tight">Centro Operativo</h1>
      <p className="mb-8 text-muted-foreground">Scegli l&apos;area di lavoro o crea qualcosa di nuovo.</p>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <AreaCard
          href="/tickets"
          icona={Ticket}
          titolo="Ticket"
          descrizione="Assistenza, pratiche commerciali e amministrative."
          numero={ticketAperti ?? 0}
          etichettaNumero="aperti"
          hrefNuovo="/tickets/nuovo"
          etichettaNuovo="Nuovo Ticket"
        />
        <AreaCard
          href="/segnalazioni"
          icona={PhoneCall}
          titolo="Segnalazioni"
          descrizione="Nuovi contatti, richiesta dati, contratto."
          numero={segnalazioniDaContattare ?? 0}
          etichettaNumero="da contattare"
          hrefNuovo="/segnalazioni/nuovo"
          etichettaNuovo="Nuova Segnalazione"
          badgeExtra={
            segnalazioniInGestione ? `${segnalazioniInGestione} in Gestione Cliente` : undefined
          }
        />
      </div>
    </div>
  );
}

function AreaCard({
  href,
  icona: Icona,
  titolo,
  descrizione,
  numero,
  etichettaNumero,
  hrefNuovo,
  etichettaNuovo,
  badgeExtra,
}: {
  href: string;
  icona: typeof Ticket;
  titolo: string;
  descrizione: string;
  numero: number;
  etichettaNumero: string;
  hrefNuovo: string;
  etichettaNuovo: string;
  badgeExtra?: string;
}) {
  return (
    <div className="group flex flex-col justify-between rounded-2xl border bg-card p-5 shadow-sm transition hover:shadow-md hover:border-primary/40">
      <Link href={href} className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Icona className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
        </div>
        <div>
          <h2 className="font-heading text-lg font-bold">{titolo}</h2>
          <p className="text-sm text-muted-foreground">{descrizione}</p>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-heading text-3xl font-bold tabular-nums">{numero}</span>
          <span className="text-xs text-muted-foreground">{etichettaNumero}</span>
          {badgeExtra && (
            <span className="ml-auto rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning">
              {badgeExtra}
            </span>
          )}
        </div>
      </Link>
      <Link
        href={hrefNuovo}
        className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-dashed py-2 text-sm font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        {etichettaNuovo}
      </Link>
    </div>
  );
}
