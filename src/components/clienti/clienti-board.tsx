"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Phone, MapPin, ChevronDown, FileEdit, AlertTriangle, Users2, UserPlus2, Database, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { salvaDatiContrattualiCliente } from "@/app/(app)/clienti/actions";
import type { ClienteAttivo, ClienteEsterno, Tariffa, Ticket } from "@/lib/types";

function normalizzaTelefono(t: string | null) {
  return (t || "").replace(/\D/g, "").slice(-9);
}

type ClienteEsternoRidotto = Pick<ClienteEsterno, "id" | "telefono" | "attivo" | "profilo_internet" | "id_contratto">;

interface Cliente {
  chiave: string;
  nome: string;
  telefono: string | null;
  email: string | null;
  indirizzo: string | null;
  ticket: Ticket[];
  ultimaAttivita: string;
  primaAttivita: string;
  attivi: number;
  dati: ClienteAttivo | null;
  esterno: ClienteEsternoRidotto | null;
}

function giorniAllaScadenza(scadenza: string | null): number | null {
  if (!scadenza) return null;
  const diff = new Date(scadenza).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function ClientiBoard({
  tickets,
  clienti: clientiAttivi,
  tariffe,
  clientiEsterni,
  puoModificare,
}: {
  tickets: Ticket[];
  clienti: ClienteAttivo[];
  tariffe: Tariffa[];
  clientiEsterni: ClienteEsternoRidotto[];
  puoModificare: boolean;
}) {
  const [ricerca, setRicerca] = useState("");
  const [aperto, setAperto] = useState<string | null>(null);
  const [modifica, setModifica] = useState<Cliente | null>(null);

  const mappaTariffe = useMemo(() => new Map(tariffe.map((t) => [t.id, t.nome])), [tariffe]);

  const clienti = useMemo<Cliente[]>(() => {
    const mappaDati = new Map(clientiAttivi.filter((c) => c.telefono).map((c) => [normalizzaTelefono(c.telefono), c]));
    const mappaEsterni = new Map(clientiEsterni.filter((c) => c.telefono).map((c) => [normalizzaTelefono(c.telefono), c]));
    const mappa = new Map<string, Cliente>();
    for (const t of tickets) {
      const chiave = `${t.cliente.trim().toLowerCase()}|${(t.telefono || "").replace(/\D/g, "")}`;
      if (!mappa.has(chiave)) {
        mappa.set(chiave, {
          chiave,
          nome: t.cliente,
          telefono: t.telefono,
          email: t.email,
          indirizzo: t.indirizzo,
          ticket: [],
          ultimaAttivita: t.data_creazione,
          primaAttivita: t.data_creazione,
          attivi: 0,
          dati: mappaDati.get(normalizzaTelefono(t.telefono)) ?? null,
          esterno: mappaEsterni.get(normalizzaTelefono(t.telefono)) ?? null,
        });
      }
      const c = mappa.get(chiave)!;
      c.ticket.push(t);
      if (t.stato !== "Completato" && t.stato !== "Annullato") c.attivi += 1;
      if (new Date(t.data_creazione) > new Date(c.ultimaAttivita)) c.ultimaAttivita = t.data_creazione;
      if (new Date(t.data_creazione) < new Date(c.primaAttivita)) c.primaAttivita = t.data_creazione;
    }
    return Array.from(mappa.values()).sort(
      (a, b) => new Date(b.ultimaAttivita).getTime() - new Date(a.ultimaAttivita).getTime()
    );
  }, [tickets, clientiAttivi, clientiEsterni]);

  const filtrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    if (!testo) return clienti;
    return clienti.filter(
      (c) => c.nome.toLowerCase().includes(testo) || (c.telefono || "").includes(testo)
    );
  }, [clienti, ricerca]);

  // ★ NUOVA — riepilogo in cima alla pagina (ex "Clienti attivi totali" / "Nuovi questo mese" /
  // andamento ultimi 6 mesi di ClientiAttivi.html), assente da quando la pagina è stata ricostruita.
  const andamento6Mesi = useMemo(() => {
    const oggi = new Date();
    const mesi: { chiave: string; etichetta: string; conteggio: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(oggi.getFullYear(), oggi.getMonth() - i, 1);
      mesi.push({ chiave: `${d.getFullYear()}-${d.getMonth()}`, etichetta: d.toLocaleDateString("it-IT", { month: "short" }), conteggio: 0 });
    }
    const mappaMesi = new Map(mesi.map((m) => [m.chiave, m]));
    for (const c of clienti) {
      const d = new Date(c.primaAttivita);
      const chiave = `${d.getFullYear()}-${d.getMonth()}`;
      const m = mappaMesi.get(chiave);
      if (m) m.conteggio++;
    }
    return mesi;
  }, [clienti]);
  const nuoviQuestoMese = andamento6Mesi[andamento6Mesi.length - 1]?.conteggio ?? 0;
  const maxAndamento = Math.max(1, ...andamento6Mesi.map((m) => m.conteggio));

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4 shadow-md">
          <Users2 className="mb-2 h-4 w-4 text-primary" strokeWidth={2.25} />
          <div className="font-heading text-2xl font-bold tabular-nums">{clienti.length}</div>
          <div className="text-xs text-muted-foreground">Clienti totali</div>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-md">
          <UserPlus2 className="mb-2 h-4 w-4 text-success" strokeWidth={2.25} />
          <div className="font-heading text-2xl font-bold tabular-nums">{nuoviQuestoMese}</div>
          <div className="text-xs text-muted-foreground">Nuovi questo mese</div>
        </div>
        <div className="col-span-2 rounded-2xl border bg-card p-4 shadow-md sm:col-span-1">
          <div className="mb-1.5 text-xs text-muted-foreground">Nuovi clienti — ultimi 6 mesi</div>
          <div className="flex h-10 items-end gap-1">
            {andamento6Mesi.map((m) => (
              <div key={m.chiave} title={`${m.etichetta}: ${m.conteggio}`} className="flex-1 rounded-t bg-primary/70" style={{ height: `${Math.max(8, Math.round((m.conteggio / maxAndamento) * 100))}%` }} />
            ))}
          </div>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
        <input
          value={ricerca}
          onChange={(e) => setRicerca(e.target.value)}
          placeholder="Cerca cliente o telefono..."
          className="h-9 w-64 rounded-md border bg-background pl-8 pr-3 text-sm"
        />
      </div>

      {filtrati.length === 0 && (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nessun cliente trovato.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtrati.map((c) => {
          const espanso = aperto === c.chiave;
          const giorni = giorniAllaScadenza(c.dati?.scadenza_contratto ?? null);
          return (
            <div key={c.chiave} className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <button
                onClick={() => setAperto(espanso ? null : c.chiave)}
                className="flex w-full items-center gap-3 p-3 text-left text-sm"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                  {c.nome.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{c.nome}</div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {c.telefono && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" strokeWidth={2.25} />
                        {c.telefono}
                      </span>
                    )}
                    {c.indirizzo && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.25} />
                        {c.indirizzo}
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className="border-primary/20 bg-accent text-accent-foreground">
                  {c.ticket.length} ticket
                </Badge>
                {c.attivi > 0 && (
                  <Badge variant="outline" className="border-warning/20 bg-warning/10 text-warning">
                    {c.attivi} attivi
                  </Badge>
                )}
                {giorni !== null && giorni <= 30 && (
                  <Badge variant="outline" className={giorni < 0 ? "border-critical/20 bg-critical/10 text-critical" : "border-warning/20 bg-warning/10 text-warning"}>
                    <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
                    {giorni < 0 ? "Contratto scaduto" : `Scade tra ${giorni}gg`}
                  </Badge>
                )}
                <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${espanso ? "rotate-180" : ""}`} strokeWidth={2.25} />
              </button>
              {espanso && (
                <div className="flex flex-col gap-3 border-t bg-muted/40 px-4 py-3">
                  {c.esterno && (
                    <div className="rounded-lg border bg-card p-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                          <Database className="h-3 w-3" strokeWidth={2.25} />
                          Da Anagrafica Aruba
                        </span>
                        <Link href={`/clienti-esterni/${c.esterno.id}`} className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                          Scheda completa
                          <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
                        </Link>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Contratto: </span>
                          {c.esterno.attivo ? (
                            <span className="font-semibold text-success">Attivo</span>
                          ) : (
                            <span className="font-semibold text-muted-foreground">Non attivo</span>
                          )}
                        </div>
                        <div><span className="text-muted-foreground">Profilo: </span>{c.esterno.profilo_internet || "—"}</div>
                        {c.esterno.id_contratto && <div className="col-span-2"><span className="text-muted-foreground">N. contratto: </span>{c.esterno.id_contratto}</div>}
                      </div>
                    </div>
                  )}
                  {(c.dati || puoModificare) && (
                    <div className="rounded-lg border bg-card p-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Dati contrattuali</span>
                        {puoModificare && (
                          <Button size="sm" variant="outline" onClick={() => setModifica(c)}>
                            <FileEdit className="h-3.5 w-3.5" strokeWidth={2.25} />
                            {c.dati ? "Modifica" : "Aggiungi"}
                          </Button>
                        )}
                      </div>
                      {c.dati ? (
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-muted-foreground">Tariffa: </span>{c.dati.tariffa_id ? mappaTariffe.get(c.dati.tariffa_id) || "—" : "—"}</div>
                          <div><span className="text-muted-foreground">Canone: </span>{c.dati.canone_mensile != null ? `€ ${c.dati.canone_mensile}/mese` : "—"}</div>
                          <div><span className="text-muted-foreground">Scadenza: </span>{c.dati.scadenza_contratto ? new Date(c.dati.scadenza_contratto).toLocaleDateString("it-IT") : "—"}</div>
                          {c.dati.note && <div className="col-span-2"><span className="text-muted-foreground">Note: </span>{c.dati.note}</div>}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">Nessun dato contrattuale registrato.</p>
                      )}
                    </div>
                  )}
                  {c.ticket.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">
                        <span className="font-mono text-muted-foreground">#{t.numero}</span> {t.categoria} — {t.problema || "—"}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {new Date(t.data_creazione).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Sheet open={!!modifica} onOpenChange={(v) => !v && setModifica(null)}>
        <SheetContent>
          {modifica && <FormDatiContrattuali cliente={modifica} tariffe={tariffe} onFatto={() => setModifica(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FormDatiContrattuali({
  cliente,
  tariffe,
  onFatto,
}: {
  cliente: Cliente;
  tariffe: Tariffa[];
  onFatto: () => void;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    setInCorso(true);
    const risultato = await salvaDatiContrattualiCliente(cliente.dati?.id ?? null, {
      nome: cliente.nome,
      telefono: cliente.telefono || "",
      email: cliente.email || "",
      indirizzo: cliente.indirizzo || "",
      tariffa_id: String(dati.get("tariffa_id") || ""),
      canone_mensile: String(dati.get("canone_mensile") || ""),
      scadenza_contratto: String(dati.get("scadenza_contratto") || ""),
      note: String(dati.get("note") || ""),
    });
    setInCorso(false);
    if (risultato.errore) return setErrore(risultato.errore);
    router.refresh();
    onFatto();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{cliente.nome}</SheetTitle>
        <SheetDescription>Dati contrattuali — tariffa, canone, scadenza.</SheetDescription>
      </SheetHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 px-4 pb-4">
        <div>
          <Label htmlFor="tariffa_id">Tariffa attiva</Label>
          <select id="tariffa_id" name="tariffa_id" defaultValue={cliente.dati?.tariffa_id ?? ""} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
            <option value="">Nessuna</option>
            {tariffe.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="canone_mensile">Canone mensile (€)</Label>
          <Input id="canone_mensile" name="canone_mensile" type="number" step="0.01" min="0" defaultValue={cliente.dati?.canone_mensile ?? ""} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="scadenza_contratto">Scadenza contratto</Label>
          <Input id="scadenza_contratto" name="scadenza_contratto" type="date" defaultValue={cliente.dati?.scadenza_contratto ?? ""} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="note">Note</Label>
          <textarea id="note" name="note" rows={3} defaultValue={cliente.dati?.note ?? ""} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
        </div>
        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}
        <Button type="submit" disabled={inCorso} className="mt-2">
          {inCorso ? "Salvataggio..." : "Salva"}
        </Button>
      </form>
    </>
  );
}
