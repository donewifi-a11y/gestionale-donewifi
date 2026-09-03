"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Ticket as TicketIcon, Trash2, Loader2, Users2, FileText, MapPin, Phone, CreditCard, Clock } from "lucide-react";
import { PulsanteDocumento } from "@/components/condivisi/pulsante-documento";
import { IconaCategoria } from "@/components/condivisi/icona-categoria";
import { SegnalePulsante, entroOreDa } from "@/components/condivisi/segnale-pulsante";
import { GruppoDatiCliente, formattaValoreCampo } from "@/components/condivisi/dati-cliente";
import { CONFIG_STATO_TRACCIA, type StatoTraccia } from "@/lib/stato-traccia";
import type { CategoriaIcona } from "@/lib/colore-icone";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { aggiornaStatoRichiestaCliente, eliminaRichiestaCliente, urlDocumentoRichiesta } from "@/app/(app)/richieste-clienti/actions";
import type { RichiestaCliente } from "@/lib/types";
import { etichettaDettaglio } from "@/lib/etichette-dettagli";
import { useToast } from "@/components/ui/toast";

// ★ NUOVA (2026-09-03, "rivediamo la grafica... deve essere tutta
// omologata con il sistema attuale" — screenshot di una pratica
// Trasferimento con CAP/VIA/NOME/NOTE ecc. come elenco piatto) — i campi
// che una pratica di Gestione Cliente può portare (diversi da quelli di
// "Richiesta Dati" in Segnalazioni: qui non c'è un piano scelto, ma
// possono comparire nome/telefono per il subentro, un nuovo indirizzo per
// il trasferimento, IBAN per il cambio pagamento...), raggruppati come già
// avviene in Segnalazioni invece di un unico elenco piatto. Un "Altro" in
// fondo raccoglie qualunque campo futuro non ancora previsto qui, così non
// sparisce in silenzio (stesso principio già in uso in segnalazioni-board.tsx).
// ★ ESTESA (2026-09-03, "vai con la c" — trattamento "C" dell'artifact
// "Colorazione Gestione Cliente") — icona/categoria per ogni gruppo, stesso
// COLORE_ICONA usato ovunque nel gestionale: "Altro" resta senza (nessuna
// delle 6 categorie di significato dato gli si addice davvero).
const GRUPPI_DETTAGLI_PRATICA: { titolo: string; campi: string[]; icona: typeof Phone; categoria: CategoriaIcona }[] = [
  { titolo: "Contatto", campi: ["nome", "cognome", "telefono", "email", "nuovoTelefono", "nuovaEmail"], icona: Phone, categoria: "contatto" },
  { titolo: "Pagamento", campi: ["metodoPagamento", "iban", "ibanIntestatarioNome", "ibanIntestatarioCf", "mandatoSepa"], icona: CreditCard, categoria: "denaro" },
  { titolo: "Preferenze", campi: ["dataPreferita", "note"], icona: Clock, categoria: "tempo" },
];
const CAMPI_INDIRIZZO_PRATICA = ["via", "civico", "piano", "comune", "cap"];

const STATI = ["Da Lavorare", "In Verifica", "Lavorata"];

// ★ NUOVA (2026-08) — Sistema Subentro, doppio consenso in parallelo
// (Opzione B): a differenza delle altre pratiche, qui lo stato non basta
// da solo a dire "cosa manca" — servono le due tracce indipendenti (vedi
// avviaPraticaSubentro/inviaLinkVecchioClienteSubentro).
function traccePratica(r: RichiestaCliente): { vecchio: StatoTraccia; nuovo: "ok" | "attesa" } | null {
  if (r.tipo_richiesta !== "Subentro") return null;
  return {
    vecchio: r.vecchio_cliente_confermato_il ? "ok" : r.vecchio_cliente_rifiutato_il ? "no" : "attesa",
    nuovo: Object.keys(r.dettagli || {}).length > 0 ? "ok" : "attesa",
  };
}

function PallinoTraccia({ etichetta, stato }: { etichetta: string; stato: StatoTraccia }) {
  const { icona: Icona, classi } = CONFIG_STATO_TRACCIA[stato];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${classi}`}>
      <Icona className="h-3 w-3 shrink-0" strokeWidth={2.5} />
      {etichetta}
    </span>
  );
}

const COLORE_TIPO: Record<string, string> = {
  "Cambio IBAN": "bg-success/10 text-success border-success/20",
  "Cambio Anagrafica": "bg-success/10 text-success border-success/20",
  Trasferimento: "bg-accent text-accent-foreground border-accent",
  Subentro: "bg-accent text-accent-foreground border-accent",
  "Richiesta Dati": "bg-secondary text-secondary-foreground border-transparent",
  // ★ NUOVA (2026-08) — Disdetta, tracciata solo come promemoria (vedi
  // segnaDisdettaRicevuta() in clienti-esterni/actions.ts) — colore critico
  // perché, a differenza delle altre, segnala la perdita di un cliente.
  Disdetta: "bg-critical/10 text-critical border-critical/20",
};

export function RichiesteClientiBoard({ richieste, isAdmin }: { richieste: RichiestaCliente[]; isAdmin: boolean }) {
  const [ricerca, setRicerca] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [aperta, setAperta] = useState<RichiestaCliente | null>(null);

  const tipi = useMemo(() => Array.from(new Set(richieste.map((r) => r.tipo_richiesta))), [richieste]);

  const filtrate = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    return richieste.filter((r) => (!fTipo || r.tipo_richiesta === fTipo) && (!testo || (r.cliente || "").toLowerCase().includes(testo)));
  }, [richieste, fTipo, ricerca]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
          <input
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca cliente..."
            className="h-9 w-48 rounded-md border bg-background pl-8 pr-3 text-sm"
          />
        </div>
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="">Tutti i tipi</option>
          {tipi.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STATI.map((stato) => {
          const items = filtrate.filter((r) => r.stato === stato);
          return (
            <div key={stato} className="rounded-2xl bg-muted/50 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="font-heading text-sm font-bold">{stato}</span>
                <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground shadow-sm">
                  {items.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Vuoto.</div>
                )}
                {items.map((r) => (
                  <div
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setAperta(r)}
                    onKeyDown={(e) => e.key === "Enter" && setAperta(r)}
                    className="cursor-pointer rounded-xl border bg-card p-3 text-left text-sm shadow-md transition hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="font-semibold">{r.cliente || "—"}</span>
                    </div>
                    <div className="mb-2 text-xs text-muted-foreground">
                      {new Date(r.data).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </div>
                    <Badge variant="outline" className={COLORE_TIPO[r.tipo_richiesta] ?? ""}>
                      {r.tipo_richiesta}
                    </Badge>
                    {traccePratica(r) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <PallinoTraccia etichetta="Vecchio cliente" stato={traccePratica(r)!.vecchio} />
                        <PallinoTraccia etichetta="Nuovo cliente" stato={traccePratica(r)!.nuovo} />
                      </div>
                    )}
                    {/* ★ NUOVA (2026-08-27, richiesta esplicita: "rivedere il
                    sistema di notificazione come pulsa la notifica di
                    documenti ricevuti" → "estenderlo agli altri 6 eventi-
                    cliente") — il vecchio cliente ha appena risposto
                    (Subentro, entro 48h): il pallino statico sopra dice
                    "ok"/"no", questo in più pulsa finché è fresco — stesso
                    trattamento già in uso in Segnalazioni. */}
                    {r.tipo_richiesta === "Subentro" &&
                      (entroOreDa(r.vecchio_cliente_confermato_il, 48) || entroOreDa(r.vecchio_cliente_rifiutato_il, 48)) && (
                        <div className="mt-1.5">
                          <SegnalePulsante
                            testo={r.vecchio_cliente_confermato_il ? "✓ Vecchio cliente ha confermato" : "✗ Vecchio cliente ha rifiutato"}
                            tono={r.vecchio_cliente_confermato_il ? "successo" : "critico"}
                            pulsante
                          />
                        </div>
                      )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ★ FIX (2026-08, controllo d'oro) — ultimo popup a pannello laterale
      (Sheet) rimasto in Richieste Clienti, uniformato al popup centrale
      (Dialog) come il resto del gestionale. */}
      <Dialog open={!!aperta} onOpenChange={(v) => !v && setAperta(null)}>
        <DialogContent>
          {aperta && (
            <DettaglioRichiesta
              richiesta={aperta}
              isAdmin={isAdmin}
              onCambiata={(r) => setAperta(r)}
              onEliminata={() => setAperta(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DettaglioRichiesta({
  richiesta,
  isAdmin,
  onCambiata,
  onEliminata,
}: {
  richiesta: RichiestaCliente;
  isAdmin: boolean;
  onCambiata: (r: RichiestaCliente) => void;
  onEliminata: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [inCorso, startTransizione] = useTransition();
  const [inCorsoElimina, startElimina] = useTransition();
  // ★ NUOVA — stesso "copia per campo/copia tutto" già in uso in Segnalazioni
  // (GruppoDatiCliente), qui replicato per lo stesso identico bisogno: chi
  // lavora una pratica ricopia questi dati nel gestionale contratti esterno.
  const [campiCopiati, setCampiCopiati] = useState<Set<string>>(new Set());

  function copiaCampo(chiave: string, etichetta: string, valore: string) {
    navigator.clipboard.writeText(valore);
    setCampiCopiati((cur) => new Set(cur).add(chiave));
    toast(`Copiato "${etichetta}".`, "successo");
  }

  function copiaGruppo(titolo: string, voci: { chiave: string; etichetta: string; valore: string }[]) {
    const blocco = voci.map((v) => `${v.etichetta}: ${v.valore}`).join("\n");
    navigator.clipboard.writeText(blocco);
    setCampiCopiati((cur) => {
      const nuovo = new Set(cur);
      voci.forEach((v) => nuovo.add(v.chiave));
      return nuovo;
    });
    toast(`Copiata tutta la sezione "${titolo}".`, "successo");
  }

  function cambiaStato(nuovo: string) {
    if (nuovo === richiesta.stato) return;
    startTransizione(async () => {
      const risultato = await aggiornaStatoRichiestaCliente(richiesta.id, nuovo);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      onCambiata({ ...richiesta, stato: nuovo });
      toast(`Passata a "${nuovo}".`, "successo");
      router.refresh();
    });
  }

  // ★ NUOVA — solo un amministratore la vede (pulsante non renderizzato
  // affatto per gli altri, controllo comunque ripetuto lato server in
  // eliminaRichiestaCliente()): cancellazione vera, pensata per moduli di
  // prova, duplicati o inviati per errore dal cliente.
  function elimina() {
    if (
      !confirm(
        `Eliminare definitivamente questa richiesta (${richiesta.tipo_richiesta} — ${richiesta.cliente ?? "cliente"})? L'operazione non è reversibile.`
      )
    )
      return;
    startElimina(async () => {
      const risultato = await eliminaRichiestaCliente(richiesta.id);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      toast("Richiesta eliminata.", "successo");
      onEliminata();
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{richiesta.cliente || "Richiesta"}</DialogTitle>
        <DialogDescription>{richiesta.tipo_richiesta}</DialogDescription>
      </DialogHeader>
      <div className="flex min-w-0 flex-col gap-4 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {STATI.map((s) => (
            <button
              key={s}
              disabled={inCorso}
              onClick={() => cambiaStato(s)}
              className={`flex min-h-9 items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${
                s === richiesta.stato
                  ? "border-primary bg-gradient-to-b from-primary to-[color-mix(in_oklch,var(--primary),black_14%)] text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:border-primary/40"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {traccePratica(richiesta) && (
          <div className="flex flex-wrap gap-1.5">
            <PallinoTraccia etichetta="Vecchio cliente" stato={traccePratica(richiesta)!.vecchio} />
            <PallinoTraccia etichetta="Nuovo cliente" stato={traccePratica(richiesta)!.nuovo} />
          </div>
        )}

        {richiesta.ticket_id && (
          <Link
            href={`/tickets?aperto=${richiesta.ticket_id}`}
            className="flex w-fit items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs font-semibold text-primary transition hover:bg-muted/60"
          >
            <TicketIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
            Vedi il Ticket collegato
          </Link>
        )}

        {/* ★ NUOVA (2026-08) — "Pratiche cliente senza Ticket": molte
        pratiche ora non hanno più un Ticket, solo il cliente vero
        (anagrafica Aruba) — stesso trattamento del link sopra. */}
        {richiesta.cliente_esterno_id && (
          <Link
            href={`/clienti-esterni/${richiesta.cliente_esterno_id}`}
            className="flex w-fit items-center gap-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs font-semibold text-primary transition hover:bg-muted/60"
          >
            <Users2 className="h-3.5 w-3.5" strokeWidth={2.25} />
            Vedi la scheda cliente
          </Link>
        )}

        {(() => {
          const dettagli = richiesta.dettagli || {};
          const campiUsati = new Set(CAMPI_INDIRIZZO_PRATICA);
          const vociIndirizzo = CAMPI_INDIRIZZO_PRATICA.filter((c) => !!dettagli[c]);
          const gruppiConDati = GRUPPI_DETTAGLI_PRATICA.map((g) => ({
            titolo: g.titolo,
            icona: g.icona,
            categoria: g.categoria,
            voci: g.campi.filter((c) => {
              const presente = !!dettagli[c];
              if (presente) campiUsati.add(c);
              return presente;
            }),
          })).filter((g) => g.voci.length > 0);
          const altriCampi = Object.keys(dettagli).filter((c) => !campiUsati.has(c) && dettagli[c]);
          // ★ solo per il link "Apri in mappa" — il campo "via" può già
          // essere una stringa d'indirizzo completa (compilata con
          // IndirizzoAutocomplete) o solo il nome della strada a seconda di
          // come l'ha scritta il cliente: in entrambi i casi va bene come
          // query di ricerca su Google Maps, non va invece mostrata
          // concatenata con civico/comune a video — il risultato per un
          // indirizzo già completo sarebbe illeggibile (doppio comune,
          // doppio CAP). I singoli campi restano leggibili uno per uno qui
          // sotto (GruppoDatiCliente), come per gli altri gruppi.
          const queryMappa = [dettagli.via, dettagli.civico, dettagli.comune].filter(Boolean).join(" ");

          return (
            <>
              {vociIndirizzo.length > 0 && (
                <GruppoDatiCliente
                  titolo="Indirizzo"
                  icona={MapPin}
                  categoria="luogo"
                  voci={vociIndirizzo.map((chiave) => ({ chiave, etichetta: etichettaDettaglio(chiave), valore: dettagli[chiave] }))}
                  campiCopiati={campiCopiati}
                  onCopiaCampo={copiaCampo}
                  onCopiaGruppo={copiaGruppo}
                  azioneDestra={
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(queryMappa)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold text-primary transition hover:border-primary/40"
                    >
                      <MapPin className="h-2.5 w-2.5 shrink-0" strokeWidth={2.5} />
                      Apri in mappa
                    </a>
                  }
                />
              )}

              {gruppiConDati.map((gruppo) => (
                <GruppoDatiCliente
                  key={gruppo.titolo}
                  titolo={gruppo.titolo}
                  icona={gruppo.icona}
                  categoria={gruppo.categoria}
                  voci={gruppo.voci.map((chiave) => ({ chiave, etichetta: etichettaDettaglio(chiave), valore: formattaValoreCampo(chiave, dettagli[chiave]) }))}
                  campiCopiati={campiCopiati}
                  onCopiaCampo={copiaCampo}
                  onCopiaGruppo={copiaGruppo}
                />
              ))}

              {altriCampi.length > 0 && (
                <GruppoDatiCliente
                  titolo="Altro"
                  voci={altriCampi.map((chiave) => ({ chiave, etichetta: etichettaDettaglio(chiave), valore: dettagli[chiave] }))}
                  campiCopiati={campiCopiati}
                  onCopiaCampo={copiaCampo}
                  onCopiaGruppo={copiaGruppo}
                />
              )}
            </>
          );
        })()}

        {richiesta.documenti?.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <IconaCategoria icona={FileText} categoria="documento" dimensione="sm" />
              Documenti
            </div>
            <div className="flex flex-col gap-1.5">
              {richiesta.documenti.map((doc, i) => (
                <PulsanteDocumento
                  key={i}
                  percorso={doc.percorso}
                  nome={doc.nome}
                  etichetta={doc.tipo ? `${doc.tipo} — ${doc.nome}` : doc.nome}
                  onOttieniUrl={urlDocumentoRichiesta}
                />
              ))}
            </div>
          </div>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={elimina}
            disabled={inCorsoElimina}
            className="mt-2 flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-critical/30 px-3 py-3 text-xs font-semibold text-critical transition hover:bg-critical/10 disabled:opacity-50"
          >
            {inCorsoElimina ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />}
            {inCorsoElimina ? "Eliminazione in corso…" : "Elimina richiesta"}
          </button>
        )}
      </div>
    </>
  );
}
