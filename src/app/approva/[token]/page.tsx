import { AlertTriangle, FileText } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { urlFirmataDocumento } from "@/lib/documenti";
import { ConfermaBottone } from "@/components/approva/conferma-bottone";
import { formattaValuta } from "@/lib/types";
import type { RigaPreventivo } from "@/lib/types";

// ★ FIX — forma del join dichiarata esplicitamente invece del doppio cast
// `as unknown as`: ticket_id/segnalazione_id/preventivo_id sono le uniche
// FK di token_approvazione (migrazioni 0013, 0044, 0047, mai valorizzate
// insieme), quindi ciascun embed è sempre un oggetto singolo o null, mai
// un array.
interface RigaTokenApprovazione {
  origine: "intervento" | "contratto" | "preventivo";
  tickets: { numero: number; cliente: string; categoria: string } | null;
  segnalazioni: { numero: number; nome: string; contratto_pdf_url: string | null } | null;
  preventivi: { numero: number; cliente_nome: string; righe: RigaPreventivo[]; totale: number } | null;
}

// ★ NUOVA — lo stesso link/token monouso usato per l'approvazione
// dell'intervento su Ticket (migrazione 0013) e del contratto di una
// Segnalazione (migrazione 0044) ora serve anche per il Preventivo — vedi
// token_approvazione.origine. A differenza degli altri due, qui il
// preventivo si mostra per intero (righe/totale, niente PDF) e il cliente
// può anche rifiutarlo esplicitamente, non solo approvarlo.
export default async function ApprovaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: riga, error } = await supabase
    .from("token_approvazione")
    .select("origine, tickets(numero, cliente, categoria), segnalazioni(numero, nome, contratto_pdf_url), preventivi(numero, cliente_nome, righe, totale)")
    .eq("token", token)
    .maybeSingle();
  if (error) console.error("ApprovaPage:", error.message);

  const dati = riga as unknown as RigaTokenApprovazione | null;
  const ticket = dati?.tickets ?? undefined;
  const segnalazione = dati?.segnalazioni ?? undefined;
  const preventivo = dati?.preventivi ?? undefined;

  let urlContratto: string | null = null;
  if (segnalazione?.contratto_pdf_url) {
    const risultato = await urlFirmataDocumento(segnalazione.contratto_pdf_url);
    urlContratto = risultato.url;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#141414] p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl bg-card p-8 text-center shadow-2xl">
        <img src="/brand/logo-completo.png" alt="Done Wifi" className="mb-1 h-14 w-14" />
        {!dati || (!ticket && !segnalazione && !preventivo) ? (
          <>
            <AlertTriangle className="h-8 w-8 text-warning" strokeWidth={2} />
            <p className="font-heading text-lg font-bold">Link non valido</p>
            <p className="text-sm text-muted-foreground">
              Questo link di approvazione è scaduto o è già stato usato. Se pensi sia un errore, contatta Done Wifi.
            </p>
          </>
        ) : ticket ? (
          <>
            <h1 className="font-heading text-lg font-bold">Conferma Intervento</h1>
            <p className="text-sm text-muted-foreground">
              Ticket #{ticket.numero} · {ticket.categoria}
              <br />
              {ticket.cliente}, confermi che l&apos;intervento è stato risolto correttamente?
            </p>
            <ConfermaBottone token={token} tipo="intervento" />
          </>
        ) : preventivo ? (
          <>
            <h1 className="font-heading text-lg font-bold">Il tuo preventivo</h1>
            <p className="text-sm text-muted-foreground">
              Preventivo #{preventivo.numero}
              <br />
              {preventivo.cliente_nome}, ecco il dettaglio.
            </p>
            <div className="w-full rounded-lg border bg-muted/40 p-3 text-left text-sm">
              {preventivo.righe.map((r, i) => (
                <div key={i} className="flex items-start justify-between gap-2 py-1 text-xs">
                  <span className="text-muted-foreground">
                    {r.descrizione} {r.quantita > 1 ? `× ${r.quantita}` : ""}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{formattaValuta(r.quantita * r.prezzoUnitario)}</span>
                </div>
              ))}
              <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm font-bold">
                <span>Totale</span>
                <span className="tabular-nums">{formattaValuta(preventivo.totale)}</span>
              </div>
            </div>
            <ConfermaBottone token={token} tipo="preventivo" />
          </>
        ) : (
          <>
            <h1 className="font-heading text-lg font-bold">Approva il tuo contratto</h1>
            <p className="text-sm text-muted-foreground">
              Pratica #{segnalazione!.numero}
              <br />
              {segnalazione!.nome}, prima di procedere con l&apos;installazione leggi il contratto e approvalo.
            </p>
            {urlContratto && (
              <a
                href={urlContratto}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-semibold text-primary underline-offset-2 hover:underline"
              >
                <FileText className="h-4 w-4" strokeWidth={2.25} />
                Leggi il contratto (PDF)
              </a>
            )}
            <ConfermaBottone token={token} tipo="contratto" />
          </>
        )}
      </div>
    </div>
  );
}
