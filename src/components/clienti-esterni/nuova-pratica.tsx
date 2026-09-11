"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSignature, Loader2, Repeat, FileX2 } from "lucide-react";
import { InvioLinkCliente } from "@/components/condivisi/invio-link";
import { IconaCategoria } from "@/components/condivisi/icona-categoria";
import { Input } from "@/components/ui/input";
import { inviaEmailPraticaClienteEsterno, segnaDisdettaRicevuta, avviaSubentroClienteEsterno } from "@/app/(app)/clienti-esterni/actions";
import { RICHIESTE_CLIENTE_CONFIG, messaggioWhatsappPratica, type SlugRichiestaCliente } from "@/lib/richieste-cliente-config";
import { REPARTO_PER_TIPO_RICHIESTA } from "@/lib/types";
import { useToast } from "@/components/ui/toast";

/** ★ RIUNIFICATA (2026-09-10, "riorganizziamo il sistema nuova pratica.
 * semplifichiamo" — proposta approvata dell'artifact "Nuova Pratica,
 * Unificata") — le 5 pratiche disponibili erano trattate in 3 modi
 * diversi: un menu per Trasferimento/Cambio IBAN/Cambio Anagrafica, un
 * blocco sempre visibile per il Subentro, un altro ancora per la
 * Disdetta — tre linguaggi diversi per la stessa domanda ("che pratica
 * vuoi avviare?"). "Disdetta" non è una vera SlugRichiestaCliente (non
 * ha un modulo pubblico, solo "segna ricevuta" — vedi sotto), da qui
 * l'unione con "| 'disdetta'": un solo elenco, un solo posto da cui
 * parte qualunque pratica, il contenuto sotto cambia in base a quale hai
 * scelto invece di restare tre sezioni sempre in vista. */
type PraticaScelta = SlugRichiestaCliente | "disdetta";

const PRATICHE_DISPONIBILI: { slug: PraticaScelta; titolo: string }[] = [
  { slug: "trasferimento", titolo: "Trasferimento" },
  { slug: "cambio-iban", titolo: "Cambio IBAN" },
  { slug: "cambio-anagrafica", titolo: "Cambio Anagrafica" },
  { slug: "subentro", titolo: "Subentro" },
  { slug: "disdetta", titolo: "Disdetta" },
];

// ★ NUOVA (2026-08) — "Pratiche cliente senza Ticket": l'operatore avvia
// qui, dalla scheda del Cliente Esterno, lo stesso link pubblico che prima
// esisteva solo dentro il pannello "Invia una pratica al cliente" di un
// Ticket — nessun Ticket da creare per Trasferimento/Cambio IBAN/Cambio
// Anagrafica.
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
  const [scelta, setScelta] = useState<PraticaScelta | "">("");
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

  // ★ le 3 pratiche con un vero modulo pubblico (Subentro ha il proprio
  // flusso a doppio consenso più sotto, Disdetta non ne ha uno affatto —
  // vedi commento sul tipo PraticaScelta).
  const slugGenerico = scelta === "trasferimento" || scelta === "cambio-iban" || scelta === "cambio-anagrafica" ? scelta : null;

  const link = useMemo(() => {
    if (!slugGenerico || typeof window === "undefined") return "";
    return `${window.location.origin}/richiesta-cliente/${slugGenerico}?clienteEsternoId=${clienteId}`;
  }, [slugGenerico, clienteId]);

  const messaggio = slugGenerico ? messaggioWhatsappPratica(nome, RICHIESTE_CLIENTE_CONFIG[slugGenerico].titolo, link) : "";

  // ★ NUOVA (2026-09-11, bug reale segnalato: "dall'area del cliente non
  // riesco a mandare la mail per far fare la disdetta") — InvioLinkCliente
  // era già pensato apposta anche per la Disdetta ("estratto qui per essere
  // riusabile anche da Richieste Clienti e Disdetta", vedi il suo stesso
  // commento in condivisi/invio-link.tsx) ma non era mai stato collegato
  // qui: si poteva solo "segnare ricevuta" o aprire il link da soli, mai
  // mandarlo al cliente. Il link punta alla pagina di sole istruzioni
  // (/disdetta) — non sostituisce la comunicazione ufficiale scritta
  // (raccomandata/PEC), la informa solo su come farla, esattamente come le
  // altre 3 pratiche informano il cliente del modulo da compilare.
  const linkDisdetta = useMemo(() => {
    if (scelta !== "disdetta" || typeof window === "undefined") return "";
    return `${window.location.origin}/disdetta`;
  }, [scelta]);
  const messaggioDisdetta = linkDisdetta ? messaggioWhatsappPratica(nome, "Disdetta contratto", linkDisdetta) : "";

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-md">
      <h2 className="mb-3 flex items-center gap-2 font-heading text-sm font-bold">
        <IconaCategoria icona={FileSignature} categoria="documento" />
        Nuova pratica
      </h2>

      <select
        value={scelta}
        onChange={(e) => setScelta(e.target.value as PraticaScelta | "")}
        className="h-9 w-full rounded-lg border bg-background px-3 text-xs"
      >
        <option value="">Scegli una pratica...</option>
        {PRATICHE_DISPONIBILI.map((p) => (
          <option key={p.slug} value={p.slug}>{p.titolo}</option>
        ))}
      </select>

      {slugGenerico && (
        <div className="mt-2.5">
          <InvioLinkCliente
            url={link}
            telefono={telefono}
            email={email}
            messaggio={messaggio}
            onInviaEmail={() =>
              inviaEmailPraticaClienteEsterno(clienteId, RICHIESTE_CLIENTE_CONFIG[slugGenerico].titolo, link, REPARTO_PER_TIPO_RICHIESTA[RICHIESTE_CLIENTE_CONFIG[slugGenerico].tipo])
            }
          />
        </div>
      )}

      {/* ★ Subentro, a differenza delle 3 sopra ha bisogno di un Ticket: il
      pulsante lo crea da solo (dati già in anagrafica) e avvia subito la
      pratica, poi porta dritto al pannello per inviare i due link — vedi
      avviaSubentroClienteEsterno(). */}
      {scelta === "subentro" && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border bg-muted/40 p-3">
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
      )}

      {/* ★ Disdetta, a differenza delle altre non ha un modulo pubblico da
      compilare (la normativa richiede una comunicazione scritta
      tracciabile — vedi /disdetta, resta di sole istruzioni, invariata) —
      ma può comunque essere INVIATA al cliente (WhatsApp/Email) come le
      altre, così sa subito come procedere invece di doverlo scoprire da
      solo o via telefono. "Segna disdetta ricevuta" resta separato: non
      sostituisce la comunicazione ufficiale, serve solo a tracciarla qui. */}
      {scelta === "disdetta" && (
        <div className="mt-3 flex flex-col items-stretch gap-2 rounded-xl border bg-muted/40 p-3">
          <InvioLinkCliente
            url={linkDisdetta}
            telefono={telefono}
            email={email}
            messaggio={messaggioDisdetta}
            onInviaEmail={() => inviaEmailPraticaClienteEsterno(clienteId, "Disdetta contratto", linkDisdetta, "Fatturazione")}
          />
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
      )}
    </div>
  );
}
