"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSignature, MapPinned, CreditCard, FileEdit, FileX2, Loader2, Repeat } from "lucide-react";
import { InvioLinkCliente } from "@/components/condivisi/invio-link";
import { IconaCategoria } from "@/components/condivisi/icona-categoria";
import { Input } from "@/components/ui/input";
import { inviaEmailPraticaClienteEsterno, segnaDisdettaRicevuta, avviaSubentroClienteEsterno } from "@/app/(app)/clienti-esterni/actions";
import { RICHIESTE_CLIENTE_CONFIG, messaggioWhatsappPratica, type SlugRichiestaCliente } from "@/lib/richieste-cliente-config";
import { REPARTO_PER_TIPO_RICHIESTA } from "@/lib/types";
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
//
// ★ RIORGANIZZAZIONE (2026-08-31, proposta "Barra laterale" scelta
// dall'utente su 3 — vedi artifact "Scheda Cliente: Proposte") — questo
// pannello ora vive nella barra laterale fissa della scheda cliente,
// sempre visibile mentre si scorre la pagina, invece che in un blocco a
// metà di una colonna lunga ("le pratiche sotto da aprire non sono
// comode"). L'elenco delle pratiche già inviate (`praticheEsistenti`) è
// stato spostato in una card a parte nella colonna principale — qui resta
// solo l'azione di avviarne una nuova, per tenere la barra laterale
// stretta e compatta.
export function NuovaPraticaClienteEsterno({
  clienteId,
  telefono,
  email,
  nome,
}: {
  clienteId: number;
  telefono: string | null;
  email: string | null;
  nome: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [slug, setSlug] = useState<SlugRichiestaCliente | "">("");
  const [inCorsoDisdetta, startDisdetta] = useTransition();
  const [nomeNuovoTitolare, setNomeNuovoTitolare] = useState("");
  const [inCorsoSubentro, startSubentro] = useTransition();

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

  // ★ NUOVA (2026-09) — vedi avviaSubentroClienteEsterno(): crea da solo il
  // Ticket per il cliente attuale e avvia subito la pratica, poi porta
  // dritto lì per inviare i due link (vecchio/nuovo cliente) — un solo
  // click da qui, invece di dover prima creare un Ticket a parte e cercare
  // il pannello dentro.
  function avviaSubentro() {
    startSubentro(async () => {
      const risultato = await avviaSubentroClienteEsterno(clienteId, nomeNuovoTitolare || null);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      toast(`Pratica di Subentro avviata — Ticket #${risultato.ticketNumero}.`, "successo");
      router.push(`/tickets?aperto=${risultato.ticketId}`);
    });
  }

  const link = useMemo(() => {
    if (!slug || typeof window === "undefined") return "";
    return `${window.location.origin}/richiesta-cliente/${slug}?clienteEsternoId=${clienteId}`;
  }, [slug, clienteId]);

  const messaggio = slug ? messaggioWhatsappPratica(nome, RICHIESTE_CLIENTE_CONFIG[slug].titolo, link) : "";

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-md">
      <h2 className="mb-3 flex items-center gap-2 font-heading text-sm font-bold">
        <IconaCategoria icona={FileSignature} categoria="documento" />
        Nuova pratica
      </h2>

      <div>
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

      {/* ★ NUOVA (2026-09) — Subentro, a differenza delle 3 sopra ha bisogno
      di un Ticket: il pulsante lo crea da solo (dati già in anagrafica) e
      avvia subito la pratica, poi porta dritto al pannello per inviare i
      due link — vedi avviaSubentroClienteEsterno(). */}
      <div className="mt-3 border-t pt-3">
        <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          <IconaCategoria icona={Repeat} categoria="documento" dimensione="sm" />
          Subentro
        </p>
        <div className="flex flex-col gap-2">
          <Input
            value={nomeNuovoTitolare}
            onChange={(e) => setNomeNuovoTitolare(e.target.value)}
            placeholder="Nome nuovo titolare (facoltativo)"
            className="h-9 text-xs"
          />
          <button
            type="button"
            onClick={avviaSubentro}
            disabled={inCorsoSubentro}
            className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
          >
            {inCorsoSubentro ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Repeat className="h-3.5 w-3.5" strokeWidth={2.25} />}
            {inCorsoSubentro ? "Avvio in corso…" : "Avvia Subentro"}
          </button>
          <p className="text-[11px] text-muted-foreground">Crea un Ticket per questo cliente e apre subito il pannello per inviare i due link (vecchio/nuovo titolare).</p>
        </div>
      </div>

      {/* ★ NUOVA (2026-08) — Disdetta, a differenza delle 3 sopra, non ha un
      modulo pubblico (la normativa richiede una comunicazione scritta
      tracciabile — vedi /disdetta, resta di sole istruzioni, invariata).
      Questo pulsante non la sostituisce: serve solo a far comparire la
      pratica qui insieme alle altre, invece di restare invisibile. */}
      <div className="mt-3 border-t pt-3">
        <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          <IconaCategoria icona={FileX2} categoria="documento" dimensione="sm" />
          Disdetta
        </p>
        <div className="flex flex-col items-stretch gap-2">
          <button
            type="button"
            onClick={segnaDisdetta}
            disabled={inCorsoDisdetta}
            className="flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-critical/40 hover:text-critical disabled:opacity-50"
          >
            {inCorsoDisdetta ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <FileX2 className="h-3.5 w-3.5" strokeWidth={2.25} />}
            {inCorsoDisdetta ? "Salvataggio…" : "Segna disdetta ricevuta"}
          </button>
          <Link
            href="/disdetta"
            target="_blank"
            rel="noopener noreferrer"
            className="text-center text-xs font-semibold text-primary underline-offset-2 hover:underline"
          >
            Vedi le istruzioni ufficiali
          </Link>
        </div>
      </div>
    </div>
  );
}
