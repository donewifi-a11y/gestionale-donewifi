"use client";

import Link from "next/link";
import { FileText, ClipboardList } from "lucide-react";
import { urlContratto } from "@/app/(app)/segnalazioni/actions";
import { useToast } from "@/components/ui/toast";
import type { InstallazioneCliente } from "@/app/(app)/clienti-esterni/actions";

/** ★ NUOVA — richiesta esplicita: elenco delle installazioni fatte, con
 * sia il contratto sia la Scheda di lavoro raggiungibili da qui. Il
 * contratto si apre subito (URL firmata generata al click, stesso
 * principio già in uso in Archivio/Segnalazioni/Ticket — mai un URL
 * firmata incorporata nella pagina, che scadrebbe prima di essere
 * cliccata); la Scheda si vede aprendo il Ticket collegato (già mostrata
 * lì da SchedaVista, non duplicata qui). */
export function InstallazioniCliente({ installazioni }: { installazioni: InstallazioneCliente[] }) {
  const toast = useToast();

  async function vediContratto(percorso: string) {
    const risultato = await urlContratto(percorso);
    if (risultato.errore || !risultato.url) {
      toast(risultato.errore || "Errore imprevisto.");
      return;
    }
    window.open(risultato.url, "_blank", "noopener,noreferrer");
  }

  if (installazioni.length === 0) {
    return <p className="text-sm text-muted-foreground">Nessuna installazione completata ancora per questo cliente.</p>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {installazioni.map((i) => (
        <div key={i.schedaId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm">
          <div>
            <span className="font-semibold">Ticket #{i.ticketNumero}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              installata il {new Date(i.completataIl).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {i.contrattoUrl ? (
              <button
                onClick={() => vediContratto(i.contrattoUrl!)}
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition hover:bg-muted"
              >
                <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
                Contratto
              </button>
            ) : (
              <span className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground">
                <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
                Nessun contratto
              </span>
            )}
            <Link
              href={`/tickets?aperto=${i.ticketId}`}
              className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition hover:bg-muted"
            >
              <ClipboardList className="h-3.5 w-3.5" strokeWidth={2.25} />
              Scheda di lavoro
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
