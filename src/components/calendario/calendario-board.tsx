"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Clock, MapPin, Check, X as XIcon, AlertTriangle, StickyNote, Trash2, NotebookPen, ChevronLeft, ChevronRight, CalendarClock, ExternalLink, Phone, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-badge";
import { StatoVuoto } from "@/components/ui/stato-vuoto";
import { useToast } from "@/components/ui/toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  creaAppuntamento,
  modificaAppuntamento,
  cambiaStatoAppuntamento,
  creaNotaCalendario,
  completaNotaCalendario,
  eliminaNotaCalendario,
} from "@/app/(app)/calendario/actions";
import { SchedaInstallazioneForm } from "@/components/schede/scheda-installazione-form";
import { SchedaLavorazioneForm } from "@/components/schede/scheda-lavorazione-form";
import { TIPI_SERVIZIO_APPUNTAMENTO } from "@/lib/types";
import type { Appuntamento, MaterialeMagazzino, NotaCalendario, Persona, TipoServizioAppuntamento } from "@/lib/types";
import type { EventoGoogleCalendario } from "@/lib/google-calendar";
import type { VistaCalendario } from "@/app/(app)/calendario/page";

interface TicketMinimo {
  id: string;
  numero: number;
  cliente: string;
  indirizzo: string | null;
  telefono: string | null;
}

// ── date, sempre in orario locale (mai toISOString su una data — sposta
// il giorno vicino alla mezzanotte, bug già capitato in questo progetto) ──
function formattaData(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseData(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}
function chiaveGiorno(iso: string) {
  return new Date(iso).toDateString();
}
function chiaveGiornoData(data: string) {
  return parseData(data).toDateString();
}
// ★ FIX — VistaSettimana (×7 celle) e VistaMese (×42 celle) rifiltravano
// da zero l'intero array di appuntamenti/note/eventi per ogni cella, ad
// ogni render, con la stessa logica di raggruppamento incollata due volte
// (tre contando VistaGiorno). Un solo passaggio sui dati (qui) invece di
// N passaggi ripetuti, con lookup O(1) per cella invece di un `.filter()`
// sull'intero array.
function raggruppaPerGiorno<T>(items: T[], chiaveDi: (item: T) => string): Map<string, T[]> {
  const mappa = new Map<string, T[]>();
  for (const item of items) {
    const chiave = chiaveDi(item);
    const lista = mappa.get(chiave);
    if (lista) lista.push(item);
    else mappa.set(chiave, [item]);
  }
  return mappa;
}
function lunediSettimana(d: Date): Date {
  const l = new Date(d);
  const giorno = l.getDay();
  l.setDate(l.getDate() + (giorno === 0 ? -6 : 1 - giorno));
  l.setHours(0, 0, 0, 0);
  return l;
}
function spostaData(dataRiferimento: Date, vista: VistaCalendario, direzione: 1 | -1): Date {
  const d = new Date(dataRiferimento);
  if (vista === "giorno") d.setDate(d.getDate() + direzione);
  else if (vista === "settimana") d.setDate(d.getDate() + direzione * 7);
  else d.setMonth(d.getMonth() + direzione);
  return d;
}
function etichettaPeriodo(dataRiferimento: Date, vista: VistaCalendario): string {
  if (vista === "giorno") {
    return dataRiferimento.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  if (vista === "mese") {
    const s = dataRiferimento.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  const lunedi = lunediSettimana(dataRiferimento);
  const domenica = new Date(lunedi);
  domenica.setDate(domenica.getDate() + 6);
  const stessoMese = lunedi.getMonth() === domenica.getMonth();
  const opzInizio: Intl.DateTimeFormatOptions = stessoMese ? { day: "numeric" } : { day: "numeric", month: "short" };
  return `${lunedi.toLocaleDateString("it-IT", opzInizio)} – ${domenica.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}`;
}

const VISTE: { chiave: VistaCalendario; etichetta: string }[] = [
  { chiave: "giorno", etichetta: "Giorno" },
  { chiave: "settimana", etichetta: "Settimana" },
  { chiave: "mese", etichetta: "Mese" },
];

export function CalendarioBoard({
  appuntamenti,
  note,
  persone,
  ticket,
  eventiGoogle,
  vista,
  dataRiferimento,
  catalogoMateriali,
}: {
  appuntamenti: Appuntamento[];
  note: NotaCalendario[];
  persone: Persona[];
  ticket: TicketMinimo[];
  eventiGoogle: EventoGoogleCalendario[];
  vista: VistaCalendario;
  dataRiferimento: string;
  catalogoMateriali: MaterialeMagazzino[];
}) {
  const [nuovo, setNuovo] = useState(false);
  const [nuovaNota, setNuovaNota] = useState(false);
  const [modifica, setModifica] = useState<Appuntamento | null>(null);
  // ★ NUOVA — sollevato qui (invece che dentro FormModificaAppuntamento)
  // perché la Scheda ora si apre in un Dialog centrale separato dal Sheet
  // di modifica, non più annidato dentro — "visuale centrale" richiesta
  // esplicitamente, coerente con lo stesso trattamento in Vista Tecnico.
  const [schedaAperta, setSchedaAperta] = useState<Appuntamento | null>(null);
  const [ticketPreselezionato, setTicketPreselezionato] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  // ★ "Pianifica appuntamento" dal dettaglio Ticket — apre già il form con
  // il ticket collegato, invece di doverlo ricercare nel menu a tendina.
  useEffect(() => {
    const idTicket = searchParams.get("nuovoTicket");
    if (idTicket) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizza con l'URL (?nuovoTicket=id), stesso caso di segnalazioni-board.tsx/tickets-board.tsx.
      setTicketPreselezionato(idTicket);
      setNuovo(true);
    }
  }, [searchParams]);

  function trovaPersona(id: string | null) {
    return id ? persone.find((p) => p.id === id) ?? null : null;
  }

  // ★ NUOVA — toast di conferma anche su queste azioni rapide (stesso
  // standard di Segnalazioni/Ticket/Preventivi): senza spinner dedicato,
  // restano toggle "leggeri" pensati per sentirsi immediati (una casella
  // che si spunta), ma un riscontro visivo che l'azione è andata a buon
  // fine mancava del tutto.
  async function cambiaStato(id: string, stato: Appuntamento["stato"]) {
    await cambiaStatoAppuntamento(id, stato);
    toast(stato === "Completato" ? "Appuntamento segnato come completato." : "Appuntamento annullato.", "successo");
    router.refresh();
  }

  async function alternaNota(n: NotaCalendario) {
    await completaNotaCalendario(n.id, !n.completata);
    toast(n.completata ? "Promemoria riaperto." : "Promemoria completato.", "successo");
    router.refresh();
  }

  async function eliminaNota(id: string) {
    if (!confirm("Eliminare questo promemoria?")) return;
    await eliminaNotaCalendario(id);
    toast("Promemoria eliminato.", "successo");
    router.refresh();
  }

  const dataRif = parseData(dataRiferimento);
  const oggi = formattaData(new Date());
  const dataPrec = formattaData(spostaData(dataRif, vista, -1));
  const dataSucc = formattaData(spostaData(dataRif, vista, 1));

  return (
    <div>
      {/* ── selettore vista + navigazione data ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full border bg-card p-1 shadow-sm">
          {VISTE.map((v) => (
            <Link
              key={v.chiave}
              href={`/calendario?vista=${v.chiave}&data=${dataRiferimento}`}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                vista === v.chiave ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {v.etichetta}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/calendario?vista=${vista}&data=${dataPrec}`} className="flex h-8 w-8 items-center justify-center rounded-full border bg-card shadow-sm transition hover:bg-muted">
            <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <span className="min-w-[9rem] text-center text-sm font-bold capitalize">{etichettaPeriodo(dataRif, vista)}</span>
          <Link href={`/calendario?vista=${vista}&data=${dataSucc}`} className="flex h-8 w-8 items-center justify-center rounded-full border bg-card shadow-sm transition hover:bg-muted">
            <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
          <Link href={`/calendario?vista=${vista}&data=${oggi}`} className="ml-1 rounded-full border bg-card px-3 py-1.5 text-xs font-bold shadow-sm transition hover:bg-muted">
            Oggi
          </Link>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setNuovaNota(true)}>
            <NotebookPen className="h-3.5 w-3.5" strokeWidth={2.5} />
            Promemoria
          </Button>
          <Button size="sm" onClick={() => setNuovo(true)}>
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            Appuntamento
          </Button>
        </div>
      </div>

      {vista === "giorno" && (
        <VistaGiorno
          data={dataRif}
          appuntamenti={appuntamenti}
          note={note}
          eventiGoogle={eventiGoogle}
          ticket={ticket}
          trovaPersona={trovaPersona}
          onApri={setModifica}
          onCambiaStato={cambiaStato}
          onAlternaNota={alternaNota}
          onEliminaNota={eliminaNota}
        />
      )}
      {vista === "settimana" && (
        <VistaSettimana
          dataRiferimento={dataRif}
          appuntamenti={appuntamenti}
          note={note}
          eventiGoogle={eventiGoogle}
          onApri={setModifica}
        />
      )}
      {vista === "mese" && (
        <VistaMese dataRiferimento={dataRif} appuntamenti={appuntamenti} note={note} eventiGoogle={eventiGoogle} />
      )}

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

      {/* ★ FIX — segnalato dall'utente: aprire la Scheda lasciava questo
      Sheet "aperto" dietro — il velo scuro a piena pagina della Scheda
      finiva sopra anche la X di questo Sheet, spenta/non cliccabile
      finché non si chiudeva prima la Scheda. `!schedaAperta` lo nasconde
      (non lo chiude: `modifica` resta valorizzato) finché la Scheda è
      sopra — ricompare da solo se la Scheda viene annullata. */}
      <Sheet open={!!modifica && !schedaAperta} onOpenChange={(v) => !v && setModifica(null)}>
        <SheetContent>
          {modifica && (
            <FormModificaAppuntamento
              appuntamento={modifica}
              persone={persone}
              ticket={ticket}
              onApriScheda={() => setSchedaAperta(modifica)}
              onFatto={() => setModifica(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ★ NUOVA — Dialog centrale per la Scheda di lavoro, separato dal
      Sheet di modifica (vedi sopra): stesso identico trattamento di Vista
      Tecnico, "visuale centrale" richiesta esplicitamente. */}
      <Dialog open={!!schedaAperta} onOpenChange={(v) => !v && setSchedaAperta(null)}>
        <DialogContent className="sm:max-w-xl">
          {schedaAperta && (
            schedaAperta.tipo_servizio === "Nuova installazione" ? (
              <SchedaInstallazioneForm
                appuntamentoId={schedaAperta.id}
                catalogoMateriali={catalogoMateriali}
                onAnnulla={() => setSchedaAperta(null)}
                onSalvato={() => {
                  setSchedaAperta(null);
                  setModifica(null);
                  router.refresh();
                }}
              />
            ) : (
              <SchedaLavorazioneForm
                appuntamentoId={schedaAperta.id}
                catalogoMateriali={catalogoMateriali}
                onAnnulla={() => setSchedaAperta(null)}
                onSalvato={() => {
                  setSchedaAperta(null);
                  setModifica(null);
                  router.refresh();
                }}
              />
            )
          )}
        </DialogContent>
      </Dialog>

      <Sheet open={nuovaNota} onOpenChange={setNuovaNota}>
        <SheetContent>
          <FormNuovaNota ticket={ticket} onFatto={() => setNuovaNota(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ═══════════════════════════ VISTA GIORNO ═══════════════════════════

function RigaAppuntamento({
  a,
  tecnico,
  telefono,
  onApri,
  onCambiaStato,
}: {
  a: Appuntamento;
  tecnico: Persona | null;
  /** Telefono del Ticket collegato — se presente, un pulsante per chiamare
   * direttamente compare accanto all'indirizzo. */
  telefono: string | null;
  onApri: (a: Appuntamento) => void;
  onCambiaStato: (id: string, stato: Appuntamento["stato"]) => void;
}) {
  const ora = new Date(a.data_ora).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={`flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm ${a.stato === "Annullato" ? "opacity-50" : ""}`}>
      <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-accent py-1.5 text-accent-foreground">
        <Clock className="h-3 w-3" strokeWidth={2.5} />
        <span className="text-xs font-bold">{ora}</span>
      </div>
      <button onClick={() => a.stato === "Programmato" && onApri(a)} className="min-w-0 flex-1 text-left" disabled={a.stato !== "Programmato"}>
        <div className="mb-0.5 flex items-center gap-1.5">
          <span className="truncate font-semibold">{a.titolo}</span>
          <StatusBadge status={a.tipo_servizio} className="shrink-0 text-[10px]" />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
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
          {telefono && (
            <a
              href={`tel:${telefono}`}
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary hover:underline"
            >
              <Phone className="h-3 w-3 shrink-0" strokeWidth={2.25} />
              {telefono}
            </a>
          )}
        </div>
      </button>
      {tecnico && (
        <span title={tecnico.nome} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
          {tecnico.nome.slice(0, 2).toUpperCase()}
        </span>
      )}
      {a.stato === "Programmato" ? (
        <div className="flex shrink-0 gap-1">
          <button onClick={() => onCambiaStato(a.id, "Completato")} title="Segna completato" className="flex h-7 w-7 items-center justify-center rounded-full border text-success transition hover:bg-success/10">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
          <button onClick={() => onCambiaStato(a.id, "Annullato")} title="Annulla" className="flex h-7 w-7 items-center justify-center rounded-full border text-critical transition hover:bg-critical/10">
            <XIcon className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <StatusBadge status={a.stato} className="shrink-0" />
      )}
    </div>
  );
}

function RigaNota({ n, onAlterna, onElimina }: { n: NotaCalendario; onAlterna: (n: NotaCalendario) => void; onElimina: (id: string) => void }) {
  const scaduta = !n.completata && chiaveGiornoData(n.data_promemoria) !== chiaveGiorno(new Date().toISOString()) && new Date(n.data_promemoria) < new Date(new Date().toDateString());
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 shadow-sm ${n.completata ? "bg-muted/40 opacity-60" : scaduta ? "border-critical/30 bg-critical/5" : "border-warning/30 bg-warning/10"}`}>
      <StickyNote className={`h-4 w-4 shrink-0 ${n.completata ? "text-muted-foreground" : "text-warning"}`} strokeWidth={2.25} />
      <span className={`min-w-0 flex-1 text-sm ${n.completata ? "line-through text-muted-foreground" : ""}`}>{n.testo}</span>
      <button onClick={() => onAlterna(n)} title={n.completata ? "Segna da fare" : "Segna fatto"} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-success transition hover:bg-success/10">
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
      <button onClick={() => onElimina(n.id)} title="Elimina" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-critical transition hover:bg-critical/10">
        <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

// ★ eventi letti da Google Calendar (non creati da qui, quindi senza
// tipo_servizio/ticket collegato): sola lettura, un badge "Google" per
// distinguerli a colpo d'occhio dagli Appuntamenti veri del gestionale.
function chiaveGiornoEvento(e: EventoGoogleCalendario) {
  return e.tuttoIlGiorno ? chiaveGiornoData(e.inizio) : chiaveGiorno(e.inizio);
}

function RigaEventoGoogle({ e }: { e: EventoGoogleCalendario }) {
  const ora = e.tuttoIlGiorno ? "Tutto il giorno" : new Date(e.inizio).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/30 p-3">
      <div className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-muted py-1.5 text-muted-foreground">
        <CalendarClock className="h-3 w-3" strokeWidth={2.5} />
        <span className="text-center text-[10px] font-bold leading-tight">{ora}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-1.5">
          <span className="truncate font-semibold">{e.titolo}</span>
          <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">Google</span>
        </div>
        {e.indirizzo && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(e.indirizzo)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary hover:underline"
          >
            <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.25} />
            {e.indirizzo}
          </a>
        )}
      </div>
      {e.link && (
        <a href={e.link} target="_blank" rel="noopener noreferrer" title="Apri in Google Calendar" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-muted-foreground transition hover:border-primary hover:text-primary">
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} />
        </a>
      )}
    </div>
  );
}

function VistaGiorno({
  data,
  appuntamenti,
  note,
  eventiGoogle,
  ticket,
  trovaPersona,
  onApri,
  onCambiaStato,
  onAlternaNota,
  onEliminaNota,
}: {
  data: Date;
  appuntamenti: Appuntamento[];
  note: NotaCalendario[];
  eventiGoogle: EventoGoogleCalendario[];
  ticket: TicketMinimo[];
  trovaPersona: (id: string | null) => Persona | null;
  onApri: (a: Appuntamento) => void;
  onCambiaStato: (id: string, stato: Appuntamento["stato"]) => void;
  onAlternaNota: (n: NotaCalendario) => void;
  onEliminaNota: (id: string) => void;
}) {
  const chiave = data.toDateString();
  const appuntamentiGiorno = appuntamenti.filter((a) => chiaveGiorno(a.data_ora) === chiave);
  const noteGiorno = note.filter((n) => chiaveGiornoData(n.data_promemoria) === chiave);
  const eventiGiorno = eventiGoogle.filter((e) => chiaveGiornoEvento(e) === chiave);

  if (appuntamentiGiorno.length === 0 && noteGiorno.length === 0 && eventiGiorno.length === 0) {
    return <StatoVuoto icona={CalendarClock} titolo="Nessun appuntamento o promemoria per questo giorno." />;
  }

  return (
    <div className="flex flex-col gap-2">
      {noteGiorno.map((n) => (
        <RigaNota key={n.id} n={n} onAlterna={onAlternaNota} onElimina={onEliminaNota} />
      ))}
      {appuntamentiGiorno.map((a) => (
        <RigaAppuntamento
          key={a.id}
          a={a}
          tecnico={trovaPersona(a.tecnico_id)}
          telefono={ticket.find((t) => t.id === a.ticket_id)?.telefono ?? null}
          onApri={onApri}
          onCambiaStato={onCambiaStato}
        />
      ))}
      {eventiGiorno.map((e) => (
        <RigaEventoGoogle key={e.id} e={e} />
      ))}
    </div>
  );
}

// ═══════════════════════════ VISTA SETTIMANA ═══════════════════════════

const GIORNI_SETTIMANA = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function VistaSettimana({
  dataRiferimento,
  appuntamenti,
  note,
  eventiGoogle,
  onApri,
}: {
  dataRiferimento: Date;
  appuntamenti: Appuntamento[];
  note: NotaCalendario[];
  eventiGoogle: EventoGoogleCalendario[];
  onApri: (a: Appuntamento) => void;
}) {
  const lunedi = lunediSettimana(dataRiferimento);
  const giorni = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(lunedi);
    d.setDate(d.getDate() + i);
    return d;
  });
  const oggiChiave = new Date().toDateString();
  const appuntamentiPerGiorno = useMemo(() => raggruppaPerGiorno(appuntamenti, (a) => chiaveGiorno(a.data_ora)), [appuntamenti]);
  const notePerGiorno = useMemo(() => raggruppaPerGiorno(note, (n) => chiaveGiornoData(n.data_promemoria)), [note]);
  const eventiPerGiorno = useMemo(() => raggruppaPerGiorno(eventiGoogle, chiaveGiornoEvento), [eventiGoogle]);

  return (
    <div className="grid grid-cols-7 gap-2 overflow-x-auto">
      {giorni.map((d, i) => {
        const chiave = d.toDateString();
        const isOggi = chiave === oggiChiave;
        const appts = appuntamentiPerGiorno.get(chiave) ?? [];
        const noteGiorno = notePerGiorno.get(chiave) ?? [];
        const eventiGiorno = eventiPerGiorno.get(chiave) ?? [];
        return (
          <div key={i} className={`min-w-0 rounded-2xl border p-2 ${isOggi ? "border-primary/40 bg-primary/5" : "bg-card"}`}>
            <div className={`mb-2 text-center text-xs font-bold uppercase tracking-wide ${isOggi ? "text-primary" : "text-muted-foreground"}`}>
              {GIORNI_SETTIMANA[i]} <span className="tabular-nums">{d.getDate()}</span>
            </div>
            <div className="flex max-h-80 flex-col gap-1.5 overflow-y-auto">
              {noteGiorno.map((n) => (
                <div key={n.id} className={`rounded-md border px-1.5 py-1 text-[11px] ${n.completata ? "opacity-50 line-through" : "border-warning/30 bg-warning/10"}`}>
                  <StickyNote className="mr-1 inline h-2.5 w-2.5" strokeWidth={2.5} />
                  {n.testo}
                </div>
              ))}
              {appts.map((a) => (
                <button
                  key={a.id}
                  onClick={() => a.stato === "Programmato" && onApri(a)}
                  className={`rounded-md border-l-2 bg-muted/50 px-1.5 py-1 text-left text-[11px] transition hover:bg-muted ${
                    a.stato === "Annullato" ? "border-l-muted-foreground opacity-50" : a.stato === "Completato" ? "border-l-success" : "border-l-primary"
                  }`}
                >
                  <div className="font-bold tabular-nums">{new Date(a.data_ora).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</div>
                  <div className="truncate">{a.titolo}</div>
                </button>
              ))}
              {eventiGiorno.map((e) => (
                <div key={e.id} className="rounded-md border border-dashed bg-muted/40 px-1.5 py-1 text-[11px] text-muted-foreground">
                  <div className="font-bold tabular-nums">{e.tuttoIlGiorno ? "Tutto il giorno" : new Date(e.inizio).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</div>
                  <div className="truncate">{e.titolo}</div>
                </div>
              ))}
              {appts.length === 0 && noteGiorno.length === 0 && eventiGiorno.length === 0 && <div className="py-2 text-center text-[10px] text-muted-foreground/60">—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════ VISTA MESE ═══════════════════════════

function VistaMese({
  dataRiferimento,
  appuntamenti,
  note,
  eventiGoogle,
}: {
  dataRiferimento: Date;
  appuntamenti: Appuntamento[];
  note: NotaCalendario[];
  eventiGoogle: EventoGoogleCalendario[];
}) {
  const primoDelMese = new Date(dataRiferimento.getFullYear(), dataRiferimento.getMonth(), 1);
  const inizioGriglia = lunediSettimana(primoDelMese);
  const giorni = Array.from({ length: 42 }).map((_, i) => {
    const d = new Date(inizioGriglia);
    d.setDate(d.getDate() + i);
    return d;
  });
  const oggiChiave = new Date().toDateString();
  const meseCorrente = dataRiferimento.getMonth();
  const appuntamentiPerGiorno = useMemo(() => raggruppaPerGiorno(appuntamenti, (a) => chiaveGiorno(a.data_ora)), [appuntamenti]);
  const notePerGiorno = useMemo(() => raggruppaPerGiorno(note, (n) => chiaveGiornoData(n.data_promemoria)), [note]);
  const eventiPerGiorno = useMemo(() => raggruppaPerGiorno(eventiGoogle, chiaveGiornoEvento), [eventiGoogle]);

  // ★ NUOVA — richiesta esplicita ("la vista mensile è agghiacciante"):
  // prima ogni cella mostrava solo il numero del giorno e 1-3 pallini con
  // un conteggio — zero nomi, zero orari, serviva un click per scoprire
  // qualunque cosa. Proposta con artifact (3 alternative confrontate),
  // scelta "A — chip evento": stesso principio di Google/Outlook, ogni
  // impegno diventa una striscia compatta orario+cliente, visibile senza
  // aprire nulla. Max 3 righe per cella, oltre le quali un "+N altri" —
  // stesso ordine (note → appuntamenti → eventi Google) già usato in
  // Vista Settimana, per coerenza tra le due viste.
  const MAX_RIGHE_CELLA = 3;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {GIORNI_SETTIMANA.map((g) => (
          <div key={g} className="pb-1 text-center text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {g}
          </div>
        ))}
        {giorni.map((d, i) => {
          const chiave = d.toDateString();
          const isOggi = chiave === oggiChiave;
          const fuoriMese = d.getMonth() !== meseCorrente;
          const noteGiorno = (notePerGiorno.get(chiave) ?? []).filter((n) => !n.completata);
          const apptGiorno = (appuntamentiPerGiorno.get(chiave) ?? []).filter((a) => a.stato !== "Annullato");
          const eventiGiorno = eventiPerGiorno.get(chiave) ?? [];
          const totaleRighe = noteGiorno.length + apptGiorno.length + eventiGiorno.length;
          type Riga = { key: string; testo: string; classe: string };
          const righe: Riga[] = [
            ...noteGiorno.map((n): Riga => ({ key: `n-${n.id}`, testo: `📌 ${n.testo}`, classe: "border-l-warning bg-warning/10 text-warning" })),
            ...apptGiorno.map((a): Riga => ({
              key: `a-${a.id}`,
              testo: `${new Date(a.data_ora).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} ${a.titolo}`,
              classe: a.stato === "Completato" ? "border-l-success bg-success/10 text-success opacity-70" : "border-l-primary bg-muted/60",
            })),
            ...eventiGiorno.map((e): Riga => ({
              key: `e-${e.id}`,
              testo: `${e.tuttoIlGiorno ? "" : new Date(e.inizio).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) + " "}${e.titolo}`,
              classe: "border-l-muted-foreground bg-muted/40 text-muted-foreground border-dashed",
            })),
          ].slice(0, MAX_RIGHE_CELLA);
          return (
            <Link
              key={i}
              href={`/calendario?vista=giorno&data=${formattaData(d)}`}
              className={`flex min-h-24 flex-col gap-0.5 rounded-xl border p-1.5 transition hover:border-primary/40 ${
                fuoriMese ? "bg-muted/30 opacity-50" : "bg-card"
              } ${isOggi ? "border-primary/50" : ""}`}
            >
              <span
                className={`mb-0.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold tabular-nums ${
                  isOggi ? "bg-primary text-primary-foreground" : ""
                }`}
              >
                {d.getDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {righe.map((r) => (
                  <span key={r.key} className={`truncate rounded border-l-2 px-1 py-0.5 text-[9.5px] leading-tight font-semibold ${r.classe}`}>
                    {r.testo}
                  </span>
                ))}
                {totaleRighe > MAX_RIGHE_CELLA && (
                  <span className="px-1 text-[9.5px] font-semibold text-muted-foreground">+{totaleRighe - MAX_RIGHE_CELLA} altri</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
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
  const toast = useToast();
  const [inCorso, startTransizione] = useTransition();
  const [errore, setErrore] = useState("");
  const [ticketId, setTicketId] = useState(ticketIniziale || "");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizza con la prop ticketIniziale quando cambia dopo il mount (es. riapertura del form con un altro ticket preselezionato), non è derivabile durante il render.
    if (ticketIniziale) setTicketId(ticketIniziale);
  }, [ticketIniziale]);

  const ticketSelezionato = ticket.find((t) => t.id === ticketId);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
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
    startTransizione(async () => {
      const risultato = await creaAppuntamento({
        titolo,
        indirizzo: String(dati.get("indirizzo") || ""),
        dataOra: new Date(`${data}T${ora}`).toISOString(),
        durataMinuti: Number(dati.get("durata") || 60),
        tecnicoId: String(dati.get("tecnico") || ""),
        ticketId,
        note: String(dati.get("note") || ""),
        tipoServizio: String(dati.get("tipo_servizio") || "Lavorazione tecnica") as TipoServizioAppuntamento,
      });
      if (risultato.errore) {
        setErrore(risultato.errore);
        return;
      }
      toast("Appuntamento creato.", "successo");
      router.refresh();
      onFatto();
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Nuovo Appuntamento</SheetTitle>
        <SheetDescription>Programma un’installazione o una visita.</SheetDescription>
      </SheetHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-4">
        <div>
          <Label htmlFor="tipo_servizio">Tipo di servizio *</Label>
          <select
            id="tipo_servizio"
            name="tipo_servizio"
            required
            defaultValue="Lavorazione tecnica"
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            {TIPI_SERVIZIO_APPUNTAMENTO.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Decide come l&apos;installatore vede l&apos;appuntamento in Vista Tecnico.
          </p>
        </div>
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
        <Button type="submit" disabled={inCorso} className="mt-2 min-h-11">
          {inCorso && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />}
          {inCorso ? "Creazione in corso…" : "Crea Appuntamento"}
        </Button>
      </form>
    </>
  );
}

function FormModificaAppuntamento({
  appuntamento,
  persone,
  ticket,
  onApriScheda,
  onFatto,
}: {
  appuntamento: Appuntamento;
  persone: Persona[];
  ticket: TicketMinimo[];
  onApriScheda: () => void;
  onFatto: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [inCorso, startTransizione] = useTransition();
  const [errore, setErrore] = useState("");
  const dataOra = new Date(appuntamento.data_ora);
  const dataDefault = dataOra.toISOString().slice(0, 10);
  const oraDefault = dataOra.toTimeString().slice(0, 5);
  const telefonoCliente = ticket.find((t) => t.id === appuntamento.ticket_id)?.telefono ?? null;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
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
    startTransizione(async () => {
      const risultato = await modificaAppuntamento(appuntamento.id, {
        titolo,
        indirizzo: String(dati.get("indirizzo") || ""),
        dataOra: new Date(`${data}T${ora}`).toISOString(),
        durataMinuti: Number(dati.get("durata") || 60),
        tecnicoId: String(dati.get("tecnico") || ""),
        note: String(dati.get("note") || ""),
        tipoServizio: String(dati.get("tipo_servizio") || appuntamento.tipo_servizio) as TipoServizioAppuntamento,
      });
      if (risultato.errore) {
        setErrore(risultato.errore);
        return;
      }
      toast("Modifiche salvate.", "successo");
      router.refresh();
      onFatto();
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Modifica Appuntamento</SheetTitle>
        <SheetDescription>Cambia data, ora, tecnico o dettagli.</SheetDescription>
      </SheetHeader>
      {/* ★ NUOVA — richiesta esplicita: la Scheda di Installazione/
       * Lavorazione era apribile solo da Vista Tecnico (dal tecnico
       * assegnato, il giorno stesso dell'appuntamento) — ora anche da qui,
       * per chi pianifica/controlla senza aspettare o senza essere il
       * tecnico assegnato. Si apre in un popup centrale (Dialog, vedi
       * CalendarioBoard) invece che dentro questo stesso pannello
       * laterale — "visuale centrale" richiesta esplicitamente, uguale
       * ovunque nel gestionale. Solo per appuntamenti ancora
       * "Programmato": un appuntamento già Completato ha la sua scheda
       * visibile in sola lettura dal Ticket collegato (SchedaVista). */}
      {appuntamento.stato === "Programmato" && (
        <div className="px-4">
          <Button type="button" variant="outline" size="sm" onClick={onApriScheda}>
            <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
            Apri scheda di lavoro
          </Button>
        </div>
      )}
      {/* ★ NUOVO — richiesta esplicita: telefono cliccabile per chiamare
       * subito, indirizzo cliccabile che apre Google Maps direttamente —
       * prima l'indirizzo era solo un campo di testo modificabile, senza
       * modo di aprirlo, e il telefono non compariva affatto qui. */}
      {(telefonoCliente || appuntamento.indirizzo) && (
        <div className="mb-1 flex flex-wrap gap-1.5 px-4">
          {telefonoCliente && (
            <a
              href={`tel:${telefonoCliente}`}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-semibold shadow-sm transition hover:border-primary/40"
            >
              <Phone className="h-3.5 w-3.5 text-primary" strokeWidth={2.25} />
              {telefonoCliente}
            </a>
          )}
          {appuntamento.indirizzo && (
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(appuntamento.indirizzo)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs font-semibold shadow-sm transition hover:border-primary/40"
            >
              <MapPin className="h-3.5 w-3.5 text-primary" strokeWidth={2.25} />
              Apri mappa
            </a>
          )}
        </div>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-4">
        <div>
          <Label htmlFor="tipo_servizio-m">Tipo di servizio *</Label>
          <select
            id="tipo_servizio-m"
            name="tipo_servizio"
            required
            defaultValue={appuntamento.tipo_servizio}
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            {TIPI_SERVIZIO_APPUNTAMENTO.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
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
        <Button type="submit" disabled={inCorso} className="mt-2 min-h-11">
          {inCorso && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />}
          {inCorso ? "Salvataggio in corso…" : "Salva modifiche"}
        </Button>
      </form>
    </>
  );
}

function FormNuovaNota({ ticket, onFatto }: { ticket: TicketMinimo[]; onFatto: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [inCorso, startTransizione] = useTransition();
  const [errore, setErrore] = useState("");
  const oggi = new Date().toISOString().slice(0, 10);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const testo = String(dati.get("testo") || "").trim();
    const dataPromemoria = String(dati.get("data") || "");
    if (!testo || !dataPromemoria) {
      setErrore("Testo e data sono obbligatori.");
      return;
    }
    startTransizione(async () => {
      const risultato = await creaNotaCalendario({
        testo,
        dataPromemoria,
        ticketId: String(dati.get("ticket") || ""),
      });
      if (risultato.errore) {
        setErrore(risultato.errore);
        return;
      }
      toast("Promemoria creato.", "successo");
      router.refresh();
      onFatto();
    });
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
        <Button type="submit" disabled={inCorso} className="mt-2 min-h-11">
          {inCorso && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />}
          {inCorso ? "Salvataggio in corso…" : "Crea Promemoria"}
        </Button>
      </form>
    </>
  );
}
