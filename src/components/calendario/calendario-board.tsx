"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Clock, MapPin, Check, X as XIcon, AlertTriangle } from "lucide-react";
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
import { creaAppuntamento, cambiaStatoAppuntamento } from "@/app/(app)/calendario/actions";
import type { Appuntamento, StaffMinimo } from "@/lib/types";

interface TicketMinimo {
  id: string;
  numero: number;
  cliente: string;
  indirizzo: string | null;
}

function chiaveGiorno(iso: string) {
  return new Date(iso).toDateString();
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
  staff,
  ticket,
}: {
  appuntamenti: Appuntamento[];
  staff: StaffMinimo[];
  ticket: TicketMinimo[];
}) {
  const [nuovo, setNuovo] = useState(false);
  const router = useRouter();

  const gruppi = useMemo(() => {
    const mappa = new Map<string, Appuntamento[]>();
    appuntamenti.forEach((a) => {
      const k = chiaveGiorno(a.data_ora);
      if (!mappa.has(k)) mappa.set(k, []);
      mappa.get(k)!.push(a);
    });
    return Array.from(mappa.entries());
  }, [appuntamenti]);

  function trovaStaff(id: string | null) {
    return id ? staff.find((s) => s.id === id) ?? null : null;
  }

  async function cambiaStato(id: string, stato: Appuntamento["stato"]) {
    await cambiaStatoAppuntamento(id, stato);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setNuovo(true)}>
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Nuovo Appuntamento
        </Button>
      </div>

      {gruppi.length === 0 && (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nessun appuntamento in programma.
        </div>
      )}

      <div className="flex flex-col gap-6">
        {gruppi.map(([giorno, items]) => (
          <div key={giorno}>
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {etichettaGiorno(items[0].data_ora)}
            </div>
            <div className="flex flex-col gap-2">
              {items.map((a) => {
                const tecnico = trovaStaff(a.tecnico_id);
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
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{a.titolo}</div>
                      {a.indirizzo && (
                        <div className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.25} />
                          {a.indirizzo}
                        </div>
                      )}
                    </div>
                    {tecnico && (
                      <span
                        title={tecnico.nome || tecnico.email}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground"
                      >
                        {(tecnico.nome || tecnico.email).slice(0, 2).toUpperCase()}
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
          <FormNuovoAppuntamento staff={staff} ticket={ticket} onFatto={() => setNuovo(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FormNuovoAppuntamento({
  staff,
  ticket,
  onFatto,
}: {
  staff: StaffMinimo[];
  ticket: TicketMinimo[];
  onFatto: () => void;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [ticketId, setTicketId] = useState("");

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
    try {
      await creaAppuntamento({
        titolo,
        indirizzo: String(dati.get("indirizzo") || ""),
        dataOra: new Date(`${data}T${ora}`).toISOString(),
        durataMinuti: Number(dati.get("durata") || 60),
        tecnicoId: String(dati.get("tecnico") || ""),
        ticketId,
        note: String(dati.get("note") || ""),
      });
      router.refresh();
      onFatto();
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore imprevisto.");
    } finally {
      setInCorso(false);
    }
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
          <Input id="titolo" name="titolo" required autoFocus defaultValue={ticketSelezionato?.cliente ?? ""} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="indirizzo">Indirizzo</Label>
          <Input id="indirizzo" name="indirizzo" defaultValue={ticketSelezionato?.indirizzo ?? ""} className="mt-1" />
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
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.nome || s.email}</option>
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
