"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import {
  UserRound,
  X,
  Copy,
  Check,
  Rocket,
  Clock,
  Search,
  MessageCircle,
  Mail,
  FileText,
  Upload,
  AlertTriangle,
  MapPin,
  PhoneCall,
  ArrowRight,
  Trash2,
  Send,
  Info,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SuggerimentoCampo } from "@/components/ui/suggerimento-campo";
import {
  cambiaStatoSegnalazione,
  trasmettiPerInstallazione,
  caricaContrattoSegnalazione,
  urlContratto,
  inviaEmailRichiestaDatiSegnalazione,
  getUltimoCaricamentoContratto,
  eliminaSegnalazione,
  inviaEmailApprovazioneContratto,
} from "@/app/(app)/segnalazioni/actions";
import type { AreaAccesso, RichiestaCliente, Segnalazione, StatoSegnalazione } from "@/lib/types";
import { REPARTI } from "@/lib/types";
import { etichettaDettaglio } from "@/lib/etichette-dettagli";
import { useToast } from "@/components/ui/toast";
import { usePersistedState } from "@/lib/use-persisted-state";
import { createClient } from "@/lib/supabase/client";
import { COLORE_WHATSAPP } from "@/lib/colori-brand";

const COLONNE: { titolo: string; stato: StatoSegnalazione }[] = [
  { titolo: "Da Contattare", stato: "Da Contattare" },
  { titolo: "In Contatto", stato: "In Contatto" },
  { titolo: "Gestione Cliente", stato: "Gestione Cliente" },
  { titolo: "Trasmessa", stato: "Trasmessa" },
];

const COLORE_COPERTURA: Record<string, string> = {
  si: "bg-success/10 text-success border-success/20",
  no: "bg-critical/10 text-critical border-critical/20",
  daVerificare: "bg-warning/10 text-warning border-warning/20",
};

const STRIPE_COPERTURA: Record<string, string> = {
  si: "before:bg-success",
  no: "before:bg-critical",
  daVerificare: "before:bg-warning",
};

const CHIAVE_FILTRI = "segnalazioniFiltri";

// ★ FIX — "Dati ricevuti dal cliente" era un unico elenco piatto (ordine di
// invio del form, non di lettura), con Tipologia Cliente/Profilo Internet
// del tutto assenti (salvati sulla Segnalazione ma mai mostrati qui) e 4
// campi con il nome tecnico invece di un'etichetta ("router", "extenderMesh"…).
// Ora è raggruppato per come uno lo cerca in pratica (piano scelto, poi
// anagrafica, contatti, pagamento…), con l'indirizzo unito su una riga sola
// invece di 4 righe separate — un "Altro" raccoglie eventuali campi futuri
// non ancora previsti in nessun gruppo, così non spariscono in silenzio.
const GRUPPI_DETTAGLI: { titolo: string; campi: string[] }[] = [
  { titolo: "Piano scelto", campi: ["tipologiaCliente", "profiloInternet", "router", "extenderMesh", "costoMensile", "costoUnaTantum"] },
  { titolo: "Anagrafica", campi: ["nome", "cognome", "codiceFiscale", "ragioneSociale", "partitaIva", "codiceFiscaleAzienda", "pec", "sdi", "legaleRappresentanteNome", "legaleRappresentanteCf"] },
  { titolo: "Contatti", campi: ["telefono", "email"] },
  { titolo: "Pagamento", campi: ["metodoPagamento", "iban", "ibanIntestatarioNome", "ibanIntestatarioCf", "mandatoSepa"] },
  { titolo: "Note", campi: ["note"] },
];
const CAMPI_INDIRIZZO = ["via", "civico", "comune", "cap"];
const TIPI_DOCUMENTO: Record<string, string> = { CI: "Carta d'Identità", PATENTE: "Patente", PASSAPORTO: "Passaporto" };

function formattaValoreCampo(chiave: string, valore: string) {
  if (chiave === "mandatoSepa") return valore === "on" ? "Sì" : valore;
  return valore;
}

function giorniAperta(data: string) {
  const ms = Date.now() - new Date(data).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function SegnalazioniBoard({
  segnalazioni,
  richieste,
  currentPersonaId,
  isAdmin,
}: {
  segnalazioni: Segnalazione[];
  richieste: RichiestaCliente[];
  currentPersonaId: string;
  isAdmin: boolean;
}) {
  const [aperta, setAperta] = useState<Segnalazione | null>(null);
  // ★ FIX — filtri ricordati per utente/browser: lettura/scrittura ora in
  // usePersistedState() (src/lib/use-persisted-state.ts), estratto da qui
  // e da tickets-board.tsx dove la stessa logica era duplicata quasi
  // identica (i commenti si citavano a vicenda riconoscendolo).
  const [filtri, aggiornaFiltri] = usePersistedState(CHIAVE_FILTRI, { soloMie: false });
  const [ricerca, setRicerca] = useState("");
  const searchParams = useSearchParams();
  const router = useRouter();

  // ★ apre direttamente una segnalazione via ?aperto=<id> — usato dalla
  // ricerca globale.
  useEffect(() => {
    const id = searchParams.get("aperto");
    if (!id) return;
    const trovata = segnalazioni.find((s) => s.id === id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizza con l'URL (?aperto=id), non deriva da props/stato locale: è il caso d'uso "external system" per cui useEffect è corretto.
    if (trovata) setAperta(trovata);
  }, [searchParams, segnalazioni]);

  // ★ FIX — quando arrivano dati/documenti dal cliente (POST pubblico a
  // /api/richiesta-dati) la bacheca restava com'era finché non si ricaricava
  // la pagina a mano: `segnalazioni`/`richieste` sono props di un Server
  // Component, non si aggiornano da sole. Un canale Realtime su entrambe le
  // tabelle fa scattare `router.refresh()` (nuovo fetch server-side) appena
  // qualcosa cambia — stesso principio già usato per la Chat
  // (chat-data-context.tsx), un solo canale per board (mai più istanze
  // contemporaneamente), quindi nessun rischio di nome duplicato.
  useEffect(() => {
    const supabase = createClient();
    const canale = supabase
      .channel("segnalazioni-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "segnalazioni" }, () => router.refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "richieste_clienti" }, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(canale);
    };
  }, [router]);

  // ★ la Segnalazione aperta nel dialog è uno snapshot in stato locale: senza
  // questo, dopo un router.refresh() la bacheca dietro si aggiorna ma il
  // dialog già aperto continua a mostrare dati/stato vecchi finché non lo si
  // chiude e riapre.
  useEffect(() => {
    if (!aperta) return;
    const fresca = segnalazioni.find((s) => s.id === aperta.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- risincronizza con la prop `segnalazioni` dopo un refresh esterno (Realtime/router.refresh), non derivabile durante il render di questo componente.
    if (fresca && fresca !== aperta) setAperta(fresca);
  }, [segnalazioni, aperta]);

  const filtrate = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    return segnalazioni.filter(
      (s) =>
        (!filtri.soloMie || s.operatore_id === currentPersonaId) &&
        (!testo ||
          s.nome.toLowerCase().includes(testo) ||
          s.telefono.includes(testo) ||
          s.comune.toLowerCase().includes(testo) ||
          String(s.numero).includes(testo))
    );
  }, [segnalazioni, filtri.soloMie, currentPersonaId, ricerca]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
          <input
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca nome, telefono, comune..."
            className="h-9 w-56 rounded-md border bg-background pl-8 pr-3 text-sm"
          />
        </div>
        <Button size="sm" variant={filtri.soloMie ? "default" : "outline"} onClick={() => aggiornaFiltri({ soloMie: !filtri.soloMie })}>
          <UserRound className="h-3.5 w-3.5" strokeWidth={2.5} />
          Solo le mie
        </Button>
        {(filtri.soloMie || ricerca) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              aggiornaFiltri({ soloMie: false });
              setRicerca("");
            }}
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
            Azzera filtri
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {COLONNE.map((col) => {
          const items = filtrate.filter((s) => s.stato === col.stato);
          // ★ FIX — "Gestione Cliente" non segnalava in nessun modo che i
          // dati/documenti fossero già arrivati dal cliente: bisognava
          // aprire ogni card per scoprirlo. Ora le pratiche pronte per
          // essere trasmesse salgono in cima alla colonna.
          if (col.stato === "Gestione Cliente") {
            items.sort((a, b) => Number(!!b.dati_ricevuti_at) - Number(!!a.dati_ricevuti_at));
          }
          const mostraGiorni = col.stato === "Da Contattare" || col.stato === "In Contatto";
          return (
            <div key={col.stato} className="rounded-2xl bg-muted/50 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className="font-heading text-sm font-bold">{col.titolo}</span>
                <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground shadow-sm">
                  {items.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Vuoto.
                  </div>
                )}
                {items.map((s) => {
                  const giorni = giorniAperta(s.data);
                  const inAttesaDati = col.stato === "Gestione Cliente" && !s.dati_ricevuti_at && !!s.documenti_richiesti_at;
                  const giorniAttesa = inAttesaDati ? giorniAperta(s.documenti_richiesti_at as string) : 0;
                  // ★ NUOVA — richiesta esplicita "a prova di scemo": prima la
                  // card impilava fino a 4-5 badge piccoli da leggere e
                  // interpretare tutti insieme, senza dire quale richiedesse
                  // davvero attenzione. Ora un solo segnale, il più urgente
                  // tra quelli possibili — e dice anche cosa fare, non solo
                  // il problema. Nessun problema in corso → card pulita,
                  // senza badge (il "tutto normale" non ha bisogno di un
                  // colore acceso addosso).
                  let segnale: { testo: string; critico: boolean } | null = null;
                  if (inAttesaDati && giorniAttesa >= 3) {
                    segnale = { testo: `⏳ In attesa dati da ${giorniAttesa}g — sollecita`, critico: giorniAttesa >= 7 };
                  } else if (mostraGiorni && giorni >= 2) {
                    segnale = { testo: `⏳ Ferma da ${giorni}g — contatta il cliente`, critico: giorni >= 5 };
                  } else if (col.stato === "Gestione Cliente" && s.dati_ricevuti_at) {
                    segnale = { testo: "✓ Dati ricevuti — pronta per il contratto", critico: false };
                  }
                  return (
                    <div
                      key={s.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setAperta(s)}
                      onKeyDown={(e) => e.key === "Enter" && setAperta(s)}
                      className={`relative cursor-pointer overflow-hidden rounded-xl border bg-card p-3 pl-4 text-left text-sm shadow-md transition before:absolute before:inset-y-0 before:left-0 before:w-1 hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/40 ${STRIPE_COPERTURA[s.copertura]}`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-semibold">{s.nome}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">#{s.numero}</span>
                      </div>
                      <div className="mb-2 text-xs text-muted-foreground line-clamp-1">
                        {s.comune}
                        {s.tipologia_cliente ? ` · ${s.tipologia_cliente === "Azienda" ? "🏢 Azienda" : "👤 Privato"}` : ` · ${s.telefono}`}
                      </div>
                      {segnale ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${
                            segnale.critico
                              ? "bg-critical/10 text-critical"
                              : segnale.testo.startsWith("✓")
                                ? "bg-success/10 text-success"
                                : "bg-warning/10 text-warning"
                          }`}
                        >
                          {segnale.testo}
                        </span>
                      ) : (
                        s.copertura !== "si" && (
                          <Badge variant="outline" className={COLORE_COPERTURA[s.copertura]}>
                            {s.copertura === "no" ? "Copertura no" : "Copertura da verificare"}
                          </Badge>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ★ NUOVO — da pannello laterale stretto (~370px, dove i dati veri
       * finivano troncati) a dialog centrale largo (~700px): con dati reali
       * (CF, IBAN, indirizzi, nomi file lunghi) serviva spazio vero, non un
       * layout più furbo nello stesso spazio stretto. A tab (Anagrafica /
       * Piano e pagamento / Documenti) invece di tutto impilato, per non
       * trasformare la maggior larghezza in uno scroll verticale infinito. */}
      <Dialog open={!!aperta} onOpenChange={(v) => !v && setAperta(null)}>
        <DialogContent className="sm:max-w-2xl">
          {aperta && (
            <TooltipProvider>
              <DettaglioSegnalazione
                key={aperta.id}
                segnalazione={aperta}
                richiesta={richieste.find((r) => r.segnalazione_id === aperta.id) ?? null}
                isAdmin={isAdmin}
                onCambiata={(s) => setAperta(s)}
                onChiudi={() => setAperta(null)}
              />
            </TooltipProvider>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ★ NUOVA — bottone di invio reale dentro un <form action={...}>: legge il
// proprio stato "in corso" da useFormStatus() (React 19) invece di una prop
// passata dal genitore, quindi resta sincronizzato anche se il form viene
// inviato in modi diversi (click sul bottone, invio da tastiera, submit
// programmatico via requestSubmit()). Usato per il caricamento del
// contratto, l'unica interazione di questo pannello che è davvero un form
// con un file da inviare — le altre azioni (cambio stato, trasmetti…) non
// hanno campi propri e restano bottoni con Server Action invocata dentro
// una transizione, vedi useTransition() più sotto.
function EtichettaCaricamentoContratto({ giaCaricato }: { giaCaricato: boolean }) {
  const { pending } = useFormStatus();
  if (giaCaricato) {
    return (
      <span className="cursor-pointer text-xs font-semibold text-primary underline-offset-2 hover:underline">
        {pending ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />
            Caricamento...
          </span>
        ) : (
          "Sostituisci"
        )}
      </span>
    );
  }
  return (
    <span className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground transition hover:border-primary hover:text-primary">
      {pending ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={2.25} /> : <Upload className="h-4 w-4 shrink-0" strokeWidth={2.25} />}
      {pending ? "Caricamento..." : "Carica il contratto firmato (PDF)"}
    </span>
  );
}

function DettaglioSegnalazione({
  segnalazione,
  richiesta,
  isAdmin,
  onCambiata,
  onChiudi,
}: {
  segnalazione: Segnalazione;
  richiesta: RichiestaCliente | null;
  isAdmin: boolean;
  onCambiata: (s: Segnalazione) => void;
  onChiudi: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  // ★ NUOVA — una transizione per ogni azione indipendente invece di un
  // unico booleano "inCorso" condiviso: così cliccare "Trasmetti" non
  // accende anche lo spinner del bottone "Elimina" (o viceversa), pur
  // restando entrambe la stessa identica meccanica React (isPending
  // calcolato da startTransition, niente setState manuale prima/dopo).
  const [inCorsoStato, startStato] = useTransition();
  const [inCorsoTrasmetti, startTrasmetti] = useTransition();
  const [inCorsoElimina, startElimina] = useTransition();
  const [inCorsoApprovazione, startApprovazione] = useTransition();
  const [inCorsoEmail, startEmail] = useTransition();

  const [copiato, setCopiato] = useState(false);
  const [contrattoUrl, setContrattoUrl] = useState(segnalazione.contratto_pdf_url);
  const [erroreContratto, setErroreContratto] = useState("");
  const [infoCaricamento, setInfoCaricamento] = useState<{ nome: string; data: string } | null>(null);
  const [erroreApprovazione, setErroreApprovazione] = useState("");
  const formContrattoRef = useRef<HTMLFormElement>(null);
  // ★ FIX — il reparto del Ticket alla trasmissione era fisso nel codice
  // ("Analisi Rete"); ora è una scelta con quello stesso default, per le
  // eccezioni rare in cui l'installazione non la fa Analisi Rete.
  const [repartoTrasmissione, setRepartoTrasmissione] = useState<AreaAccesso>("Analisi Rete");

  useEffect(() => {
    if (!contrattoUrl) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetta lo stato derivato quando il contratto viene rimosso/non c'è, non un caso di "derivabile durante il render" (dipende da un fetch async fatto sotto).
      setInfoCaricamento(null);
      return;
    }
    getUltimoCaricamentoContratto(segnalazione.id).then((info) =>
      setInfoCaricamento(info ? { nome: info.nome, data: info.data } : null)
    );
  }, [contrattoUrl, segnalazione.id]);
  const [esitoEmail, setEsitoEmail] = useState("");
  const [tab, setTab] = useState<"anagrafica" | "indirizzo" | "documenti" | "piano">("anagrafica");

  const linkRichiestaDati = useMemo(
    () => (typeof window !== "undefined" ? `${window.location.origin}/richiesta-dati/${segnalazione.id}` : ""),
    [segnalazione.id]
  );
  const primoNome = segnalazione.nome.trim().split(/\s+/)[0];
  const messaggio = `Ciao ${primoNome}, per completare la tua richiesta Done Wifi inserisci qui i tuoi dati: ${linkRichiestaDati}`;
  const telefonoIntl = "39" + segnalazione.telefono.replace(/\D/g, "").replace(/^0?39/, "").replace(/^0/, "");

  function cambiaStato(nuovo: StatoSegnalazione) {
    startStato(async () => {
      const risultato = await cambiaStatoSegnalazione(segnalazione.id, nuovo, segnalazione.stato);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      onCambiata({ ...segnalazione, stato: nuovo });
      toast(`Passata a "${nuovo}".`, "successo");
      router.refresh();
    });
  }

  // ★ FIX — i 4 pulsanti di stato comparivano tutti insieme, cliccabili in
  // qualunque ordine: nessun segnale su cosa fare dopo, e permetteva di
  // saltare step ("Trasmessa" senza mai essere passati da "Gestione
  // Cliente"). Ora resta un indicatore di avanzamento (sola lettura) più
  // un solo pulsante con l'azione del passo attuale, come da flusso reale:
  // contatta il cliente → avvia Gestione Cliente/manda la Richiesta Dati →
  // (attesa dati/documenti, verificati sotto) → carica il contratto e
  // trasmetti. "Indietro" resta disponibile per correggere un errore.
  const indiceCorrente = COLONNE.findIndex((c) => c.stato === segnalazione.stato);

  // ★ Tipologia Cliente/Profilo Internet non sono in richiesta.dettagli (la
  // route li esclude apposta, sono colonne dirette della Segnalazione): li
  // si inietta qui per mostrarli comunque nello stesso pannello, invece di
  // lasciarli visibili solo indirettamente (dedotti dal router/canone).
  const campiRicevuti: Record<string, string> = richiesta
    ? {
        ...(segnalazione.tipologia_cliente ? { tipologiaCliente: segnalazione.tipologia_cliente } : {}),
        ...(segnalazione.profilo_internet ? { profiloInternet: segnalazione.profilo_internet } : {}),
        ...richiesta.dettagli,
      }
    : {};
  const campiUsati = new Set([...CAMPI_INDIRIZZO, "tipoDocumento"]);
  const gruppiConDati = GRUPPI_DETTAGLI.map((g) => ({
    titolo: g.titolo,
    voci: g.campi.filter((c) => {
      const presente = !!campiRicevuti[c];
      if (presente) campiUsati.add(c);
      return presente;
    }),
  })).filter((g) => g.voci.length > 0);
  const altriCampi = Object.keys(campiRicevuti).filter((c) => !campiUsati.has(c));
  const indirizzoInstallazione = CAMPI_INDIRIZZO.every((c) => campiRicevuti[c])
    ? `${campiRicevuti.via} ${campiRicevuti.civico}, ${campiRicevuti.comune} (${campiRicevuti.cap})`
    : null;
  // ★ i gruppi (Piano scelto/Anagrafica/Contatti/Pagamento/Note) si smistano
  // in 4 tab, nello stesso ordine in cui questi dati vanno ricopiati nel
  // gestionale contratti esterno (service.done.cst98.com): anagrafica e
  // contatti, poi indirizzo e dati di pagamento (RID), poi documenti; il
  // profilo/apparati scelti non hanno un campo corrispondente in quella
  // schermata (si usano dopo, in un altro passaggio), quindi restano per
  // ultimi invece di comparire per primi.
  const gruppiTabAnagrafica = gruppiConDati.filter((g) => ["Anagrafica", "Contatti", "Note"].includes(g.titolo));
  const gruppiTabPagamento = gruppiConDati.filter((g) => g.titolo === "Pagamento");
  const gruppiTabPiano = gruppiConDati.filter((g) => g.titolo === "Piano scelto");

  const mancanti: string[] = [];
  if (!segnalazione.tipologia_cliente || !segnalazione.profilo_internet) mancanti.push("dati del cliente (tipologia/profilo internet)");
  if (!contrattoUrl) mancanti.push("contratto firmato");
  // ★ NUOVA — richiesta esplicita: "Trasmetti" non basta più che il
  // contratto sia caricato, serve che il cliente l'abbia anche approvato
  // (link email monouso, vedi inviaEmailApprovazioneContratto()) prima di
  // procedere con l'installazione.
  else if (!segnalazione.contratto_approvato_cliente_il) mancanti.push("approvazione del contratto da parte del cliente");
  const puoTrasmettere = mancanti.length === 0;

  function trasmetti() {
    if (!puoTrasmettere) return;
    if (!confirm(`Trasmettere la segnalazione #${segnalazione.numero} per l'installazione? Verrà creato un Ticket.`)) return;
    startTrasmetti(async () => {
      const risultato = await trasmettiPerInstallazione(segnalazione.id, repartoTrasmissione);
      if (risultato.errore || !risultato.id) {
        toast(risultato.errore || "Errore imprevisto.");
        return;
      }
      toast(`Trasmessa — Ticket #${risultato.numero} creato.`, "successo");
      onChiudi();
      router.push(`/tickets?aperto=${risultato.id}`);
    });
  }

  // ★ NUOVA — solo un amministratore la vede (pulsante non renderizzato
  // affatto per gli altri, controllo comunque ripetuto lato server in
  // eliminaSegnalazione()): cancellazione vera, non un cambio di stato,
  // pensata per pratiche di prova o duplicate.
  function elimina() {
    if (!confirm(`Eliminare definitivamente la segnalazione #${segnalazione.numero} — ${segnalazione.nome}? L'operazione non è reversibile.`)) return;
    startElimina(async () => {
      const risultato = await eliminaSegnalazione(segnalazione.id);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      toast("Segnalazione eliminata.", "successo");
      onChiudi();
      router.refresh();
    });
  }

  function inviaEmailServer() {
    setEsitoEmail("");
    startEmail(async () => {
      const risultato = await inviaEmailRichiestaDatiSegnalazione(segnalazione.id, window.location.origin);
      if (risultato.errore) {
        setEsitoEmail(risultato.errore);
        toast(risultato.errore);
        return;
      }
      setEsitoEmail("Inviata da commerciale@donewifi.it.");
      toast("Email inviata al cliente.", "successo");
    });
  }

  function copiaLink() {
    navigator.clipboard.writeText(linkRichiestaDati);
    setCopiato(true);
    setTimeout(() => setCopiato(false), 1500);
  }

  function inviaApprovazioneContratto() {
    setErroreApprovazione("");
    startApprovazione(async () => {
      const risultato = await inviaEmailApprovazioneContratto(segnalazione.id, window.location.origin);
      if (risultato.errore) {
        setErroreApprovazione(risultato.errore);
        toast(risultato.errore);
        return;
      }
      onCambiata({ ...segnalazione, contratto_inviato_approvazione_il: new Date().toISOString() });
      toast("Richiesta di approvazione inviata al cliente.", "successo");
      router.refresh();
    });
  }

  // ★ NUOVA — l'upload del contratto passa ora da un vero <form action={...}>:
  // il campo file mantiene l'invio automatico alla scelta del file
  // (onChange → requestSubmit(), stessa UX di prima, senza un secondo click
  // su un bottone "Invia" separato) ma lo stato "in corso" della label è
  // letto da useFormStatus() dentro EtichettaCaricamentoContratto — nessun
  // booleano locale da tenere sincronizzato a mano con l'invio del form.
  async function inviaFormContratto(formData: FormData) {
    setErroreContratto("");
    const risultato = await caricaContrattoSegnalazione(segnalazione.id, formData);
    if (risultato.errore || !risultato.percorso) {
      setErroreContratto(risultato.errore || "Errore imprevisto.");
      toast(risultato.errore || "Errore imprevisto.");
      return;
    }
    setContrattoUrl(risultato.percorso);
    onCambiata({
      ...segnalazione,
      contratto_pdf_url: risultato.percorso,
      contratto_inviato_approvazione_il: null,
      contratto_approvato_cliente_il: null,
    });
    toast("Contratto caricato.", "successo");
  }

  function selezionatoFileContratto() {
    formContrattoRef.current?.requestSubmit();
  }

  // ★ FIX — i documenti allegati dalla Richiesta Dati (fronte/retro
  // documento e tessera sanitaria) comparivano solo come testo ("tipo
  // (nome)"), senza modo di aprirli: bisognava passare da Richieste
  // Clienti per vederli davvero. `urlContratto()` è generica (genera solo
  // una signed URL sul bucket "documenti", non specifica del contratto),
  // quindi si riusa qui invece di duplicarla.
  async function apriDocumento(percorso: string) {
    const risultato = await urlContratto(percorso);
    if (risultato.errore || !risultato.url) {
      toast(risultato.errore || "Errore imprevisto.");
      return;
    }
    window.open(risultato.url, "_blank", "noopener,noreferrer");
  }

  async function vediContratto() {
    if (!contrattoUrl) return;
    const risultato = await urlContratto(contrattoUrl);
    if (risultato.errore || !risultato.url) {
      toast(risultato.errore || "Errore imprevisto.");
      return;
    }
    window.open(risultato.url, "_blank", "noopener,noreferrer");
  }

  // ★ NUOVA — richiesta esplicita "a prova di scemo": prima c'erano fino a
  // 4 pulsanti diversi sparsi nel pannello (stato, contratto, trasmetti),
  // ognuno visibile solo in certe condizioni — bisognava capire da soli
  // quale fosse quello giusto in quel momento. Ora un solo oggetto
  // `azione`, calcolato qui in un posto solo, mostrato in una barra fissa
  // in fondo al popup (sempre nello stesso punto): se non c'è nulla da
  // cliccare, `statoInfo` spiega perché invece di lasciare la barra vuota.
  type Azione = { testo: string; icona: typeof PhoneCall; onClick: () => void; disabilitato: boolean };
  let azione: Azione | null = null;
  let statoInfo: string | null = null;
  if (segnalazione.stato === "Da Contattare") {
    azione = { testo: "Ho contattato il cliente", icona: PhoneCall, onClick: () => cambiaStato("In Contatto"), disabilitato: inCorsoStato };
  } else if (segnalazione.stato === "In Contatto") {
    azione = { testo: "Avvia Gestione Cliente", icona: ArrowRight, onClick: () => cambiaStato("Gestione Cliente"), disabilitato: inCorsoStato };
  } else if (segnalazione.stato === "Gestione Cliente") {
    if (!richiesta) {
      statoInfo = "In attesa che il cliente compili il modulo dati — usa WhatsApp/Email/Copia link qui sopra per sollecitarlo.";
    } else if (!contrattoUrl) {
      statoInfo = "Dati ricevuti. Carica il contratto firmato nella tab Documenti per continuare.";
    } else if (!segnalazione.contratto_approvato_cliente_il && !segnalazione.contratto_inviato_approvazione_il) {
      azione = { testo: "Contratto pronto — invia per approvazione", icona: Send, onClick: inviaApprovazioneContratto, disabilitato: inCorsoApprovazione };
    } else if (!segnalazione.contratto_approvato_cliente_il) {
      statoInfo = `In attesa che il cliente approvi il contratto, inviato il ${new Date(segnalazione.contratto_inviato_approvazione_il as string).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}.`;
    } else {
      azione = { testo: "Trasmetti per l'installazione", icona: Rocket, onClick: trasmetti, disabilitato: inCorsoTrasmetti };
    }
  } else if (segnalazione.stato === "Trasmessa") {
    statoInfo = "Pratica trasmessa — l'installazione è in carico ad Analisi Rete.";
  }

  return (
    <>
      {/* ★ FIX — la X per chiudere restava fissa in alto (dentro DialogContent,
       * fuori dal contenitore che scorre) ma il titolo no: scorrendo il
       * dialog, nome/indirizzo sparivano e al loro posto compariva qualunque
       * campo si trovasse in quel momento in cima al contenuto (es. il valore
       * dell'Email, senza la sua etichetta) — sembrava un'interfaccia rotta.
       * `sticky top-0` tiene il titolo sempre visibile mentre si scorre. */}
      <DialogHeader className="sticky top-0 z-10 -mx-4 -mt-4 border-b bg-popover px-4 pt-4 pb-3">
        <DialogTitle>{segnalazione.nome}</DialogTitle>
        <DialogDescription>
          #{segnalazione.numero} · {segnalazione.via} {segnalazione.civico}, {segnalazione.comune} ({segnalazione.cap})
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-w-0 flex-col gap-4 text-sm">
        <div>
          <div className="flex items-center gap-1">
            {COLONNE.map((c, i) => (
              <div key={c.stato} className="flex flex-1 items-center gap-1">
                <div
                  className={`flex h-6 flex-1 items-center justify-center gap-1 rounded-full px-1.5 text-center text-[10px] font-semibold leading-none ${
                    i === indiceCorrente
                      ? "bg-gradient-to-b from-primary to-[color-mix(in_oklch,var(--primary),black_14%)] text-primary-foreground shadow-sm"
                      : i < indiceCorrente
                        ? "bg-success/15 text-success"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < indiceCorrente && <Check className="h-2.5 w-2.5 shrink-0" strokeWidth={3} />}
                  <span className="truncate">{c.titolo}</span>
                </div>
                {i < COLONNE.length - 1 && (
                  <div className={`h-0.5 w-2 shrink-0 rounded ${i < indiceCorrente ? "bg-success/40" : "bg-muted"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ★ FIX — una volta arrivata la Richiesta Dati, Telefono/Email qui
         * duplicavano esattamente lo stesso valore già nella tab Anagrafica →
         * Contatti (la route li risincronizza sulla Segnalazione quando
         * arrivano): tenerli entrambi allungava lo scroll prima di arrivare
         * alle tab senza aggiungere informazione. */}
        {!richiesta && (
          <>
            <Campo
              etichetta="Tipologia Cliente"
              valore={segnalazione.tipologia_cliente ? `${segnalazione.tipologia_cliente === "Azienda" ? "🏢" : "👤"} ${segnalazione.tipologia_cliente}` : "—"}
            />
            <Campo etichetta="Telefono" valore={segnalazione.telefono} />
            <Campo etichetta="Email" valore={segnalazione.email || "—"} />
          </>
        )}
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Indirizzo</div>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(`${segnalazione.via} ${segnalazione.civico}, ${segnalazione.comune} ${segnalazione.cap}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 flex items-center gap-1.5 font-medium text-primary underline-offset-2 hover:underline"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
            {segnalazione.via} {segnalazione.civico}, {segnalazione.comune} ({segnalazione.cap})
          </a>
        </div>
        <Campo etichetta="Note" valore={segnalazione.note || "—"} />

        {segnalazione.stato === "Gestione Cliente" && !richiesta && (
          <div className="rounded-xl border bg-card p-3 shadow-sm">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Invia il modulo dati al cliente
            </p>
            <div className="mb-3 rounded-lg bg-muted/60 p-2.5 text-xs leading-relaxed text-muted-foreground">
              &ldquo;{messaggio}&rdquo;
            </div>
            <div className="mb-2 grid grid-cols-3 gap-1.5">
              <a
                href={`https://wa.me/${telefonoIntl}?text=${encodeURIComponent(messaggio)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-11 items-center gap-2 rounded-lg border bg-background px-2.5 py-3 text-xs font-semibold shadow-sm transition hover:border-primary/40"
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-md ${COLORE_WHATSAPP.badge}`}>
                  <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
                </span>
                WhatsApp
              </a>
              <button
                onClick={inviaEmailServer}
                disabled={inCorsoEmail || !segnalazione.email}
                title={segnalazione.email ? "Invia da commerciale@donewifi.it" : "Il cliente non ha un'email registrata"}
                className="flex min-h-11 items-center gap-2 rounded-lg border bg-background px-2.5 py-3 text-xs font-semibold shadow-sm transition hover:border-primary/40 disabled:opacity-50"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#5b52c9] text-white">
                  {inCorsoEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Mail className="h-3.5 w-3.5" strokeWidth={2.25} />}
                </span>
                {inCorsoEmail ? "Invio..." : "Email"}
              </button>
              <button
                onClick={copiaLink}
                className="flex min-h-11 items-center gap-2 rounded-lg border bg-background px-2.5 py-3 text-xs font-semibold shadow-sm transition hover:border-primary/40"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted-foreground text-background">
                  {copiato ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />}
                </span>
                {copiato ? "Copiato" : "Copia link"}
              </button>
            </div>
            {esitoEmail && <p className="text-xs text-muted-foreground">{esitoEmail}</p>}
          </div>
        )}

        {richiesta && (
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="mb-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Dati ricevuti dal cliente</p>
            {/* ★ NUOVO — con più spazio in un dialog centrale largo, i gruppi si
             * smistano su 4 tab invece di restare tutti impilati: meno scroll, un
             * argomento alla volta. L'ordine delle tab segue quello in cui questi
             * stessi dati vanno ricopiati nel gestionale contratti esterno
             * (service.done.cst98.com/Contratto/cliente.aspx): anagrafica e
             * contatti, poi indirizzo e dati di pagamento (RID), poi documenti —
             * il profilo/apparati scelti non hanno un campo lì, si usano in un
             * passaggio successivo, quindi restano per ultimi invece che per
             * primi. Dentro ogni tab resta comunque etichetta sopra/valore
             * sotto — nessun dato inviato dal cliente si tronca mai. */}
            <div className="mb-3 flex flex-wrap gap-1 border-b">
              {(
                [
                  ["anagrafica", "Anagrafica"],
                  ["indirizzo", "Indirizzo e pagamento"],
                  ["documenti", `Documenti${richiesta.documenti.length > 0 ? ` (${richiesta.documenti.length})` : ""}`],
                  ["piano", "Piano scelto"],
                ] as const
              ).map(([valore, etichetta]) => (
                <button
                  key={valore}
                  type="button"
                  onClick={() => setTab(valore)}
                  className={`-mb-px border-b-2 px-3 py-1.5 text-xs font-bold transition ${
                    tab === valore ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {etichetta}
                </button>
              ))}
            </div>

            {tab === "anagrafica" && (
              <div className="flex flex-col gap-2">
                {gruppiTabAnagrafica.map((gruppo) => (
                  <div key={gruppo.titolo} className="rounded-lg border bg-card p-2.5">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-primary/80">{gruppo.titolo}</p>
                    <div className="flex flex-col gap-2">
                      {gruppo.voci.map((chiave) => (
                        <RigaDatoCliente
                          key={chiave}
                          etichetta={etichettaDettaglio(chiave)}
                          valore={formattaValoreCampo(chiave, campiRicevuti[chiave])}
                          onCopiato={(etichetta) => toast(`Copiato: ${etichetta}`, "successo")}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {altriCampi.length > 0 && (
                  <div className="rounded-lg border bg-card p-2.5">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-primary/80">Altro</p>
                    <div className="flex flex-col gap-2">
                      {altriCampi.map((chiave) => (
                        <RigaDatoCliente
                          key={chiave}
                          etichetta={etichettaDettaglio(chiave)}
                          valore={campiRicevuti[chiave]}
                          onCopiato={(etichetta) => toast(`Copiato: ${etichetta}`, "successo")}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "indirizzo" && (
              <div className="flex flex-col gap-2">
                {indirizzoInstallazione && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-primary/80">Indirizzo di installazione</p>
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(indirizzoInstallazione)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-1.5 text-xs font-semibold break-words text-primary underline-offset-2 hover:underline"
                    >
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                      {indirizzoInstallazione}
                    </a>
                  </div>
                )}

                {gruppiTabPagamento.map((gruppo) => (
                  <div key={gruppo.titolo} className="rounded-lg border bg-card p-2.5">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-primary/80">{gruppo.titolo}</p>
                    <div className="flex flex-col gap-2">
                      {gruppo.voci.map((chiave) => (
                        <RigaDatoCliente
                          key={chiave}
                          etichetta={etichettaDettaglio(chiave)}
                          valore={formattaValoreCampo(chiave, campiRicevuti[chiave])}
                          onCopiato={(etichetta) => toast(`Copiato: ${etichetta}`, "successo")}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "piano" && (
              <div className="flex flex-col gap-2">
                {gruppiTabPiano.map((gruppo) => (
                  <div key={gruppo.titolo} className="rounded-lg border bg-card p-2.5">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-primary/80">{gruppo.titolo}</p>
                    <div className="flex flex-col gap-2">
                      {gruppo.voci.map((chiave) => (
                        <RigaDatoCliente
                          key={chiave}
                          etichetta={etichettaDettaglio(chiave)}
                          valore={formattaValoreCampo(chiave, campiRicevuti[chiave])}
                          onCopiato={(etichetta) => toast(`Copiato: ${etichetta}`, "successo")}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "documenti" && (
              <div className="rounded-lg border bg-card p-2.5">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-primary/80">
                  Tipo Documento: {campiRicevuti.tipoDocumento ? (TIPI_DOCUMENTO[campiRicevuti.tipoDocumento] ?? campiRicevuti.tipoDocumento) : "—"}
                </p>
                {richiesta.documenti.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {richiesta.documenti.map((d, i) => (
                      <Button
                        key={i}
                        variant="outline"
                        className="h-auto min-h-11 w-full justify-start py-3 whitespace-normal"
                        onClick={() => apriDocumento(d.percorso)}
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                        <span className="text-left break-all">{d.tipo ? `${d.tipo} — ${d.nome}` : d.nome}</span>
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Nessun documento caricato.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ★ FIX — il pannello Contratto compariva solo se il cliente aveva già
         * compilato la Richiesta Dati (richiesta) o se un contratto era già
         * stato caricato in passato: una pratica arrivata a "Gestione
         * Cliente" senza che il cliente abbia mai inviato il form restava
         * senza alcun modo di caricare un contratto e sbloccare "Trasmetti"
         * — un vicolo cieco. Basta essere a questo punto del flusso
         * (indiceCorrente >= 2) per poter caricare il contratto. */}
        {indiceCorrente >= 2 && (
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
            Contratto
          </p>
          {/* ★ form reale: il campo file invia se stesso appena scelto
           * (selezionatoFileContratto → requestSubmit()), la Server Action
           * caricaContrattoSegnalazione() viene chiamata da inviaFormContratto()
           * dentro l'attributo action — EtichettaCaricamentoContratto legge lo
           * stato "in corso" con useFormStatus() invece di una prop passata a
           * mano. */}
          <form ref={formContrattoRef} action={inviaFormContratto}>
            {contrattoUrl ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" className="min-h-11" onClick={vediContratto}>
                  <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Vedi contratto
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <label className="cursor-pointer">
                      <input type="file" name="file" accept="application/pdf" onChange={selezionatoFileContratto} className="hidden" />
                      <EtichettaCaricamentoContratto giaCaricato />
                    </label>
                  </TooltipTrigger>
                  <TooltipContent>
                    Sostituendo il contratto, un&apos;eventuale approvazione già data dal cliente viene annullata: andrà richiesta di nuovo.
                  </TooltipContent>
                </Tooltip>
              </div>
            ) : (
              <label className="cursor-pointer">
                <input type="file" name="file" accept="application/pdf" onChange={selezionatoFileContratto} className="hidden" />
                <EtichettaCaricamentoContratto giaCaricato={false} />
              </label>
            )}
          </form>
          {contrattoUrl && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {infoCaricamento
                ? `Caricato da ${infoCaricamento.nome} il ${new Date(infoCaricamento.data).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                : "Caricamento tracciato in Storico Modifiche."}
              {" — "}upload manuale del PDF già firmato, nessuna firma elettronica integrata nel gestionale.
            </p>
          )}
          {erroreContratto && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-critical">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
              {erroreContratto}
            </p>
          )}

          {/* ★ NUOVA — richiesta esplicita: prima di "Trasmetti" il cliente
           * deve approvare davvero il contratto, non basta averlo caricato.
           * Stesso link monouso via email già usato per l'approvazione
           * dell'intervento sui Ticket — un click da quella casella è la
           * prova di data/ora e autenticità richiesta, tracciata anche in
           * Storico Modifiche. */}
          {contrattoUrl && (
            <div className="mt-3 border-t pt-3">
              {segnalazione.contratto_approvato_cliente_il ? (
                <p className="flex items-start gap-1.5 text-xs font-semibold text-success">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                  Contratto approvato dal cliente il{" "}
                  {new Date(segnalazione.contratto_approvato_cliente_il).toLocaleString("it-IT", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  .
                </p>
              ) : segnalazione.contratto_inviato_approvazione_il ? (
                <>
                  <p className="flex items-start gap-1.5 text-xs text-warning">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                    In attesa di approvazione dal cliente — inviato il{" "}
                    {new Date(segnalazione.contratto_inviato_approvazione_il).toLocaleString("it-IT", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    .
                  </p>
                  <button
                    type="button"
                    onClick={inviaApprovazioneContratto}
                    disabled={inCorsoApprovazione}
                    className="mt-1.5 flex items-center gap-1.5 text-xs text-primary underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    {inCorsoApprovazione && <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />}
                    {inCorsoApprovazione ? "Invio in corso…" : "Invia di nuovo al cliente"}
                  </button>
                </>
              ) : (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                  Contratto caricato — usa il pulsante in fondo per inviarlo al cliente da approvare.
                </p>
              )}
              {erroreApprovazione && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-critical">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                  {erroreApprovazione}
                </p>
              )}
            </div>
          )}
        </div>
        )}

        {/* ★ il pulsante "Trasmetti" vero e proprio si è spostato nella
        barra fissa in fondo al popup (vedi sotto, `azione`) — qui resta
        solo la scelta del reparto, visibile un po' prima nel percorso
        così è già impostata quando l'azione si sblocca. */}
        {segnalazione.stato === "Gestione Cliente" && (
          <div className="mt-2 flex items-center gap-1.5">
            <Label htmlFor="repartoTrasmissione" className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Reparto installazione
              <SuggerimentoCampo testo="Il reparto che riceverà il Ticket creato da questa Segnalazione. Di norma Analisi Rete: cambialo solo per un'eccezione." />
            </Label>
            <select
              id="repartoTrasmissione"
              value={repartoTrasmissione}
              onChange={(e) => setRepartoTrasmissione(e.target.value as AreaAccesso)}
              className="h-9 flex-1 rounded-md border bg-background px-2 text-xs"
            >
              {REPARTI.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
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
            {inCorsoElimina ? "Eliminazione in corso…" : "Elimina segnalazione"}
          </button>
        )}
      </div>

      {/* ★ NUOVA — barra fissa in fondo al popup, sempre nello stesso
      punto: una sola azione possibile (quella del passo attuale) invece
      di doverla cercare tra i vari pulsanti sparsi nel pannello. Se non
      c'è nulla da cliccare in questo momento, spiega perché invece di
      restare vuota. Colore brand esplicito (bg-[#CF000A]) con variante
      dark: dedicata (bg-[#E8555F], lo stesso rosso già usato come --primary
      nel tema scuro in globals.css) invece del solo token bg-primary, per
      rispettare alla lettera la palette richiesta pur restando leggibile
      anche a tema scuro. */}
      {(azione || statoInfo) && segnalazione.stato !== "Trasmessa" && (
        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 rounded-t-2xl border-t bg-popover px-4 pt-3 pb-4">
          {azione ? (
            <button
              type="button"
              onClick={azione.onClick}
              disabled={azione.disabilitato}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#CF000A] px-4 text-sm font-bold text-white shadow-lg shadow-[#CF000A]/25 transition hover:bg-[#A30008] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#E8555F] dark:shadow-[#E8555F]/20 dark:hover:bg-[#c94750]"
            >
              {azione.disabilitato ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <azione.icona className="h-4 w-4" strokeWidth={2.25} />}
              {azione.disabilitato ? "Invio in corso…" : azione.testo}
            </button>
          ) : (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
              {statoInfo}
            </p>
          )}
          {indiceCorrente > 0 && (
            <button
              type="button"
              disabled={inCorsoStato}
              onClick={() => cambiaStato(COLONNE[indiceCorrente - 1].stato)}
              className="mt-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
            >
              ← Torna a &ldquo;{COLONNE[indiceCorrente - 1].titolo}&rdquo;
            </button>
          )}
        </div>
      )}
    </>
  );
}

// ★ FIX — etichetta e valore sulla stessa riga (col valore troncato a "…")
// nascondeva dati veri quando il pannello era stretto: un Codice Fiscale
// finiva ridotto a una lettera sola. Ogni dato inviato dal cliente deve
// restare leggibile per intero, quindi etichetta sopra e valore sotto
// (stesso linguaggio dei campi Telefono/Indirizzo già in cima a questo
// pannello) — il valore va a capo se serve, non si taglia mai. Resta
// copiabile con un click (icona che compare solo al passaggio del mouse),
// pensato per chi da qui deve poi ritrasferire questi dati a mano nel
// contratto/altro gestionale.
function RigaDatoCliente({ etichetta, valore, onCopiato }: { etichetta: string; valore: string; onCopiato: (etichetta: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(valore);
        onCopiato(etichetta);
      }}
      className="group flex flex-col items-start gap-0.5 rounded-md px-1.5 py-1 text-left transition hover:bg-background"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{etichetta}</span>
      <span className="flex items-start gap-1.5 text-xs font-medium break-words">
        {valore}
        <Copy className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" strokeWidth={2.25} />
      </span>
    </button>
  );
}

function Campo({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{etichetta}</div>
      <div className="font-medium">{valore}</div>
    </div>
  );
}
