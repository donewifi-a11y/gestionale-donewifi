"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSignature, MapPinned, CreditCard, FileEdit, FileX2, Loader2 } from "lucide-react";
import { InvioLinkCliente } from "@/components/condivisi/invio-link";
import { inviaEmailPraticaClienteEsterno, segnaDisdettaRicevuta } from "@/app/(app)/clienti-esterni/actions";
import { RICHIESTE_CLIENTE_CONFIG, messaggioWhatsappPratica, type SlugRichiestaCliente } from "@/lib/richieste-cliente-config";
import { REPARTO_PER_TIPO_RICHIESTA, type RichiestaCliente } from "@/lib/types";
import { useToast } from "@/components/ui/toast";

const PRATICHE_DISPONIBILI: { slug: SlugRichiestaCliente; icona: typeof FileEdit }[] = [
  { slug: "trasferimento", icona: MapPinned },
  { slug: "cambio-iban", icona: CreditCard },
  { slug: "cambio-anagrafica", icona: FileEdit },
];

// ★ NUOVA (2026-08) — "Pratiche cliente senza Ticket": l'operatore avvia
// qui, dalla scheda del Cliente Esterno, lo stesso link pubblico che prima
// esisteva solo dentro il pannello "Invia una pratica al cliente" di un
// Ticket — nessun Ticket da creare per Trasferimento/Cambio IBAN/Cambio
// Anagrafica. Subentro non è tra le 3: ha un flusso dedicato a doppio
// consenso, costruito a parte (vedi tickets-board.tsx).
export function NuovaPraticaClienteEsterno({
  clienteId,
  telefono,
  email,
  nome,
  praticheEsistenti,
}: {
  clienteId: number;
  telefono: string | null;
  email: string | null;
  nome: string;
  praticheEsistenti: RichiestaCliente[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [slug, setSlug] = useState<SlugRichiestaCliente | "">("");
  const [inCorsoDisdetta, startDisdetta] = useTransition();

  function segnaDisdetta() {
    if (!confirm(`Segnare la disdetta di "${nome}" come ricevuta? Non sostituisce la comunicazione scritta ufficiale, serve solo a tracciarla qui.`)) return;
    startDisdetta(async () => {
      const risultato = await segnaDisdettaRicevuta(clienteId);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      toast("Disdetta segnata come ricevuta.", "successo");
      router.refresh();
    });
  }

  const link = useMemo(() => {
    if (!slug || typeof window === "undefined") return "";
    return `${window.location.origin}/richiesta-cliente/${slug}?clienteEsternoId=${clienteId}`;
  }, [slug, clienteId]);

  const messaggio = slug ? messaggioWhatsappPratica(nome, RICHIESTE_CLIENTE_CONFIG[slug].titolo, link) : "";

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-md">
      <h2 className="mb-3 flex items-center gap-1.5 font-heading text-sm font-bold">
        <FileSignature className="h-3.5 w-3.5" strokeWidth={2.25} />
        Pratiche ({praticheEsistenti.length})
      </h2>

      {praticheEsistenti.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">Nessuna pratica inviata finora per questo cliente.</p>
      ) : (
        <div className="mb-3 flex flex-col gap-1.5">
          {praticheEsistenti.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-2 text-sm">
              <span className="font-semibold">{p.tipo_richiesta}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {p.stato} · {new Date(p.data).toLocaleDateString("it-IT")}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="border-t pt-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Avvia una nuova pratica</p>
        <select
          value={slug}
          onChange={(e) => setSlug(e.target.value as SlugRichiestaCliente | "")}
          className="h-9 w-full rounded-md border bg-background px-3 text-xs"
        >
          <option value="">Scegli una pratica...</option>
          {PRATICHE_DISPONIBILI.map((p) => (
            <option key={p.slug} value={p.slug}>{RICHIESTE_CLIENTE_CONFIG[p.slug].titolo}</option>
          ))}
        </select>
        {slug && (
          <div className="mt-2.5">
            <InvioLinkCliente
              url={link}
              telefono={telefono}
              email={email}
              messaggio={messaggio}
              onInviaEmail={() =>
                inviaEmailPraticaClienteEsterno(clienteId, RICHIESTE_CLIENTE_CONFIG[slug].titolo, link, REPARTO_PER_TIPO_RICHIESTA[RICHIESTE_CLIENTE_CONFIG[slug].tipo])
              }
            />
          </div>
        )}
      </div>

      {/* ★ NUOVA (2026-08) — Disdetta, a differenza delle 3 sopra, non ha un
      modulo pubblico (la normativa richiede una comunicazione scritta
      tracciabile — vedi /disdetta, resta di sole istruzioni, invariata).
      Questo pulsante non la sostituisce: serve solo a far comparire la
      pratica qui insieme alle altre, invece di restare invisibile. */}
      <div className="mt-3 border-t pt-3">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Disdetta</p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/disdetta"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
          >
            Vedi le istruzioni ufficiali
          </Link>
          <button
            type="button"
            onClick={segnaDisdetta}
            disabled={inCorsoDisdetta}
            className="ml-auto flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-critical/40 hover:text-critical disabled:opacity-50"
          >
            {inCorsoDisdetta ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <FileX2 className="h-3.5 w-3.5" strokeWidth={2.25} />}
            {inCorsoDisdetta ? "Salvataggio…" : "Segna disdetta ricevuta"}
          </button>
        </div>
      </div>
    </div>
  );
}
