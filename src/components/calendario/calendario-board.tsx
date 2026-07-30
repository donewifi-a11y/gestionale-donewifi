"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Clock, MapPin, Check, X as XIcon, AlertTriangle, StickyNote, Trash2, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  creaAppuntamento,
  modificaAppuntamento,
  cambiaStatoAppuntamento,
  creaNotaCalendario,
  completaNotaCalendario,
  eliminaNotaCalendario,
} from "@/app/(app)/calendario/actions";
import type { Appuntamento, NotaCalendario, Persona } from "@/lib/types";

interface TicketMinimo {
  id: string;
  numero: number;
  cliente: string;
  indirizzo: string | null;
}

function chiaveGiorno(iso: string) {
  return new Date(iso).toDateString();
}

function chiaveGiornoData(data: string) {
  // ★ "data" (colonna date, senza ora) va interpretata come mezzanotte
  // locale, non UTC, altrimenti finisce nel giorno sbagliato la sera.
  return new Date(`${data}T00:00:00`).toDateString();
}

function etichettaGiorno(iso: string) {
  const data = new Date(iso);
  const oggi = new Date();
  const domani = new Date();
  domani.setDate(oggi.getDate() + 1);
  if (chiaveGiorno(iso) === chiaveGiorno(oggi.toISOString())) return "Oggi";
  if (chiaveGiorno(iso) === chiaveGiorno(domani.toISOString())) return "Domani";
  return data.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
}

export function CalendarioBoard({
  appuntamenti,
  note,
  persone,
  ticket,
}: {
  appuntamenti: Appuntamento[];
  note: NotaCalendario[];
  persone: Persona[];
  ticket: TicketMinimo[];
}) {
  const [nuovo, setNuovo] = useState(false);
  const [nuovaNota, setNuovaNota] = useState(false);
  const [modifica, setModifica] = useState<Appuntamento | null>(null);
  const [ticketPreselezionato, setTicketPreselezionato] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  // ★ "Pianifica appuntamento" dal dettaglio Ticket — apre già il form con
  // il ticket collegato, invece di doverlo ricercare nel menu a tendina.
  useEffect(() => {
    const idTicket = searchParams.get("nuovoTicket");
    if (idTicket) {
      setTicketPreselezionato(idTicket);
      setNuovo(true);
    }
  }, [searchParams]);

  const gruppi = useMemo(() => {
    const mappa = new Map<string, { chiaveOrdinamento: string; appuntamenti: Appuntamento[]; note: NotaCalendario[] }>();
    appuntamenti.forEach((a) => {
      const k = chiaveGiorno(a.data_ora);
      if (!mappa.has(k)) mappa.set(k, { chiaveOrdinamento: a.data_ora, appuntamenti: [], note: [] });
      mappa.get(k)!.appuntamenti.push(a);
    });
    note.forEach((n) => {
      const k = chiaveGiornoData(n.data_promemoria);
      if (!mappa.has(k)) mappa.set(k, { chiaveOrdinamento: `${n.data_promemoria}T00:00:00`, note: [], appuntamenti: [] });
      mappa.get(k)!.note.push(n);
    });
    return Array.from(mappa.entries()).sort(
      (a, b) => new Date(a[1].chiaveOrdinamento).getTime() - new Date(b[1].chiaveOrdinamento).getTime()
    );
  }, [appuntamenti, note]);

  function trovaPersona(id: string | null) {
    return id ? persone.find((p) => p.id === id) ?? null : null;
  }

  async function cambiaStato(id: string, stato: Appuntamento["stato"]) {
    await cambiaStatoAppuntamento(id, stato);
    router.refresh();
  }

  async function alternaNota(n: NotaCalendario) {
    await completaNotaCalendario(n.id, !n.completata);
    router.refresh();
  }

  async function eliminaNota(id: string) {
    if (!confirm("Eliminare questo promemoria?")) return;
    await eliminaNotaCalendario(id);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex justify-end gap-2">
        <Button variant="outline" onClick={() => setNuovaNota(true)}>
          <NotebookPen className="h-4 w-4" strokeWidth={2.5} />
          Nuovo Promemoria
        </Button>
        <Button onClick={() => setNuovo(true)}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Nuovo Appuntamento
        </Button>
      </div>

      {gruppi.length === 0 && (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nessun appuntamento o promemoria in programma.
        </div>
      )}

      <div className="flex flex-col gap-6">
        {gruppi.map(([giorno, gruppo]) => (
          <div key={giorno}>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {etichettaGiorno(gruppo.chiaveOrdinamento)}
            </div>
            <div className="flex flex-col gap-2">
              {gruppo.note.map((n) => {
                const scaduta = !n.completata && chiaveGiornoData(n.data_promemoria) !== chiaveGiorno(new Date().toISOString()) && new Date(n.data_promemoria) < new Date(new Date().toDateString());
                return (
                  <div
                    key={n.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 shadow-sm ${
                      n.completata ? "bg-muted/40 opacity-60" : scaduta ? "border-critical/30 bg-critical/5" : "border-warning/30 bg-warning/10"
                    }`}
                  >
                    <StickyNote className={`h-4 w-4 shrink-0 ${n.completata ? "text-muted-foreground" : "text-warning"}`} strokeWidth={2.25} />
                    <span className={`min-w-0 flex-1 text-sm ${n.completata ? "line-through text-muted-foreground" : ""}`}>
                      {n.testo}
                    </span>
                    <button
                      onClick={() => alternaNota(n)}
                      title={n.completata ? "Segna da fare" : "Segna fatto"}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-success transition hover:bg-success/10"
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={() => eliminaNota(n.id)}
                      title="Elimina"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-critical transition hover:bg-critical/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                    </button>
                  </div>
                );
              })}
              {gruppo.appuntamenti.map((a) => {
                const tecnico = trovaPersona(a.tecnico_id);
                const ora = new Date(a.data_ora).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
                return (
                  <div
                    key={a.id}
                    className={`flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm ${
                      a.stato === "Annullato" ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-accent py-1.5 text-accent-foreground">
                      <Clock className="h-3 w-3" strokeWidth={2.5} />
                      <span className="text-xs font-bold">{ora}</span>
                    </div>
                    <button
                      onClick={() => a.stato === "Programmato" && setModifica(a)}
                      className="min-w-0 flex-1 text-left"
                      disabled={a.stato !== "Programmato"}
                    >
                      <div className="truncate font-semibold">{a.titolo}</div>
                      {a.indirizzo && (
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(a.indirizzo)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary hover:underline"
                        >
                          <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.25} />
                          {a.indirizzo}
                        </a>
                      )}
                    </button>
                    {tecnico && (
                      <span
                        title={tecnico.nome}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground"
                      >
                        {tecnico.nome.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    {a.stato === "Programmato" ? (
                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={() => cambiaStato(a.id, "Completato")}
                          title="Segna completato"
                          className="flex h-7 w-7 items-center justify-center rounded-full border text-success transition hover:bg-success/10"
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </button>
                        <button
                          onClick={() => cambiaStato(a.id, "Annullato")}
                          title="Annulla"
                          className="flex h-7 w-7 items-center justify-center rounded-full border text-critical transition hover:bg-critical/10"
                        >
                          <XIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          a.stato === "Completato" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {a.stato}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Sheet open={nuovo} onOpenChange={setNuovo}>
        <SheetContent>
          <FormNuovoAppuntamento
            persone={persone}
            ticket={ticket}
            ticketIniziale={ticketPreselezionato}
            onFatto={() => {
              setNuovo(false);
              setTicketPreselezionato("");
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={!!modifica} onOpenChange={(v) => !v && setModifica(null)}>
        <SheetContent>
          {modifica && <FormModificaAppuntamento appuntamento={modifica} persone={persone} onFatto={() => setModifica(null)} />}
        </SheetContent>
      </Sheet>

      <Sheet open={nuovaNota} onOpenChange={setNuovaNota}>
        <SheetContent>
          <FormNuovaNota ticket={ticket} onFatto={() => setNuovaNota(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FormNuovoAppuntamento({
  persone,
  ticket,
  ticketIniziale,
  onFatto,
}: {
  persone: Persona[];
  ticket: TicketMinimo[];
  ticketIniziale?: string;
  onFatto: () => void;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [ticketId, setTicketId] = useState(ticketIniziale || "");

  useEffect(() => {
    if (ticketIniziale) setTicketId(ticketIniziale);
  }, [ticketIniziale]);

  const ticketSelezionato = ticket.find((t) => t.id === ticketId);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const titolo = String(dati.get("titolo") || "").trim();
    const data = String(dati.get("data") || "");
    const ora = String(dati.get("ora") || "");
    if (!titolo || !data || !ora) {
      setErrore("Titolo, data e ora sono obbligatori.");
      return;
    }
    setInCorso(true);
    const risultato = await creaAppuntamento({
      titolo,
      indirizzo: String(dati.get("indirizzo") || ""),
      dataOra: new Date(`${data}T${ora}`).toISOString(),
      durataMinuti: Number(dati.get("durata") || 60),
      tecnicoId: String(dati.get("tecnico") || ""),
      ticketId,
      note: String(dati.get("note") || ""),
    });
    setInCorso(false);
    if (risultato.errore) {
      setErrore(risultato.errore);
      return;
    }
    router.refresh();
    onFatto();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Nuovo Appuntamento</SheetTitle>
        <SheetDescription>Programma un’installazione o una visita.</SheetDescription>
      </SheetHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-4">
        <div>
          <Label htmlFor="ticket">Ticket collegato (facoltativo)</Label>
          <select
            id="ticket"
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Nessuno</option>
            {ticket.map((t) => (
              <option key={t.id} value={t.id}>#{t.numero} — {t.cliente}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="titolo">Titolo *</Label>
          <Input key={ticketId} id="titolo" name="titolo" required autoFocus defaultValue={ticketSelezionato?.cliente ?? ""} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="indirizzo">Indirizzo</Label>
          <Input key={ticketId} id="indirizzo" name="indirizzo" defaultValue={ticketSelezionato?.indirizzo ?? ""} className="mt-1" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Label htmlFor="data">Data *</Label>
            <Input id="data" name="data" type="date" required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="ora">Ora *</Label>
            <Input id="ora" name="ora" type="time" required className="mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="durata">Durata (min)</Label>
            <Input id="durata" name="durata" type="number" defaultValue={60} step={15} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="tecnico">Tecnico</Label>
            <select id="tecnico" name="tecnico" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Da assegnare</option>
              {persone.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="note">Note</Label>
          <Input id="note" name="note" placeholder="es. portare router di scorta" className="mt-1" />
        </div>
        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}
        <Button type="submit" disabled={inCorso} className="mt-2">
          {inCorso ? "Creazione..." : "Crea Appuntamento"}
        </Button>
      </form>
    </>
  );
}

function FormModificaAppuntamento({
  appuntamento,
  persone,
  onFatto,
}: {
  appuntamento: Appuntamento;
  persone: Persona[];
  onFatto: () => void;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const dataOra = new Date(appuntamento.data_ora);
  const dataDefault = dataOra.toISOString().slice(0, 10);
  const oraDefault = dataOra.toTimeString().slice(0, 5);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const titolo = String(dati.get("titolo") || "").trim();
    const data = String(dati.get("data") || "");
    const ora = String(dati.get("ora") || "");
    if (!titolo || !data || !ora) {
      setErrore("Titolo, data e ora sono obbligatori.");
      return;
    }
    setInCorso(true);
    const risultato = await modificaAppuntamento(appuntamento.id, {
      titolo,
      indirizzo: String(dati.get("indirizzo") || ""),
      dataOra: new Date(`${data}T${ora}`).toISOString(),
      durataMinuti: Number(dati.get("durata") || 60),
      tecnicoId: String(dati.get("tecnico") || ""),
      note: String(dati.get("note") || ""),
    });
    setInCorso(false);
    if (risultato.errore) {
      setErrore(risultato.errore);
      return;
    }
    router.refresh();
    onFatto();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Modifica Appuntamento</SheetTitle>
        <SheetDescription>Cambia data, ora, tecnico o dettagli.</SheetDescription>
      </SheetHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-4">
        <div>
          <Label htmlFor="titolo-m">Titolo *</Label>
          <Input id="titolo-m" name="titolo" required autoFocus defaultValue={appuntamento.titolo} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="indirizzo-m">Indirizzo</Label>
          <Input id="indirizzo-m" name="indirizzo" defaultValue={appuntamento.indirizzo ?? ""} className="mt-1" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Label htmlFor="data-m">Data *</Label>
            <Input id="data-m" name="data" type="date" required defaultValue={dataDefault} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="ora-m">Ora *</Label>
            <Input id="ora-m" name="ora" type="time" required defaultValue={oraDefault} className="mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="durata-m">Durata (min)</Label>
            <Input id="durata-m" name="durata" type="number" defaultValue={appuntamento.durata_minuti} step={15} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="tecnico-m">Tecnico</Label>
            <select id="tecnico-m" name="tecnico" defaultValue={appuntamento.tecnico_id ?? ""} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Da assegnare</option>
              {persone.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <Label htmlFor="note-m">Note</Label>
          <Input id="note-m" name="note" defaultValue={appuntamento.note ?? ""} className="mt-1" />
        </div>
        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}
        <Button type="submit" disabled={inCorso} className="mt-2">
          {inCorso ? "Salvataggio..." : "Salva modifiche"}
        </Button>
      </form>
    </>
  );
}

function FormNuovaNota({ ticket, onFatto }: { ticket: TicketMinimo[]; onFatto: () => void }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const oggi = new Date().toISOString().slice(0, 10);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const testo = String(dati.get("testo") || "").trim();
    const dataPromemoria = String(dati.get("data") || "");
    if (!testo || !dataPromemoria) {
      setErrore("Testo e data sono obbligatori.");
      return;
    }
    setInCorso(true);
    const risultato = await creaNotaCalendario({
      testo,
      dataPromemoria,
      ticketId: String(dati.get("ticket") || ""),
    });
    setInCorso(false);
    if (risultato.errore) {
      setErrore(risultato.errore);
      return;
    }
    router.refresh();
    onFatto();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Nuovo Promemoria</SheetTitle>
        <SheetDescription>Un appunto libero con una data, non serve un orario preciso.</SheetDescription>
      </SheetHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-4">
        <div>
          <Label htmlFor="testo">Promemoria *</Label>
          <Input id="testo" name="testo" required autoFocus placeholder="Es. richiamare il cliente per conferma" className="mt-1" />
        </div>
        <div>
          <Label htmlFor="data-nota">Data *</Label>
          <Input id="data-nota" name="data" type="date" required defaultValue={oggi} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="ticket-nota">Ticket collegato (facoltativo)</Label>
          <select id="ticket-nota" name="ticket" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
            <option value="">Nessuno</option>
            {ticket.map((t) => (
              <option key={t.id} value={t.id}>#{t.numero} — {t.cliente}</option>
            ))}
          </select>
        </div>
        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}
        <Button type="submit" disabled={inCorso} className="mt-2">
          {inCorso ? "Salvataggio..." : "Crea Promemoria"}
        </Button>
      </form>
    </>
  );
}
