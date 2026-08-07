import { AlertTriangle, Wifi, FileText } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { urlFirmataDocumento } from "@/lib/documenti";
import { ConfermaBottone } from "@/components/approva/conferma-bottone";

// ★ FIX — forma del join dichiarata esplicitamente invece del doppio cast
// `as unknown as`: ticket_id/segnalazione_id sono le uniche due FK di
// token_approvazione (migrazioni 0013 e 0044, mai valorizzate insieme),
// quindi ciascun embed è sempre un oggetto singolo o null, mai un array.
interface RigaTokenApprovazione {
  origine: "intervento" | "contratto";
  tickets: { numero: number; cliente: string; categoria: string } | null;
  segnalazioni: { numero: number; nome: string; contratto_pdf_url: string | null } | null;
}

// ★ NUOVA — lo stesso link/token monouso usato per l'approvazione
// dell'intervento su Ticket (migrazione 0013) ora serve anche per far
// approvare al cliente il contratto di una Segnalazione, prima di
// "Trasmetti per l'installazione" — vedi token_approvazione.origine.
export default async function ApprovaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: riga, error } = await supabase
    .from("token_approvazione")
    .select("origine, tickets(numero, cliente, categoria), segnalazioni(numero, nome, contratto_pdf_url)")
    .eq("token", token)
    .maybeSingle();
  if (error) console.error("ApprovaPage:", error.message);

  const dati = riga as unknown as RigaTokenApprovazione | null;
  const ticket = dati?.tickets ?? undefined;
  const segnalazione = dati?.segnalazioni ?? undefined;

  let urlContratto: string | null = null;
  if (segnalazione?.contratto_pdf_url) {
    const risultato = await urlFirmataDocumento(segnalazione.contratto_pdf_url);
    urlContratto = risultato.url;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[oklch(0.22_0.035_255)] p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl bg-card p-8 text-center shadow-2xl">
        <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <Wifi className="h-5 w-5" strokeWidth={2.5} />
        </div>
        {!dati || (!ticket && !segnalazione) ? (
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
