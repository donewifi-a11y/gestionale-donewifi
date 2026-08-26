import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, Phone, Mail } from "lucide-react";
import { getTicketTecnicoEsterno } from "../../actions";
import { getTecnicoEsternoCorrente } from "@/lib/tecnico-esterno";
import { InterventoDettaglio } from "@/components/pose/intervento-dettaglio";

export default async function InterventoPoseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const tecnico = await getTecnicoEsternoCorrente();
  if (!tecnico) redirect("/pose/login");

  const ticket = await getTicketTecnicoEsterno(id);
  if (!ticket) notFound();

  const completato = ticket.stato === "Completato" || ticket.stato === "Annullato";

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 py-6">
      <Link href="/pose" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
        I tuoi interventi
      </Link>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-muted-foreground">#{ticket.numero}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{ticket.stato}</span>
        </div>
        <p className="mt-1 text-lg font-bold">{ticket.cliente}</p>
        <div className="mt-2 flex flex-col gap-1.5 text-sm">
          {ticket.indirizzo && (
            <span className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.25} />
              {ticket.indirizzo}
            </span>
          )}
          {ticket.telefono && (
            <a href={`tel:${ticket.telefono}`} className="flex items-center gap-1.5 text-primary hover:underline">
              <Phone className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
              {ticket.telefono}
            </a>
          )}
          {ticket.email && (
            <a href={`mailto:${ticket.email}`} className="flex items-center gap-1.5 text-primary hover:underline">
              <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
              {ticket.email}
            </a>
          )}
        </div>
        {ticket.problema && (
          <div className="mt-3 border-t pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Problema segnalato</p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{ticket.problema}</p>
          </div>
        )}
      </div>

      {completato ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          Questo intervento risulta già {ticket.stato.toLowerCase()}.
        </p>
      ) : (
        <InterventoDettaglio ticket={ticket} />
      )}
    </div>
  );
}
