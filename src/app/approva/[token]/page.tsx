import { AlertTriangle, Wifi } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { ConfermaBottone } from "@/components/approva/conferma-bottone";

export default async function ApprovaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: riga } = await supabase
    .from("token_approvazione")
    .select("ticket_id, tickets(numero, cliente, categoria)")
    .eq("token", token)
    .maybeSingle();

  const ticket = riga?.tickets as unknown as { numero: number; cliente: string; categoria: string } | undefined;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[oklch(0.22_0.035_255)] p-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl bg-card p-8 text-center shadow-2xl">
        <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <Wifi className="h-5 w-5" strokeWidth={2.5} />
        </div>
        {!riga || !ticket ? (
          <>
            <AlertTriangle className="h-8 w-8 text-warning" strokeWidth={2} />
            <p className="font-heading text-lg font-bold">Link non valido</p>
            <p className="text-sm text-muted-foreground">
              Questo link di approvazione è scaduto o è già stato usato. Se pensi sia un errore, contatta Done Wifi.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-heading text-lg font-bold">Conferma Intervento</h1>
            <p className="text-sm text-muted-foreground">
              Ticket #{ticket.numero} · {ticket.categoria}
              <br />
              {ticket.cliente}, confermi che l&apos;intervento è stato risolto correttamente?
            </p>
            <ConfermaBottone token={token} />
          </>
        )}
      </div>
    </div>
  );
}
