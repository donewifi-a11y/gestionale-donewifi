"use client";

import { useMemo, useState } from "react";
import { FileSignature, MapPinned, CreditCard, FileEdit } from "lucide-react";
import { InvioLinkCliente } from "@/components/condivisi/invio-link";
import { inviaEmailPraticaClienteEsterno } from "@/app/(app)/clienti-esterni/actions";
import { RICHIESTE_CLIENTE_CONFIG, type SlugRichiestaCliente } from "@/lib/richieste-cliente-config";
import { REPARTO_PER_TIPO_RICHIESTA, type RichiestaCliente } from "@/lib/types";

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
  const [slug, setSlug] = useState<SlugRichiestaCliente | "">("");

  const link = useMemo(() => {
    if (!slug || typeof window === "undefined") return "";
    return `${window.location.origin}/richiesta-cliente/${slug}?clienteEsternoId=${clienteId}`;
  }, [slug, clienteId]);

  const primoNome = nome.trim().split(/\s+/)[0];
  const messaggio = slug ? `Ciao ${primoNome}, per la tua pratica di ${RICHIESTE_CLIENTE_CONFIG[slug].titolo.toLowerCase()} con Done Wifi apri questo link: ${link}` : "";

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
    </div>
  );
}
