"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Phone, MapPin, ChevronDown, FileEdit, AlertTriangle, Users2, UserPlus2, Database, ArrowUpRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { StatoVuoto } from "@/components/ui/stato-vuoto";
import { salvaDatiContrattualiCliente, type RigaInstallazione } from "@/app/(app)/clienti/actions";
import { InstallazioniTabella } from "@/components/clienti/installazioni-tabella";
import { ClientiEsterniBoard } from "@/components/clienti-esterni/clienti-esterni-board";
import type { ClienteInsoluto, ClienteBuyGo } from "@/app/(app)/clienti-esterni/actions";
import type { ClienteAttivo, ClienteEsterno, Tariffa, Ticket } from "@/lib/types";

// ★ NUOVA (2026-08) — "Clienti" e "Anagrafica Clienti" erano due voci quasi
// omonime nel menu, senza indizio su quale aprire — proposta con artifact,
// Opzione B: una voce sola, questa tab in più invece di una pagina a sé
// (stesso schema già usato per Persone+Utenti e Materiali). `null` quando
// chi guarda non ha il permesso (Commerciale/Fatturazione/admin) — vedi
// clienti/page.tsx: in quel caso i dati pesanti non vengono nemmeno
// recuperati dal server, non solo nascosti qui.
export interface DatiAnagrafica {
  clienti: ClienteEsterno[];
  isAdmin: boolean;
  ultimaSincronizzazione: string | null;
  clientiAttivi: number;
  insoluti: { totale: number; numeroFatture: number; clienti: ClienteInsoluto[] } | null;
  clientiBuyGo: ClienteBuyGo[];
}

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
  installazioni,
  puoModificare,
  anagrafica,
}: {
  tickets: Ticket[];
  clienti: ClienteAttivo[];
  tariffe: Tariffa[];
  clientiEsterni: ClienteEsternoRidotto[];
  installazioni: RigaInstallazione[];
  puoModificare: boolean;
  anagrafica: DatiAnagrafica | null;
}) {
  // ★ NUOVA — richiesta esplicita: elenco dei clienti installati coi dati
  // dalla Scheda di lavoro, come nuova tab qui invece di una pagina a sé
  // (proposta con artifact, scelta A — tabella, dentro "Clienti").
  const [vista, setVista] = useState<"clienti" | "installazioni" | "anagrafica">("clienti");
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
      {/* ★ UNIFORMATO (2026-08-28, artifact "Armonia UI", "sì, pillola
      arrotondata ovunque") — stesso guscio di Calendario/navigazione data/
      rail sidebar, al posto del segmento quadrato usato qui prima. */}
      <div className="mb-5 flex items-center gap-1 rounded-full border bg-card p-1 shadow-sm" style={{ width: "fit-content" }}>
        <button
          onClick={() => setVista("clienti")}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${vista === "clienti" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}
        >
          Clienti
        </button>
        <button
          onClick={() => setVista("installazioni")}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${vista === "installazioni" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}
        >
          Installazioni ({installazioni.length})
        </button>
        {anagrafica && (
          <button
            onClick={() => setVista("anagrafica")}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${vista === "anagrafica" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}
          >
            Anagrafica
          </button>
        )}
      </div>

      {vista === "installazioni" ? (
        <InstallazioniTabella installazioni={installazioni} />
      ) : vista === "anagrafica" && anagrafica ? (
        <ClientiEsterniBoard
          clienti={anagrafica.clienti}
          isAdmin={anagrafica.isAdmin}
          ultimaSincronizzazione={anagrafica.ultimaSincronizzazione}
          clientiAttivi={anagrafica.clientiAttivi}
          insoluti={anagrafica.insoluti}
          clientiBuyGo={anagrafica.clientiBuyGo}
        />
      ) : (
        <>
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

      {filtrati.length === 0 && <StatoVuoto icona={Users2} titolo="Nessun cliente trovato." />}

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

      {/* ★ FIX (2026-08, controllo d'oro) — questo era l'unico popup rimasto
      a pannello laterale (Sheet) in Clienti, mentre tutto il resto del
      gestionale è già stato uniformato al popup centrale (Dialog) — vedi
      Tickets/Segnalazioni/Calendario/Tariffe/Persone/Utenti/Preventivi. */}
      <Dialog open={!!modifica} onOpenChange={(v) => !v && setModifica(null)}>
        <DialogContent>
          {modifica && <FormDatiContrattuali cliente={modifica} tariffe={tariffe} onFatto={() => setModifica(null)} />}
        </DialogContent>
      </Dialog>
        </>
      )}
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
  const toast = useToast();
  const [inCorso, startTransizione] = useTransition();
  const [errore, setErrore] = useState("");

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    startTransizione(async () => {
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
      if (risultato.errore) {
        setErrore(risultato.errore);
        return;
      }
      toast("Dati contrattuali salvati.", "successo");
      router.refresh();
      onFatto();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{cliente.nome}</DialogTitle>
        <DialogDescription>Dati contrattuali — tariffa, canone, scadenza.</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
        <Button type="submit" disabled={inCorso} className="mt-2 min-h-11">
          {inCorso && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />}
          {inCorso ? "Salvataggio in corso…" : "Salva"}
        </Button>
      </form>
    </>
  );
}
