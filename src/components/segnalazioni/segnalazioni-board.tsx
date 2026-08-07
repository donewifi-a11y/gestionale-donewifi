"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserRound, X, Copy, Check, Rocket, Clock, Search, MessageCircle, Mail, FileText, Upload, AlertTriangle, MapPin, PhoneCall, ArrowRight, Trash2 } from "lucide-react";
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
import {
  cambiaStatoSegnalazione,
  trasmettiPerInstallazione,
  caricaContrattoSegnalazione,
  urlContratto,
  inviaEmailRichiestaDatiSegnalazione,
  getUltimoCaricamentoContratto,
  eliminaSegnalazione,
} from "@/app/(app)/segnalazioni/actions";
import type { AreaAccesso, RichiestaCliente, Segnalazione, StatoSegnalazione } from "@/lib/types";
import { REPARTI } from "@/lib/types";
import { etichettaDettaglio } from "@/lib/etichette-dettagli";
import { useToast } from "@/components/ui/toast";
import { usePersistedState } from "@/lib/use-persisted-state";
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
  { titolo: "Anagrafica", campi: ["codiceFiscale", "ragioneSociale", "partitaIva", "codiceFiscaleAzienda", "pec", "sdi", "legaleRappresentanteNome", "legaleRappresentanteCf"] },
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

  // ★ apre direttamente una segnalazione via ?aperto=<id> — usato dalla
  // ricerca globale.
  useEffect(() => {
    const id = searchParams.get("aperto");
    if (!id) return;
    const trovata = segnalazioni.find((s) => s.id === id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizza con l'URL (?aperto=id), non deriva da props/stato locale: è il caso d'uso "external system" per cui useEffect è corretto.
    if (trovata) setAperta(trovata);
  }, [searchParams, segnalazioni]);

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
                  // ★ FIX — nessun segnale su quanto sta aspettando una
                  // risposta del cliente dopo l'invio della Richiesta
                  // Dati: stesso stile dell'avviso "da Ng" già in uso per
                  // Da Contattare/In Contatto, calcolato però da
                  // documenti_richiesti_at (quando è stato inviato il
                  // link) invece che da s.data (creazione pratica).
                  const inAttesaDati = col.stato === "Gestione Cliente" && !s.dati_ricevuti_at && !!s.documenti_richiesti_at;
                  const giorniAttesa = inAttesaDati ? giorniAperta(s.documenti_richiesti_at as string) : 0;
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
                        {s.comune} · {s.telefono}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant="outline" className={COLORE_COPERTURA[s.copertura]}>
                          {s.copertura === "si" ? "Copertura sì" : s.copertura === "no" ? "Copertura no" : "Da verificare"}
                        </Badge>
                        {mostraGiorni && giorni >= 2 && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              giorni >= 5 ? "bg-critical/10 text-critical" : "bg-warning/10 text-warning"
                            }`}
                          >
                            <Clock className="h-3 w-3" strokeWidth={2.5} />
                            da {giorni}g
                          </span>
                        )}
                        {col.stato === "Gestione Cliente" && s.dati_ricevuti_at && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                            <Check className="h-3 w-3" strokeWidth={2.5} />
                            Dati ricevuti
                          </span>
                        )}
                        {inAttesaDati && giorniAttesa >= 3 && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              giorniAttesa >= 7 ? "bg-critical/10 text-critical" : "bg-warning/10 text-warning"
                            }`}
                          >
                            <Clock className="h-3 w-3" strokeWidth={2.5} />
                            in attesa da {giorniAttesa}g
                          </span>
                        )}
                      </div>
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
            <DettaglioSegnalazione
              key={aperta.id}
              segnalazione={aperta}
              richiesta={richieste.find((r) => r.segnalazione_id === aperta.id) ?? null}
              isAdmin={isAdmin}
              onCambiata={(s) => setAperta(s)}
              onChiudi={() => setAperta(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
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
  const [inCorso, setInCorso] = useState(false);
  const [copiato, setCopiato] = useState(false);
  const [contrattoUrl, setContrattoUrl] = useState(segnalazione.contratto_pdf_url);
  const [caricamentoContratto, setCaricamentoContratto] = useState(false);
  const [erroreContratto, setErroreContratto] = useState("");
  const [infoCaricamento, setInfoCaricamento] = useState<{ nome: string; data: string } | null>(null);
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
  const [inCorsoEmail, setInCorsoEmail] = useState(false);
  const [esitoEmail, setEsitoEmail] = useState("");
  const [tab, setTab] = useState<"anagrafica" | "indirizzo" | "documenti" | "piano">("anagrafica");

  const linkRichiestaDati = useMemo(
    () => (typeof window !== "undefined" ? `${window.location.origin}/richiesta-dati/${segnalazione.id}` : ""),
    [segnalazione.id]
  );
  const primoNome = segnalazione.nome.trim().split(/\s+/)[0];
  const messaggio = `Ciao ${primoNome}, per completare la tua richiesta Done Wifi inserisci qui i tuoi dati: ${linkRichiestaDati}`;
  const telefonoIntl = "39" + segnalazione.telefono.replace(/\D/g, "").replace(/^0?39/, "").replace(/^0/, "");

  async function cambiaStato(nuovo: StatoSegnalazione) {
    setInCorso(true);
    try {
      await cambiaStatoSegnalazione(segnalazione.id, nuovo, segnalazione.stato);
      onCambiata({ ...segnalazione, stato: nuovo });
      router.refresh();
    } finally {
      setInCorso(false);
    }
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
  const puoTrasmettere = mancanti.length === 0;

  async function trasmetti() {
    if (!puoTrasmettere) return;
    if (!confirm(`Trasmettere la segnalazione #${segnalazione.numero} per l'installazione? Verrà creato un Ticket.`)) return;
    setInCorso(true);
    const risultato = await trasmettiPerInstallazione(segnalazione.id, repartoTrasmissione);
    setInCorso(false);
    if (risultato.errore || !risultato.id) {
      toast(risultato.errore || "Errore imprevisto.");
      return;
    }
    onChiudi();
    router.push(`/tickets?aperto=${risultato.id}`);
  }

  // ★ NUOVA — solo un amministratore la vede (pulsante non renderizzato
  // affatto per gli altri, controllo comunque ripetuto lato server in
  // eliminaSegnalazione()): cancellazione vera, non un cambio di stato,
  // pensata per pratiche di prova o duplicate.
  async function elimina() {
    if (!confirm(`Eliminare definitivamente la segnalazione #${segnalazione.numero} — ${segnalazione.nome}? L'operazione non è reversibile.`)) return;
    setInCorso(true);
    const risultato = await eliminaSegnalazione(segnalazione.id);
    setInCorso(false);
    if (risultato.errore) {
      toast(risultato.errore);
      return;
    }
    onChiudi();
    router.refresh();
  }

  async function inviaEmailServer() {
    setInCorsoEmail(true);
    setEsitoEmail("");
    const risultato = await inviaEmailRichiestaDatiSegnalazione(segnalazione.id, window.location.origin);
    setInCorsoEmail(false);
    setEsitoEmail(risultato.errore ? risultato.errore : "Inviata da commerciale@donewifi.it.");
  }

  function copiaLink() {
    navigator.clipboard.writeText(linkRichiestaDati);
    setCopiato(true);
    setTimeout(() => setCopiato(false), 1500);
  }

  async function caricaContratto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErroreContratto("");
    setCaricamentoContratto(true);
    const dati = new FormData();
    dati.set("file", file);
    const risultato = await caricaContrattoSegnalazione(segnalazione.id, dati);
    setCaricamentoContratto(false);
    e.target.value = "";
    if (risultato.errore || !risultato.percorso) {
      setErroreContratto(risultato.errore || "Errore imprevisto.");
      return;
    }
    setContrattoUrl(risultato.percorso);
    onCambiata({ ...segnalazione, contratto_pdf_url: risultato.percorso });
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

  return (
    <>
      <DialogHeader>
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

          {segnalazione.stato === "Da Contattare" && (
            <Button onClick={() => cambiaStato("In Contatto")} disabled={inCorso} className="mt-3 w-full">
              <PhoneCall className="h-4 w-4" strokeWidth={2.25} />
              Ho contattato il cliente
            </Button>
          )}
          {segnalazione.stato === "In Contatto" && (
            <Button onClick={() => cambiaStato("Gestione Cliente")} disabled={inCorso} className="mt-3 w-full">
              <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
              Avvia Gestione Cliente
            </Button>
          )}
          {indiceCorrente > 0 && segnalazione.stato !== "Trasmessa" && (
            <button
              type="button"
              disabled={inCorso}
              onClick={() => cambiaStato(COLONNE[indiceCorrente - 1].stato)}
              className="mt-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
            >
              ← Torna a &ldquo;{COLONNE[indiceCorrente - 1].titolo}&rdquo;
            </button>
          )}
        </div>

        <Campo etichetta="Telefono" valore={segnalazione.telefono} />
        <Campo etichetta="Email" valore={segnalazione.email || "—"} />
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
                className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-xs font-semibold shadow-sm transition hover:border-primary/40"
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
                className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-xs font-semibold shadow-sm transition hover:border-primary/40 disabled:opacity-50"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#5b52c9] text-white">
                  <Mail className="h-3.5 w-3.5" strokeWidth={2.25} />
                </span>
                {inCorsoEmail ? "Invio..." : "Email"}
              </button>
              <button
                onClick={copiaLink}
                className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-xs font-semibold shadow-sm transition hover:border-primary/40"
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
                          onCopiato={(etichetta) => toast(`Copiato: ${etichetta}`)}
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
                          onCopiato={(etichetta) => toast(`Copiato: ${etichetta}`)}
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
                          onCopiato={(etichetta) => toast(`Copiato: ${etichetta}`)}
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
                          onCopiato={(etichetta) => toast(`Copiato: ${etichetta}`)}
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
                        size="sm"
                        variant="outline"
                        className="h-auto w-full justify-start py-1.5 whitespace-normal"
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

        {indiceCorrente >= 2 && (richiesta || contrattoUrl) && (
        <div className="rounded-xl border bg-card p-3 shadow-sm">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
            Contratto
          </p>
          {contrattoUrl ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={vediContratto}>
                <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
                Vedi contratto
              </Button>
              <label className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline">
                Sostituisci
                <input type="file" accept="application/pdf" onChange={caricaContratto} className="hidden" disabled={caricamentoContratto} />
              </label>
            </div>
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground transition hover:border-primary hover:text-primary">
                <Upload className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                {caricamentoContratto ? "Caricamento..." : "Carica il contratto firmato (PDF)"}
                <input type="file" accept="application/pdf" onChange={caricaContratto} className="hidden" disabled={caricamentoContratto} />
              </label>
            </>
          )}
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
        </div>
        )}

        {segnalazione.stato === "Gestione Cliente" && (
          <div className="mt-2">
            <div className="mb-2 flex items-center gap-2">
              <Label htmlFor="repartoTrasmissione" className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Reparto installazione
              </Label>
              <select
                id="repartoTrasmissione"
                value={repartoTrasmissione}
                onChange={(e) => setRepartoTrasmissione(e.target.value as AreaAccesso)}
                className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
              >
                {REPARTI.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <Button onClick={trasmetti} disabled={inCorso || !puoTrasmettere} className="w-full">
              <Rocket className="h-4 w-4" strokeWidth={2.25} />
              Trasmetti per l&apos;installazione
            </Button>
            {!puoTrasmettere && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                Mancano ancora: {mancanti.join(", ")}.
              </p>
            )}
          </div>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={elimina}
            disabled={inCorso}
            className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-critical/30 px-3 py-2 text-xs font-semibold text-critical transition hover:bg-critical/10 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
            Elimina segnalazione
          </button>
        )}
      </div>
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