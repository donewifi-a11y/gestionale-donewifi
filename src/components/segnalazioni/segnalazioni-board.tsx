"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UserRound, X, Copy, Check, Rocket, Clock, Search, MessageCircle, Mail, FileText, Upload, AlertTriangle, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  cambiaStatoSegnalazione,
  trasmettiPerInstallazione,
  caricaContrattoSegnalazione,
  urlContratto,
  inviaEmailRichiestaDatiSegnalazione,
} from "@/app/(app)/segnalazioni/actions";
import type { RichiestaCliente, Segnalazione, StatoSegnalazione } from "@/lib/types";
import { etichettaDettaglio } from "@/lib/etichette-dettagli";

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

function giorniAperta(data: string) {
  const ms = Date.now() - new Date(data).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function SegnalazioniBoard({
  segnalazioni,
  richieste,
  currentPersonaId,
}: {
  segnalazioni: Segnalazione[];
  richieste: RichiestaCliente[];
  currentPersonaId: string;
}) {
  const [aperta, setAperta] = useState<Segnalazione | null>(null);
  const [soloMie, setSoloMie] = useState(false);
  const [ricerca, setRicerca] = useState("");
  const [pronto, setPronto] = useState(false);
  const searchParams = useSearchParams();

  // ★ apre direttamente una segnalazione via ?aperto=<id> — usato dalla
  // ricerca globale.
  useEffect(() => {
    const id = searchParams.get("aperto");
    if (!id) return;
    const trovata = segnalazioni.find((s) => s.id === id);
    if (trovata) setAperta(trovata);
  }, [searchParams, segnalazioni]);

  useEffect(() => {
    try {
      setSoloMie(JSON.parse(localStorage.getItem(CHIAVE_FILTRI) || "{}").soloMie ?? false);
    } catch {}
    setPronto(true);
  }, []);
  useEffect(() => {
    if (!pronto) return;
    localStorage.setItem(CHIAVE_FILTRI, JSON.stringify({ soloMie }));
  }, [soloMie, pronto]);

  const filtrate = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    return segnalazioni.filter(
      (s) =>
        (!soloMie || s.operatore_id === currentPersonaId) &&
        (!testo ||
          s.nome.toLowerCase().includes(testo) ||
          s.telefono.includes(testo) ||
          s.comune.toLowerCase().includes(testo) ||
          String(s.numero).includes(testo))
    );
  }, [segnalazioni, soloMie, currentPersonaId, ricerca]);

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
        <Button size="sm" variant={soloMie ? "default" : "outline"} onClick={() => setSoloMie((v) => !v)}>
          <UserRound className="h-3.5 w-3.5" strokeWidth={2.5} />
          Solo le mie
        </Button>
        {(soloMie || ricerca) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSoloMie(false);
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
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Sheet open={!!aperta} onOpenChange={(v) => !v && setAperta(null)}>
        <SheetContent className="sm:max-w-lg">
          {aperta && (
            <DettaglioSegnalazione
              segnalazione={aperta}
              richiesta={richieste.find((r) => r.segnalazione_id === aperta.id) ?? null}
              onCambiata={(s) => setAperta(s)}
              onChiudi={() => setAperta(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DettaglioSegnalazione({
  segnalazione,
  richiesta,
  onCambiata,
  onChiudi,
}: {
  segnalazione: Segnalazione;
  richiesta: RichiestaCliente | null;
  onCambiata: (s: Segnalazione) => void;
  onChiudi: () => void;
}) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [copiato, setCopiato] = useState(false);
  const [contrattoUrl, setContrattoUrl] = useState(segnalazione.contratto_pdf_url);
  const [caricamentoContratto, setCaricamentoContratto] = useState(false);
  const [erroreContratto, setErroreContratto] = useState("");
  const [inCorsoEmail, setInCorsoEmail] = useState(false);
  const [esitoEmail, setEsitoEmail] = useState("");

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

  const mancanti: string[] = [];
  if (!segnalazione.tipologia_cliente || !segnalazione.profilo_internet) mancanti.push("dati del cliente (tipologia/profilo internet)");
  if (!contrattoUrl) mancanti.push("contratto firmato");
  const puoTrasmettere = mancanti.length === 0;

  async function trasmetti() {
    if (!puoTrasmettere) return;
    if (!confirm(`Trasmettere la segnalazione #${segnalazione.numero} per l'installazione? Verrà creato un Ticket.`)) return;
    setInCorso(true);
    const risultato = await trasmettiPerInstallazione(segnalazione.id);
    setInCorso(false);
    if (risultato.errore || !risultato.id) {
      alert(risultato.errore || "Errore imprevisto.");
      return;
    }
    onChiudi();
    router.push(`/tickets?aperto=${risultato.id}`);
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

  async function vediContratto() {
    if (!contrattoUrl) return;
    const risultato = await urlContratto(contrattoUrl);
    if (risultato.errore || !risultato.url) {
      alert(risultato.errore || "Errore imprevisto.");
      return;
    }
    window.open(risultato.url, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{segnalazione.nome}</SheetTitle>
        <SheetDescription>
          #{segnalazione.numero} · {segnalazione.via} {segnalazione.civico}, {segnalazione.comune} ({segnalazione.cap})
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 px-4 pb-4 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {COLONNE.map((c) => (
            <button
              key={c.stato}
              disabled={inCorso}
              onClick={() => cambiaStato(c.stato)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                c.stato === segnalazione.stato
                  ? "border-primary bg-gradient-to-b from-primary to-[color-mix(in_oklch,var(--primary),black_14%)] text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:border-primary/40"
              }`}
            >
              {c.titolo}
            </button>
          ))}
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
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#25b063] text-white">
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
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Dati ricevuti dal cliente</p>
            <div className="flex flex-col gap-1.5">
              {Object.entries(richiesta.dettagli).map(([chiave, valore]) => (
                <div key={chiave} className="flex justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{etichettaDettaglio(chiave)}</span>
                  <span className="font-medium">{valore}</span>
                </div>
              ))}
              {richiesta.documenti.length > 0 && (
                <div className="mt-1 text-xs">
                  <span className="text-muted-foreground">Documenti: </span>
                  {richiesta.documenti.map((d) => (d.tipo ? `${d.tipo} (${d.nome})` : d.nome)).join(", ")}
                </div>
              )}
            </div>
          </div>
        )}

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
          {erroreContratto && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-critical">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
              {erroreContratto}
            </p>
          )}
        </div>

        {segnalazione.stato !== "Trasmessa" && (
          <div className="mt-2">
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
      </div>
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