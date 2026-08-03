"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, MessageCircle, MapPin, Clock, Check, ChevronRight, Send, CheckCircle2, FilePlus2, Building2, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { IndirizzoAutocomplete } from "@/components/condivisi/indirizzo-autocomplete";
import { aggiornaStatoTicket, aggiungiNotaTicket, creaTicket } from "@/app/(app)/tickets/actions";
import { RapportinoForm } from "@/components/tickets/rapportino";
import { PianificaAppuntamento } from "@/components/tickets/tickets-board";
import { SchedaInstallazioneForm } from "@/components/schede/scheda-installazione-form";
import { SchedaLavorazioneForm } from "@/components/schede/scheda-lavorazione-form";
import type { Appuntamento, MaterialeMagazzino, Persona, StatoTicket, Ticket } from "@/lib/types";

// ★ NUOVO — il tecnico può aprire da solo un Ticket per un "Nuovo
// contratto" (nuova installazione da vendere/pianificare) o un
// "Intervento in loco" (assistenza tecnica sul posto), senza passare
// dal form completo di /tickets/nuovo pensato per chi smista i ticket.
// Le due scelte mappano sulle stesse categoria/sottocategoria già
// esistenti (vedi SOTTOCATEGORIE_TICKET), quindi il ticket resta
// identico a uno creato dal form normale — solo il percorso è più
// corto per chi è già sul campo. Dopo la creazione si passa subito
// alla pianificazione (PianificaAppuntamento, riusato da tickets-board)
// con tipo_servizio già impostato in base alla scelta, cosicché
// "Segna completato" apra poi la Scheda giusta (Installazione o
// Lavorazione tecnica).
type TipoRichiestaRapida = "Nuovo contratto" | "Intervento in loco";

const CONFIG_RICHIESTA_RAPIDA: Record<
  TipoRichiestaRapida,
  { categoria: string; reparto: "Commerciale" | "Analisi Rete"; tipoServizio: "Nuova installazione" | "Lavorazione tecnica"; icona: typeof Building2; descrizione: string }
> = {
  "Nuovo contratto": {
    categoria: "Commerciale",
    reparto: "Commerciale",
    tipoServizio: "Nuova installazione",
    icona: Building2,
    descrizione: "Cliente nuovo da attivare, con installazione da pianificare.",
  },
  "Intervento in loco": {
    categoria: "Assistenza",
    reparto: "Analisi Rete",
    tipoServizio: "Lavorazione tecnica",
    icona: Wrench,
    descrizione: "Guasto o lavorazione tecnica sul posto per un cliente già attivo.",
  },
};

function NuovoTicketTecnico({ personaId, persone }: { personaId: string; persone: Persona[] }) {
  const router = useRouter();
  const [aperto, setAperto] = useState(false);
  const [tipo, setTipo] = useState<TipoRichiestaRapida | null>(null);
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [note, setNote] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [ticketCreato, setTicketCreato] = useState<Ticket | null>(null);

  function chiudi() {
    setAperto(false);
    setTipo(null);
    setCliente("");
    setTelefono("");
    setIndirizzo("");
    setNote("");
    setErrore("");
    setTicketCreato(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!tipo) return;
    if (!cliente.trim()) {
      setErrore("Il nome del cliente è obbligatorio.");
      return;
    }
    setErrore("");
    setInCorso(true);
    const config = CONFIG_RICHIESTA_RAPIDA[tipo];
    const risultato = await creaTicket({
      cliente: cliente.trim(),
      telefono,
      email: "",
      indirizzo,
      categoria: config.categoria,
      sottocategoria: tipo,
      problema: note,
      priorita: "Normale",
      reparto: config.reparto,
      dettagliExtra: {},
      tecnicoAssegnato: personaId,
    });
    setInCorso(false);
    if (risultato.errore || !risultato.ticket) {
      setErrore(risultato.errore || "Errore nella creazione del ticket.");
      return;
    }
    setTicketCreato(risultato.ticket);
    router.refresh();
  }

  if (!aperto) {
    return (
      <Button className="w-full justify-center gap-2" onClick={() => setAperto(true)}>
        <FilePlus2 className="h-4 w-4" strokeWidth={2.25} />
        Nuovo Ticket
      </Button>
    );
  }

  return (
    <Sheet open={aperto} onOpenChange={(v) => !v && chiudi()}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Nuovo Ticket</SheetTitle>
          <SheetDescription>Per un nuovo contratto o un intervento tecnico sul posto.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          {!tipo ? (
            <div className="flex flex-col gap-2.5">
              {(Object.keys(CONFIG_RICHIESTA_RAPIDA) as TipoRichiestaRapida[]).map((t) => {
                const c = CONFIG_RICHIESTA_RAPIDA[t];
                const Icona = c.icona;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className="flex items-start gap-3 rounded-xl border p-3.5 text-left transition hover:border-primary hover:bg-accent-soft/40"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icona className="h-4 w-4" strokeWidth={2.25} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{t}</div>
                      <div className="text-xs text-muted-foreground">{c.descrizione}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : ticketCreato ? (
            <div className="flex flex-col gap-3">
              <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                Ticket #{ticketCreato.numero} creato e assegnato a te.
              </p>
              <PianificaAppuntamento
                ticket={ticketCreato}
                persone={persone}
                tipoServizioIniziale={CONFIG_RICHIESTA_RAPIDA[tipo].tipoServizio}
                tecnicoIniziale={personaId}
                apertaSubito
              />
              <Button type="button" variant="ghost" onClick={chiudi}>
                Fatto
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tipo}</p>
              <div>
                <Label htmlFor="vt-cliente">Cliente *</Label>
                <Input id="vt-cliente" autoFocus required value={cliente} onChange={(e) => setCliente(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="vt-telefono">Telefono</Label>
                <Input id="vt-telefono" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="vt-indirizzo">Indirizzo</Label>
                <IndirizzoAutocomplete id="vt-indirizzo" name="indirizzo" value={indirizzo} onChange={setIndirizzo} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="vt-note">Note</Label>
                <Textarea id="vt-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1" />
              </div>
              {errore && <p className="text-xs text-critical">{errore}</p>}
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={inCorso} className="flex-1">
                  {inCorso ? "Creazione..." : "Crea Ticket"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setTipo(null)}>
                  Indietro
                </Button>
              </div>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

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
  catalogoMateriali,
  personaId,
  persone,
}: {
  appuntamenti: Appuntamento[];
  tickets: Ticket[];
  completatiOggi: Ticket[];
  catalogoMateriali: MaterialeMagazzino[];
  personaId: string | null;
  persone: Persona[];
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [ticketRapportino, setTicketRapportino] = useState<Ticket | null>(null);
  const [appuntamentoScheda, setAppuntamentoScheda] = useState<Appuntamento | null>(null);
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
      {personaId && (
        <section>
          <NuovoTicketTecnico personaId={personaId} persone={persone} />
        </section>
      )}

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
                onClick={() => setAppuntamentoScheda(a)}
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

      <Sheet open={!!appuntamentoScheda} onOpenChange={(v) => !v && setAppuntamentoScheda(null)}>
        <SheetContent className="sm:max-w-lg">
          {appuntamentoScheda && (
            <>
              <SheetHeader>
                <SheetTitle>{appuntamentoScheda.titolo}</SheetTitle>
                <SheetDescription>
                  {appuntamentoScheda.tipo_servizio === "Nuova installazione"
                    ? "Certificato di installazione a regola d'arte."
                    : "Rapporto di intervento in loco."}
                </SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">
                {appuntamentoScheda.tipo_servizio === "Nuova installazione" ? (
                  <SchedaInstallazioneForm
                    appuntamentoId={appuntamentoScheda.id}
                    catalogoMateriali={catalogoMateriali}
                    onAnnulla={() => setAppuntamentoScheda(null)}
                    onSalvato={() => {
                      setAppuntamentoScheda(null);
                      router.refresh();
                    }}
                  />
                ) : (
                  <SchedaLavorazioneForm
                    appuntamentoId={appuntamentoScheda.id}
                    catalogoMateriali={catalogoMateriali}
                    onAnnulla={() => setAppuntamentoScheda(null)}
                    onSalvato={() => {
                      setAppuntamentoScheda(null);
                      router.refresh();
                    }}
                  />
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
