"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, MessageCircle, MapPin, Clock, Check, ChevronRight, Send, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { aggiornaStatoTicket, aggiungiNotaTicket } from "@/app/(app)/tickets/actions";
import { cambiaStatoAppuntamento } from "@/app/(app)/calendario/actions";
import { RapportinoForm } from "@/components/tickets/rapportino";
import type { Appuntamento, StatoTicket, Ticket } from "@/lib/types";

function telefonoIntl(telefono: string) {
  return "39" + telefono.replace(/\D/g, "").replace(/^0?39/, "").replace(/^0/, "");
}

const SEQUENZA_STATO: StatoTicket[] = ["Da gestire", "In lavorazione", "In attesa", "Completato"];

const COLORE_PRIORITA: Record<string, string> = {
  Urgente: "bg-critical/10 text-critical border-critical/20",
  Normale: "bg-warning/10 text-warning border-warning/20",
  Bassa: "bg-success/10 text-success border-success/20",
};

export function VistaTecnicoBoard({
  appuntamenti,
  tickets,
  completatiOggi,
}: {
  appuntamenti: Appuntamento[];
  tickets: Ticket[];
  completatiOggi: Ticket[];
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [ticketRapportino, setTicketRapportino] = useState<Ticket | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [invioNota, setInvioNota] = useState<string | null>(null);

  async function inviaNota(ticketId: string) {
    const testo = (note[ticketId] || "").trim();
    if (!testo) return;
    setInvioNota(ticketId);
    const risultato = await aggiungiNotaTicket(ticketId, testo);
    setInvioNota(null);
    if (risultato.errore) {
      alert(risultato.errore);
      return;
    }
    setNote((n) => ({ ...n, [ticketId]: "" }));
    router.refresh();
  }

  async function completaAppuntamento(id: string) {
    setInCorso(id);
    try {
      await cambiaStatoAppuntamento(id, "Completato");
      router.refresh();
    } finally {
      setInCorso(null);
    }
  }

  async function avanzaTicket(t: Ticket) {
    const idx = SEQUENZA_STATO.indexOf(t.stato);
    const prossimo = SEQUENZA_STATO[idx + 1];
    if (!prossimo) return;
    // ★ passare a Completato richiede il rapportino di chiusura sul campo.
    if (prossimo === "Completato") {
      setTicketRapportino(t);
      return;
    }
    setInCorso(t.id);
    try {
      await aggiornaStatoTicket(t.id, prossimo, t.stato);
      router.refresh();
    } finally {
      setInCorso(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Appuntamenti di oggi ({appuntamenti.length})
        </h2>
        {appuntamenti.length === 0 && (
          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nessun appuntamento in programma.
          </div>
        )}
        <div className="flex flex-col gap-3">
          {appuntamenti.map((a) => (
            <div key={a.id} className="rounded-2xl border bg-card p-4 shadow-md">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-primary">
                <Clock className="h-4 w-4" strokeWidth={2.5} />
                {new Date(a.data_ora).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-lg font-semibold">{a.titolo}</span>
                <StatusBadge status={a.tipo_servizio} />
              </div>
              {a.indirizzo && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(a.indirizzo)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-2 hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                  {a.indirizzo}
                </a>
              )}
              {a.note && <p className="mb-3 text-sm text-muted-foreground">{a.note}</p>}
              <button
                onClick={() => completaAppuntamento(a.id)}
                disabled={inCorso === a.id}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-success/10 py-3 text-sm font-bold text-success"
              >
                <Check className="h-4 w-4" strokeWidth={2.5} />
                Segna completato
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          I miei Ticket aperti ({tickets.length})
        </h2>
        {tickets.length === 0 && (
          <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nessun ticket assegnato.
          </div>
        )}
        <div className="flex flex-col gap-3">
          {tickets.map((t) => {
            const puoAvanzare = SEQUENZA_STATO.indexOf(t.stato) < SEQUENZA_STATO.length - 1;
            return (
              <div key={t.id} className="rounded-2xl border bg-card p-4 shadow-md">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-lg font-semibold">{t.cliente}</span>
                  <span className="font-mono text-xs text-muted-foreground">#{t.numero}</span>
                </div>
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <Badge variant="outline" className={COLORE_PRIORITA[t.priorita]}>
                    {t.priorita}
                  </Badge>
                  <Badge variant="outline">{t.stato}</Badge>
                </div>
                {t.problema && <p className="mb-3 text-sm text-muted-foreground">{t.problema}</p>}
                {t.indirizzo && (
                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(t.indirizzo)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-2 hover:underline"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                    {t.indirizzo}
                  </a>
                )}
                <div className="flex gap-2">
                  {t.telefono && (
                    <a
                      href={`tel:${t.telefono}`}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-bold text-accent-foreground"
                    >
                      <Phone className="h-4 w-4" strokeWidth={2.5} />
                      Chiama
                    </a>
                  )}
                  {t.telefono && (
                    <a
                      href={`https://wa.me/${telefonoIntl(t.telefono)}?text=${encodeURIComponent(`Ciao ${t.cliente}, sono il tecnico Done Wifi in arrivo per il tuo intervento.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#25b063]/10 py-3 text-sm font-bold text-[#1a8046]"
                    >
                      <MessageCircle className="h-4 w-4" strokeWidth={2.5} />
                      WhatsApp
                    </a>
                  )}
                  {puoAvanzare && (
                    <button
                      onClick={() => avanzaTicket(t)}
                      disabled={inCorso === t.id}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary to-[color-mix(in_oklch,var(--primary),black_14%)] py-3 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25"
                    >
                      Avanza
                      <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                  )}
                </div>
                <div className="mt-2.5 flex gap-2">
                  <input
                    value={note[t.id] || ""}
                    onChange={(e) => setNote((n) => ({ ...n, [t.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && inviaNota(t.id)}
                    placeholder="Nota rapida (es. cliente non in casa)..."
                    className="h-10 flex-1 rounded-xl border bg-background px-3 text-sm"
                  />
                  <button
                    onClick={() => inviaNota(t.id)}
                    disabled={invioNota === t.id || !(note[t.id] || "").trim()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" strokeWidth={2.25} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {completatiOggi.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Completati oggi ({completatiOggi.length})
          </h2>
          <div className="flex flex-col gap-2">
            {completatiOggi.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" strokeWidth={2.25} />
                <span className="min-w-0 flex-1 truncate text-sm">{t.cliente}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">#{t.numero}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <Sheet open={!!ticketRapportino} onOpenChange={(v) => !v && setTicketRapportino(null)}>
        <SheetContent>
          {ticketRapportino && (
            <>
              <SheetHeader>
                <SheetTitle>{ticketRapportino.cliente}</SheetTitle>
                <SheetDescription>Chiudi il ticket con il rapportino di intervento.</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">
                <RapportinoForm
                  ticketId={ticketRapportino.id}
                  ticketNumero={ticketRapportino.numero}
                  statoVecchio={ticketRapportino.stato}
                  onAnnulla={() => setTicketRapportino(null)}
                  onSalvato={() => {
                    setTicketRapportino(null);
                    router.refresh();
                  }}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
