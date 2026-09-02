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
  ClipboardCheck,
  ClipboardList,
  SkipForward,
  HelpCircle,
  CalendarClock,
  Pencil,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { IndirizzoAutocomplete, type DettagliIndirizzo } from "@/components/condivisi/indirizzo-autocomplete";
import { PulsanteDocumento } from "@/components/condivisi/pulsante-documento";
import { SegnalePulsante, type TonoSegnale } from "@/components/condivisi/segnale-pulsante";
import { IconaCategoria } from "@/components/condivisi/icona-categoria";
import {
  cambiaStatoSegnalazione,
  trasmettiPerInstallazione,
  caricaContrattoSegnalazione,
  urlContratto,
  inviaEmailRichiestaDatiSegnalazione,
  getUltimoCaricamentoContratto,
  eliminaSegnalazione,
  inviaEmailApprovazioneContratto,
  impostaDubbioso,
  rimuoviDubbioso,
  aggiornaDatiSegnalazione,
} from "@/app/(app)/segnalazioni/actions";
import type { RichiestaCliente, Segnalazione, StatoSegnalazione, Copertura } from "@/lib/types";
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
// ★ NUOVA — richiesta esplicita: valori "a rischio refuso" (codici, IBAN...)
// in monospace quando si ricopiano a mano nel gestionale esterno — più
// facile distinguere 0/O, 1/I, cifre allineate, invece del font
// proporzionale usato per un nome o un indirizzo.
const CAMPI_MONOSPAZIATI = new Set([
  "codiceFiscale",
  "cf",
  "codiceFiscaleAzienda",
  "partitaIva",
  "piva",
  "pec",
  "sdi",
  "legaleRappresentanteCf",
  "iban",
  "ibanIntestatarioCf",
  "cap",
]);

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

          // ★ NUOVA (2026-08) — richiesta esplicita: "In Contatto" mescolava
          // lead appena chiamati e clienti indecisi da settimane, nessuna
          // distinzione. Opzione C della proposta con artifact: un
          // raggruppamento visivo (non un nuovo stato) — i "dubbiosi"
          // (impostaDubbioso/rimuoviDubbioso, dal pannello di dettaglio)
          // scendono in una sezione a parte dentro la stessa colonna.
          const soloContatto = col.stato === "In Contatto";
          const daRichiamare = soloContatto ? items.filter((s) => !s.dubbioso_dal) : items;
          const dubbiosi = soloContatto ? items.filter((s) => s.dubbioso_dal) : [];

          function rigaSegnalazione(s: Segnalazione) {
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
            let segnale: { testo: string; tono: TonoSegnale; pulsante?: boolean } | null = null;
            if (s.dubbioso_dal) {
              const oggiOSuperato = s.richiamare_il ? s.richiamare_il <= new Date().toISOString().slice(0, 10) : false;
              segnale = s.richiamare_il
                ? {
                    testo: oggiOSuperato
                      ? `🤔 Richiamalo oggi${s.motivo_dubbio ? ` — ${s.motivo_dubbio}` : ""}`
                      : `🤔 Richiama il ${new Date(s.richiamare_il).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}${s.motivo_dubbio ? ` — ${s.motivo_dubbio}` : ""}`,
                    tono: oggiOSuperato ? "critico" : "avviso",
                  }
                : { testo: `🤔 Dubbioso${s.motivo_dubbio ? ` — ${s.motivo_dubbio}` : ""}`, tono: "avviso" };
            } else if (inAttesaDati && giorniAttesa >= 3) {
              segnale = { testo: `⏳ In attesa dati da ${giorniAttesa}g — sollecita`, tono: giorniAttesa >= 7 ? "critico" : "avviso" };
            } else if (mostraGiorni && giorni >= 2) {
              segnale = { testo: `⏳ Ferma da ${giorni}g — contatta il cliente`, tono: giorni >= 5 ? "critico" : "avviso" };
            } else if (col.stato === "Gestione Cliente" && s.contratto_approvato_cliente_il) {
              // ★ NUOVA (2026-08-28, richiesta esplicita: "la c con tre colori
              // diversi — blu quando documenti arrivati, arancione quando in
              // attesa di approvazione, verde quando approvato") — stesso
              // meccanismo di "Dati ricevuti" sotto, un gradino più avanti:
              // il verde vince su tutto il resto perché è lo stato più
              // avanzato possibile dentro "Gestione Cliente" (il prossimo
              // passo è Trasmetti, non più aspettare nessuno).
              segnale = { testo: "✓ Contratto approvato — pronta da trasmettere", tono: "successo" };
            } else if (col.stato === "Gestione Cliente" && s.contratto_inviato_approvazione_il) {
              const giorniAttesaContratto = giorniAperta(s.contratto_inviato_approvazione_il);
              segnale = {
                testo:
                  giorniAttesaContratto > 0
                    ? `📄 Contratto inviato — in attesa da ${giorniAttesaContratto}g`
                    : "📄 Contratto inviato — in attesa di approvazione",
                tono: "avviso",
              };
            } else if (col.stato === "Gestione Cliente" && s.dati_ricevuti_at) {
              // ★ NUOVA (2026-08) — richiesta esplicita: "un segnale che
              // lampeggia o pulsa sulla carta del cliente quando invia la
              // documentazione" — prima il badge "Dati ricevuti" era statico,
              // identico a tutti gli altri, facile da perdere scorrendo la
              // colonna. `pulsante` aggiunge un'animazione (Tailwind
              // `animate-pulse`) solo qui — si ferma da sola quando la
              // pratica avanza oltre "Gestione Cliente" (il segnale sparisce
              // insieme allo stato che lo genera, niente da "spuntare" a mano).
              segnale = { testo: "✓ Dati ricevuti — pronta per il contratto", tono: "info", pulsante: true };
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
                  <SegnalePulsante testo={segnale.testo} tono={segnale.tono} pulsante={segnale.pulsante} />
                ) : (
                  s.copertura !== "si" && (
                    <Badge variant="outline" className={COLORE_COPERTURA[s.copertura]}>
                      {s.copertura === "no" ? "Copertura no" : "Copertura da verificare"}
                    </Badge>
                  )
                )}
              </div>
            );
          }

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
                {soloContatto && dubbiosi.length > 0 && daRichiamare.length > 0 && (
                  <div className="mb-0.5 flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    <span>Da richiamare</span>
                    <span>{daRichiamare.length}</span>
                  </div>
                )}
                {daRichiamare.map((s) => rigaSegnalazione(s))}

                {soloContatto && dubbiosi.length > 0 && (
                  <>
                    <div className="mt-1.5 mb-0.5 flex items-center justify-between px-1 text-[10px] font-bold uppercase tracking-wide text-warning">
                      <span>🤔 In attesa di decisione</span>
                      <span>{dubbiosi.length}</span>
                    </div>
                    {dubbiosi.map((s) => rigaSegnalazione(s))}
                  </>
                )}
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
  const [inCorsoDubbioso, startDubbioso] = useTransition();
  // ★ NUOVA (2026-08) — "parcheggio" per un cliente indeciso, Opzione C
  // della proposta con artifact: un mini-form (motivo + data di richiamo
  // facoltativa) invece di un semplice interruttore, per capire poi DA
  // BACHECA perché è fermo e quando richiamarlo, senza dover riaprire il
  // pannello ogni volta.
  const [formDubbiosoAperto, setFormDubbiosoAperto] = useState(false);
  const [motivoDubbio, setMotivoDubbio] = useState(segnalazione.motivo_dubbio ?? "");
  const [richiamareIl, setRichiamareIl] = useState(segnalazione.richiamare_il ?? "");
  // ★ NUOVA (2026-08) — richiesta esplicita: "i dati inseriti devono essere
  // tutti editabili... possono nascere errori quando l'operatore prende i
  // dati" — prima non c'era alcun modo di correggere un refuso su nome/
  // telefono/email/indirizzo/copertura/tipologia/note dopo la creazione.
  const [modificaAperta, setModificaAperta] = useState(false);

  const [copiato, setCopiato] = useState(false);
  const [contrattoUrl, setContrattoUrl] = useState(segnalazione.contratto_pdf_url);
  const [erroreContratto, setErroreContratto] = useState("");
  const [infoCaricamento, setInfoCaricamento] = useState<{ nome: string; data: string } | null>(null);
  const [erroreApprovazione, setErroreApprovazione] = useState("");
  const formContrattoRef = useRef<HTMLFormElement>(null);

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
  // ★ NUOVA — richiesta esplicita: quali campi sono già stati ricopiati nel
  // gestionale contratti esterno in questa sessione (segno persistente,
  // non solo un lampeggio al click) + "Modalità guidata" facoltativa (un
  // campo alla volta, in sequenza, invece delle 4 tab normali).
  const [campiCopiati, setCampiCopiati] = useState<Set<string>>(new Set());
  const [modalitaGuidata, setModalitaGuidata] = useState(false);
  const [indiceGuidata, setIndiceGuidata] = useState(0);

  function copiaCampo(chiave: string, etichetta: string, valore: string) {
    navigator.clipboard.writeText(valore);
    setCampiCopiati((cur) => new Set(cur).add(chiave));
    toast(`Copiato: ${etichetta}`, "successo");
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

  function salvaDubbioso() {
    startDubbioso(async () => {
      const risultato = await impostaDubbioso(segnalazione.id, motivoDubbio.trim(), richiamareIl || null);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      onCambiata({ ...segnalazione, dubbioso_dal: new Date().toISOString(), motivo_dubbio: motivoDubbio.trim() || null, richiamare_il: richiamareIl || null });
      setFormDubbiosoAperto(false);
      toast("Segnata come dubbiosa.", "successo");
      router.refresh();
    });
  }

  function toglliDubbioso() {
    startDubbioso(async () => {
      const risultato = await rimuoviDubbioso(segnalazione.id);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      onCambiata({ ...segnalazione, dubbioso_dal: null, motivo_dubbio: null, richiamare_il: null });
      toast("Non è più segnata come dubbiosa.", "successo");
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

  // ★ NUOVA — richiesta esplicita: "Modalità guidata", un campo alla volta
  // invece delle 4 tab — stesso ordine di ricopiatura (anagrafica →
  // indirizzo/pagamento → piano), i Documenti restano esclusi (sono file
  // da aprire, non testo da copiare).
  const elencoGuidata: { chiave: string; etichetta: string; valore: string }[] = [];
  for (const g of [...gruppiTabAnagrafica, ...(altriCampi.length > 0 ? [{ titolo: "Altro", voci: altriCampi }] : [])]) {
    for (const chiave of g.voci) elencoGuidata.push({ chiave, etichetta: etichettaDettaglio(chiave), valore: formattaValoreCampo(chiave, campiRicevuti[chiave]) });
  }
  if (indirizzoInstallazione) elencoGuidata.push({ chiave: "__indirizzo", etichetta: "Indirizzo di installazione", valore: indirizzoInstallazione });
  for (const g of gruppiTabPagamento) {
    for (const chiave of g.voci) elencoGuidata.push({ chiave, etichetta: etichettaDettaglio(chiave), valore: formattaValoreCampo(chiave, campiRicevuti[chiave]) });
  }
  for (const g of gruppiTabPiano) {
    for (const chiave of g.voci) elencoGuidata.push({ chiave, etichetta: etichettaDettaglio(chiave), valore: formattaValoreCampo(chiave, campiRicevuti[chiave]) });
  }

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
    if (!confirm(`Trasmettere la segnalazione #${segnalazione.numero} per l'installazione? Verrà creato un Ticket per Analisi Rete.`)) return;
    startTrasmetti(async () => {
      // ★ FIX — richiesta esplicita: la scelta manuale del reparto (con
      // default già "Analisi Rete") era un passaggio in più da compilare
      // per un caso che nella pratica è sempre lo stesso — tolta del
      // tutto, il Ticket va sempre e automaticamente ad Analisi Rete. Per
      // l'eccezione rara in cui serve un reparto diverso, si riassegna
      // dopo dal dettaglio del Ticket (select "Reparto" già lì, con
      // relativo tooltip che spiega cosa fa).
      const risultato = await trasmettiPerInstallazione(segnalazione.id, "Analisi Rete");
      if (risultato.errore || !risultato.id) {
        toast(risultato.errore || "Errore imprevisto.");
        return;
      }
      // ★ FIX — richiesta esplicita: dopo la trasmissione non si deve più
      // saltare da soli sulla pagina Ticket con il nuovo Ticket già aperto
      // — chi trasmette resta su Segnalazioni (il toast conferma comunque
      // il numero del Ticket appena creato, raggiungibile a mano da lì
      // quando serve davvero).
      toast(`Trasmessa — Ticket #${risultato.numero} creato.`, "successo");
      onChiudi();
      router.refresh();
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
        <div className="flex items-start justify-between gap-2 pr-6">
          <div className="min-w-0">
            <DialogTitle>{segnalazione.nome}</DialogTitle>
            <DialogDescription>
              #{segnalazione.numero} · {segnalazione.via} {segnalazione.civico}, {segnalazione.comune} ({segnalazione.cap})
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={() => setModificaAperta(true)}
            className="flex shrink-0 items-center gap-1 rounded-lg border bg-card px-2 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />
            Modifica dati
          </button>
        </div>
      </DialogHeader>

      <Dialog open={modificaAperta} onOpenChange={setModificaAperta}>
        <DialogContent>
          <FormModificaSegnalazione segnalazione={segnalazione} onSalvato={(s) => { onCambiata(s); setModificaAperta(false); }} onAnnulla={() => setModificaAperta(false)} />
        </DialogContent>
      </Dialog>

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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <IconaCategoria icona={MapPin} categoria="luogo" dimensione="sm" />
              Indirizzo
            </div>
            {/* ★ FIX (2026-08-27, richiesta esplicita: "indirizzo non è
            copiabile ma solo cliccabile") — prima l'unica azione possibile
            era aprire Google Maps; niente modo di copiare il testo per
            incollarlo altrove (es. nel gestionale contratti esterno).
            "Apri in mappa" resta disponibile a parte. */}
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(`${segnalazione.via} ${segnalazione.civico}, ${segnalazione.comune} ${segnalazione.cap}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
            >
              <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.25} />
              Apri in mappa
            </a>
          </div>
          <button
            type="button"
            onClick={() => {
              const testo = `${segnalazione.via} ${segnalazione.civico}, ${segnalazione.comune} (${segnalazione.cap})`;
              navigator.clipboard.writeText(testo);
              toast("Indirizzo copiato.", "successo");
            }}
            className="group mt-0.5 flex w-full items-center gap-1.5 rounded-md py-0.5 text-left font-medium transition hover:bg-muted/50"
          >
            {segnalazione.via} {segnalazione.civico}, {segnalazione.comune} ({segnalazione.cap})
            <Copy className="h-3 w-3 shrink-0 text-muted-foreground opacity-50 transition group-hover:opacity-100" strokeWidth={2.25} />
          </button>
        </div>
        <Campo etichetta="Note" valore={segnalazione.note || "—"} />

        {/* ★ SPOSTATA (2026-08, audit di layout) — "parcheggio" per un
        cliente indeciso (Opzione C, proposta con artifact): visibile solo
        in "In Contatto", l'unico punto del percorso dove ha senso dire
        "l'ho sentito, sta pensandoci" — prima di "Gestione Cliente" (che
        avvia subito la richiesta dati) e dopo "Da Contattare" (non l'hai
        ancora chiamato). Prima compariva PRIMA di Tipologia/Telefono/
        Email/Indirizzo/Note — chi apriva il pannello vedeva prima
        l'indecisione, poi chi fosse il cliente. Ora è qui, dopo i dati di
        contatto: prima l'identità, poi lo stato della trattativa. */}
        {segnalazione.stato === "In Contatto" && (
          <div className="rounded-xl border border-warning/25 bg-warning/5 p-3">
            {segnalazione.dubbioso_dal ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-warning">
                  <HelpCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                  Segnata come dubbiosa
                </div>
                {segnalazione.motivo_dubbio && <p className="text-xs text-muted-foreground">{segnalazione.motivo_dubbio}</p>}
                {segnalazione.richiamare_il && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                    Richiamalo il {new Date(segnalazione.richiamare_il).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </p>
                )}
                <Button size="sm" variant="outline" onClick={toglliDubbioso} disabled={inCorsoDubbioso} className="w-fit">
                  {inCorsoDubbioso ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : null}
                  Non è più dubbioso
                </Button>
              </div>
            ) : formDubbiosoAperto ? (
              <div className="flex flex-col gap-2.5">
                <div>
                  <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Motivo del dubbio</div>
                  <div className="flex flex-wrap gap-1.5">
                    {["Confronta prezzi", "Deve parlarne in famiglia", "Aspetta un altro operatore", "Altro"].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMotivoDubbio(m)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition ${
                          motivoDubbio === m ? "border-warning bg-warning/15 text-warning" : "text-muted-foreground hover:border-warning/40"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="richiamare_il" className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    <IconaCategoria icona={Clock} categoria="tempo" dimensione="sm" />
                    Richiamalo il (facoltativo)
                  </label>
                  <input
                    id="richiamare_il"
                    type="date"
                    value={richiamareIl}
                    onChange={(e) => setRichiamareIl(e.target.value)}
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={salvaDubbioso} disabled={inCorsoDubbioso}>
                    {inCorsoDubbioso ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : null}
                    Salva
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setFormDubbiosoAperto(false)} disabled={inCorsoDubbioso}>
                    Annulla
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setFormDubbiosoAperto(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-warning transition hover:opacity-80"
              >
                <HelpCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                Segna come dubbioso
              </button>
            )}
          </div>
        )}

        {segnalazione.stato === "Gestione Cliente" && !richiesta && (
          <div className="rounded-xl border bg-card p-3 shadow-sm">
            <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <IconaCategoria icona={FileText} categoria="documento" dimensione="sm" />
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
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Dati ricevuti dal cliente</p>
              {/* ★ NUOVA — richiesta esplicita: un campo alla volta in sequenza,
               * invece delle tab, per chi deve ricopiare tutto senza dover
               * scegliere ogni volta dove guardare. Facoltativa: le tab normali
               * restano il modo di default. */}
              <button
                type="button"
                onClick={() => {
                  setModalitaGuidata((v) => !v);
                  setIndiceGuidata(0);
                }}
                className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                  modalitaGuidata ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-primary/40"
                }`}
              >
                <ClipboardCheck className="h-3 w-3" strokeWidth={2.5} />
                Modalità guidata
              </button>
            </div>

            {modalitaGuidata ? (
              <ModalitaGuidataCopia
                elenco={elencoGuidata}
                indice={indiceGuidata}
                onAvanti={setIndiceGuidata}
                onCopia={copiaCampo}
                campiCopiati={campiCopiati}
              />
            ) : (
              <>
                {/* ★ con più spazio in un dialog centrale largo, i gruppi si
                 * smistano su 4 tab invece di restare tutti impilati: meno scroll,
                 * un argomento alla volta. L'ordine delle tab segue quello in cui
                 * questi stessi dati vanno ricopiati nel gestionale contratti
                 * esterno (service.done.cst98.com/Contratto/cliente.aspx):
                 * anagrafica e contatti, poi indirizzo e dati di pagamento (RID),
                 * poi documenti — il profilo/apparati scelti non hanno un campo
                 * lì, si usano in un passaggio successivo, quindi restano per
                 * ultimi invece che per primi. Dentro ogni tab resta comunque
                 * etichetta sopra/valore sotto — nessun dato inviato dal cliente
                 * si tronca mai. */}
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
                  <div key="anagrafica" className="flex flex-col gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
                    {gruppiTabAnagrafica.map((gruppo) => (
                      <GruppoDatiCliente
                        key={gruppo.titolo}
                        titolo={gruppo.titolo}
                        voci={gruppo.voci.map((chiave) => ({ chiave, etichetta: etichettaDettaglio(chiave), valore: formattaValoreCampo(chiave, campiRicevuti[chiave]) }))}
                        campiCopiati={campiCopiati}
                        onCopiaCampo={copiaCampo}
                        onCopiaGruppo={copiaGruppo}
                      />
                    ))}

                    {altriCampi.length > 0 && (
                      <GruppoDatiCliente
                        titolo="Altro"
                        voci={altriCampi.map((chiave) => ({ chiave, etichetta: etichettaDettaglio(chiave), valore: campiRicevuti[chiave] }))}
                        campiCopiati={campiCopiati}
                        onCopiaCampo={copiaCampo}
                        onCopiaGruppo={copiaGruppo}
                      />
                    )}
                  </div>
                )}

                {tab === "indirizzo" && (
                  <div key="indirizzo" className="flex flex-col gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
                    {indirizzoInstallazione && (
                      <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-primary/80">Indirizzo di installazione</p>
                          {/* ★ FIX (2026-08-27, richiesta esplicita: "indirizzo non
                          è copiabile ma solo cliccabile") — prima l'intero
                          indirizzo era solo un link a Google Maps: toccarlo apriva
                          la mappa invece di poterlo copiare, a differenza di ogni
                          altro campo di questo pannello (tutti copiabili con
                          RigaDatoCliente sotto). "Apri in mappa" resta disponibile
                          separatamente, non più come unica azione possibile. */}
                          <a
                            href={`https://maps.google.com/?q=${encodeURIComponent(indirizzoInstallazione)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
                          >
                            <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.25} />
                            Apri in mappa
                          </a>
                        </div>
                        <button
                          type="button"
                          onClick={() => copiaCampo("__indirizzo", "Indirizzo di installazione", indirizzoInstallazione)}
                          className={`group flex w-full items-start gap-1.5 rounded-md py-1 text-left text-xs font-semibold break-words transition hover:bg-background ${
                            campiCopiati.has("__indirizzo") ? "text-success" : "text-primary"
                          }`}
                        >
                          {campiCopiati.has("__indirizzo") && <Check className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2.5} />}
                          {indirizzoInstallazione}
                          <Copy className="mt-0.5 h-3 w-3 shrink-0 opacity-50 transition group-hover:opacity-100" strokeWidth={2.25} />
                        </button>
                      </div>
                    )}

                    {gruppiTabPagamento.map((gruppo) => (
                      <GruppoDatiCliente
                        key={gruppo.titolo}
                        titolo={gruppo.titolo}
                        voci={gruppo.voci.map((chiave) => ({ chiave, etichetta: etichettaDettaglio(chiave), valore: formattaValoreCampo(chiave, campiRicevuti[chiave]) }))}
                        campiCopiati={campiCopiati}
                        onCopiaCampo={copiaCampo}
                        onCopiaGruppo={copiaGruppo}
                      />
                    ))}
                  </div>
                )}

                {tab === "piano" && (
                  <div key="piano" className="flex flex-col gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
                    {gruppiTabPiano.map((gruppo) => (
                      <GruppoDatiCliente
                        key={gruppo.titolo}
                        titolo={gruppo.titolo}
                        voci={gruppo.voci.map((chiave) => ({ chiave, etichetta: etichettaDettaglio(chiave), valore: formattaValoreCampo(chiave, campiRicevuti[chiave]) }))}
                        campiCopiati={campiCopiati}
                        onCopiaCampo={copiaCampo}
                        onCopiaGruppo={copiaGruppo}
                      />
                    ))}
                  </div>
                )}

                {tab === "documenti" && (
                  <div key="documenti" className="rounded-lg border bg-card p-2.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-primary/80">
                      Tipo Documento: {campiRicevuti.tipoDocumento ? (TIPI_DOCUMENTO[campiRicevuti.tipoDocumento] ?? campiRicevuti.tipoDocumento) : "—"}
                    </p>
                    {richiesta.documenti.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {richiesta.documenti.map((d, i) => (
                          <PulsanteDocumento
                            key={i}
                            percorso={d.percorso}
                            nome={d.nome}
                            etichetta={d.tipo ? `${d.tipo} — ${d.nome}` : d.nome}
                            onOttieniUrl={urlContratto}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Nessun documento caricato.</p>
                    )}
                  </div>
                )}
              </>
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
          <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <IconaCategoria icona={FileText} categoria="documento" dimensione="sm" />
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

          {/* ★ RIVISTA (2026-08, audit di layout) — richiesta esplicita:
           * prima di "Trasmetti" il cliente deve approvare davvero il
           * contratto, non basta averlo caricato. Stesso link monouso via
           * email già usato per l'approvazione dell'intervento sui Ticket —
           * un click da quella casella è la prova di data/ora e
           * autenticità richiesta, tracciata anche in Storico Modifiche.
           * Prima erano 3 paragrafi di testo separati (icona/colore scelti
           * uno per uno) per raccontare lo stesso concetto — "a che punto
           * è il contratto" — invece di un segnale unico leggibile a colpo
           * d'occhio, come già fatto ovunque altrove nel gestionale (badge
           * nei kanban). Ora un solo badge colorato, con l'azione "invia di
           * nuovo" incorporata invece che su una riga a parte. */}
          {contrattoUrl && (() => {
            const statoContratto = segnalazione.contratto_approvato_cliente_il
              ? {
                  colore: "bg-success/10 text-success",
                  icona: Check,
                  testo: `Approvato dal cliente il ${new Date(segnalazione.contratto_approvato_cliente_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
                }
              : segnalazione.contratto_inviato_approvazione_il
                ? {
                    colore: "bg-warning/10 text-warning",
                    icona: Clock,
                    testo: `In attesa di approvazione — inviato il ${new Date(segnalazione.contratto_inviato_approvazione_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
                  }
                : {
                    colore: "bg-muted text-muted-foreground",
                    icona: Info,
                    testo: "Caricato — invia per approvazione col pulsante in fondo",
                  };
            return (
              <div className="mt-3 border-t pt-3">
                <div className={`flex flex-wrap items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold ${statoContratto.colore}`}>
                  <statoContratto.icona className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                  <span className="flex-1">{statoContratto.testo}</span>
                  {segnalazione.contratto_inviato_approvazione_il && !segnalazione.contratto_approvato_cliente_il && (
                    <button
                      type="button"
                      onClick={inviaApprovazioneContratto}
                      disabled={inCorsoApprovazione}
                      className="shrink-0 underline-offset-2 hover:underline disabled:opacity-50"
                    >
                      {inCorsoApprovazione ? "Invio…" : "Invia di nuovo"}
                    </button>
                  )}
                </div>
                {erroreApprovazione && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs text-critical">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                    {erroreApprovazione}
                  </p>
                )}
              </div>
            );
          })()}
        </div>
        )}

        {/* ★ NUOVA (2026-08, audit di layout) — separatore sopra "Elimina":
        prima l'unica azione distruttiva del pannello era incastonata tra le
        sezioni "normali" senza nessuna distinzione visiva. Un bordo sopra
        con più spazio segnala "qui inizia una zona diversa", senza
        spostare né cambiare nient'altro. */}
        {isAdmin && (
          <div className="mt-1 border-t pt-3">
          <button
            type="button"
            onClick={elimina}
            disabled={inCorsoElimina}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-critical/30 px-3 py-3 text-xs font-semibold text-critical transition hover:bg-critical/10 disabled:opacity-50"
          >
            {inCorsoElimina ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />}
            {inCorsoElimina ? "Eliminazione in corso…" : "Elimina segnalazione"}
          </button>
          </div>
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
// ★ RIFINITA — richiesta esplicita ("copiare nel migliore dei modi e più
// velocemente"): l'icona di copia era visibile solo al passaggio del
// mouse (invisibile su tablet/touch, dove si lavora spesso in campo/
// ufficio senza mouse) — ora sempre visibile, solo più marcata al hover.
// Valori "a rischio refuso" (codici fiscali, IBAN...) in monospace, per
// distinguere 0/O e cifre allineate quando si ricopiano a mano. `copiato`
// resta segnato (verde) finché il pannello resta aperto, non solo un
// lampeggio al click — utile per sapere a colpo d'occhio cosa manca
// ancora da ricopiare in un'anagrafica lunga.
function RigaDatoCliente({
  chiave,
  etichetta,
  valore,
  copiato,
  onCopia,
}: {
  chiave: string;
  etichetta: string;
  valore: string;
  copiato: boolean;
  onCopia: (chiave: string, etichetta: string, valore: string) => void;
}) {
  const mono = CAMPI_MONOSPAZIATI.has(chiave);
  return (
    <button
      type="button"
      onClick={() => onCopia(chiave, etichetta, valore)}
      className="group flex flex-col items-start gap-0.5 rounded-md px-1.5 py-1 text-left transition hover:bg-background"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{etichetta}</span>
      <span className={`flex items-start gap-1.5 text-xs font-medium break-words ${copiato ? "text-success" : ""} ${mono ? "font-mono" : ""}`}>
        {copiato && <Check className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2.5} />}
        {valore}
        <Copy className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground opacity-40 transition group-hover:opacity-100" strokeWidth={2.25} />
      </span>
    </button>
  );
}

// ★ NUOVA — un gruppo (es. "Anagrafica") con un pulsante "Copia tutto" in
// più, oltre al copia-per-campo già esistente su ogni RigaDatoCliente:
// copia l'intera sezione come blocco "etichetta: valore" (una riga
// ciascuno), utile quando il gestionale esterno accetta un incolla unico
// o per tenerne una copia in una nota — non sostituisce il copia-per-
// campo, si affianca.
function GruppoDatiCliente({
  titolo,
  voci,
  campiCopiati,
  onCopiaCampo,
  onCopiaGruppo,
}: {
  titolo: string;
  voci: { chiave: string; etichetta: string; valore: string }[];
  campiCopiati: Set<string>;
  onCopiaCampo: (chiave: string, etichetta: string, valore: string) => void;
  onCopiaGruppo: (titolo: string, voci: { chiave: string; etichetta: string; valore: string }[]) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-primary/80">{titolo}</p>
        {voci.length > 1 && (
          <button
            type="button"
            onClick={() => onCopiaGruppo(titolo, voci)}
            className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          >
            <ClipboardList className="h-2.5 w-2.5" strokeWidth={2.5} />
            Copia tutto
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {voci.map((v) => (
          <RigaDatoCliente key={v.chiave} chiave={v.chiave} etichetta={v.etichetta} valore={v.valore} copiato={campiCopiati.has(v.chiave)} onCopia={onCopiaCampo} />
        ))}
      </div>
    </div>
  );
}

// ★ NUOVA — "Modalità guidata": un campo alla volta invece delle tab, un
// solo pulsante da premere in sequenza (Copia e vai avanti / Salta) — per
// chi deve ricopiare tanti campi di fila senza voler cercare ogni volta
// quello giusto tra le tab. Facoltativa, richiamabile dal pulsante in
// alto: le tab normali restano il modo di default.
function ModalitaGuidataCopia({
  elenco,
  indice,
  onAvanti,
  onCopia,
  campiCopiati,
}: {
  elenco: { chiave: string; etichetta: string; valore: string }[];
  indice: number;
  onAvanti: (i: number) => void;
  onCopia: (chiave: string, etichetta: string, valore: string) => void;
  campiCopiati: Set<string>;
}) {
  if (elenco.length === 0) {
    return <p className="text-xs text-muted-foreground">Nessun dato da ricopiare.</p>;
  }
  const i = Math.min(indice, elenco.length - 1);
  const campo = elenco[i];
  const mono = CAMPI_MONOSPAZIATI.has(campo.chiave);
  const ultimo = i >= elenco.length - 1;

  function vai(copiaOra: boolean) {
    if (copiaOra) onCopia(campo.chiave, campo.etichetta, campo.valore);
    if (!ultimo) onAvanti(i + 1);
  }

  return (
    <div>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-primary">{i + 1} / {elenco.length}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((i + 1) / elenco.length) * 100}%` }} />
        </div>
      </div>
      <div className="mb-2.5 rounded-xl border-2 border-primary bg-primary/5 p-4 text-center">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{campo.etichetta}</p>
        <p className={`mt-1.5 text-base font-bold break-words ${mono ? "font-mono" : ""}`}>{campo.valore || "—"}</p>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={() => vai(false)} disabled={ultimo && campiCopiati.has(campo.chiave)}>
          <SkipForward className="h-3.5 w-3.5" strokeWidth={2.25} />
          Salta
        </Button>
        <Button type="button" className="flex-1" onClick={() => vai(true)}>
          <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />
          {ultimo ? "Copia" : "Copia e vai avanti"}
        </Button>
      </div>
      {campiCopiati.size > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {elenco.filter((c) => campiCopiati.has(c.chiave)).map((c) => (
            <span key={c.chiave} className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
              <Check className="h-2.5 w-2.5" strokeWidth={2.5} />
              {c.etichetta}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ★ NUOVA (2026-08) — richiesta esplicita: tutti i dati raccolti alla
// creazione della Segnalazione (nome/telefono/email/indirizzo/copertura/
// tipologia/note) tornano modificabili da qui — prima l'unico modo di
// correggere un refuso era eliminare e ricreare la Segnalazione da capo.
// Stesso set di campi/pattern del modulo "Nuova Segnalazione"
// (segnalazioni/nuovo/page.tsx), qui precompilato coi valori esistenti.
function FormModificaSegnalazione({
  segnalazione,
  onSalvato,
  onAnnulla,
}: {
  segnalazione: Segnalazione;
  onSalvato: (s: Segnalazione) => void;
  onAnnulla: () => void;
}) {
  const router = useRouter();
  const [inCorso, startTransizione] = useTransition();
  const [errore, setErrore] = useState("");
  const [tipologiaCliente, setTipologiaCliente] = useState<"Privato" | "Azienda">(
    segnalazione.tipologia_cliente === "Azienda" ? "Azienda" : "Privato"
  );
  const [via, setVia] = useState(segnalazione.via);
  const [comune, setComune] = useState(segnalazione.comune);
  const [cap, setCap] = useState(segnalazione.cap);

  function onSelezionaIndirizzo(d: DettagliIndirizzo) {
    setVia(d.via);
    if (d.comune) setComune(d.comune);
    if (d.cap) setCap(d.cap);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const nome = String(dati.get("nome") || "").trim();
    const telefono = String(dati.get("telefono") || "").trim();
    if (!nome) return setErrore("Il nome è obbligatorio.");
    if (!telefono) return setErrore("Il telefono è obbligatorio.");

    startTransizione(async () => {
      const risultato = await aggiornaDatiSegnalazione(segnalazione.id, {
        nome,
        telefono,
        email: String(dati.get("email") || "").trim(),
        via,
        civico: String(dati.get("civico") || "").trim(),
        comune,
        cap,
        copertura: String(dati.get("copertura") || segnalazione.copertura) as Copertura,
        tipologiaCliente,
        note: String(dati.get("note") || "").trim(),
      });
      if (risultato.errore) {
        setErrore(risultato.errore);
        return;
      }
      onSalvato({
        ...segnalazione,
        nome,
        telefono,
        email: String(dati.get("email") || "").trim() || null,
        via,
        civico: String(dati.get("civico") || "").trim(),
        comune,
        cap,
        copertura: String(dati.get("copertura") || segnalazione.copertura) as Copertura,
        tipologia_cliente: tipologiaCliente,
        note: String(dati.get("note") || "").trim() || null,
      });
      router.refresh();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Modifica dati</DialogTitle>
        <DialogDescription>Correggi qui eventuali errori inseriti alla creazione — nome, contatti, indirizzo, copertura.</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <Label>Tipologia Cliente</Label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipologiaCliente("Privato")}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tipologiaCliente === "Privato" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
            >
              👤 Privato
            </button>
            <button
              type="button"
              onClick={() => setTipologiaCliente("Azienda")}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tipologiaCliente === "Azienda" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
            >
              🏢 Azienda
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="mod-nome">Nome cliente *</Label>
            <Input id="mod-nome" name="nome" defaultValue={segnalazione.nome} autoFocus required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="mod-telefono">Telefono *</Label>
            <Input id="mod-telefono" name="telefono" type="tel" defaultValue={segnalazione.telefono} required className="mt-1" />
          </div>
        </div>

        <div>
          <Label htmlFor="mod-email">Email</Label>
          <Input id="mod-email" name="email" type="email" defaultValue={segnalazione.email ?? ""} className="mt-1" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Label htmlFor="mod-via">Via *</Label>
            <IndirizzoAutocomplete id="mod-via" name="via" value={via} onChange={setVia} onSeleziona={onSelezionaIndirizzo} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="mod-civico">Civico *</Label>
            <Input id="mod-civico" name="civico" defaultValue={segnalazione.civico} required className="mt-1" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="mod-comune">Comune *</Label>
            <Input id="mod-comune" name="comune" value={comune} onChange={(e) => setComune(e.target.value)} required className="mt-1" />
          </div>
          <div>
            <Label htmlFor="mod-cap">CAP *</Label>
            <Input id="mod-cap" name="cap" value={cap} onChange={(e) => setCap(e.target.value)} required className="mt-1" />
          </div>
        </div>

        <div>
          <Label htmlFor="mod-copertura">Copertura</Label>
          <select id="mod-copertura" name="copertura" defaultValue={segnalazione.copertura} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
            <option value="daVerificare">Da verificare</option>
            <option value="si">Sì</option>
            <option value="no">No</option>
          </select>
        </div>

        <div>
          <Label htmlFor="mod-note">Note</Label>
          <Textarea id="mod-note" name="note" rows={3} defaultValue={segnalazione.note ?? ""} className="mt-1" />
        </div>

        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}

        <div className="flex gap-2">
          <Button type="submit" disabled={inCorso} className="flex-1">
            {inCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : null}
            {inCorso ? "Salvataggio…" : "Salva modifiche"}
          </Button>
          <Button type="button" variant="ghost" onClick={onAnnulla} disabled={inCorso}>
            Annulla
          </Button>
        </div>
      </form>
    </>
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
