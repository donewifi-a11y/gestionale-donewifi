"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound, X, Copy, Check, Rocket, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cambiaStatoSegnalazione, trasmettiPerInstallazione } from "@/app/(app)/segnalazioni/actions";
import type { RichiestaCliente, Segnalazione, StatoSegnalazione } from "@/lib/types";

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

const CHIAVE_FILTRI = "segnalazioniFiltri";

function giorniAperta(data: string) {
  const ms = Date.now() - new Date(data).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export function SegnalazioniBoard({
  segnalazioni,
  richieste,
  currentUserId,
}: {
  segnalazioni: Segnalazione[];
  richieste: RichiestaCliente[];
  currentUserId: string;
}) {
  const [aperta, setAperta] = useState<Segnalazione | null>(null);
  const [soloMie, setSoloMie] = useState(false);
  const [pronto, setPronto] = useState(false);

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

  const filtrate = useMemo(
    () => segnalazioni.filter((s) => !soloMie || s.operatore_id === currentUserId),
    [segnalazioni, soloMie, currentUserId]
  );

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Button size="sm" variant={soloMie ? "default" : "outline"} onClick={() => setSoloMie((v) => !v)}>
          <UserRound className="h-3.5 w-3.5" strokeWidth={2.5} />
          Solo le mie
        </Button>
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
                    <button
                      key={s.id}
                      onClick={() => setAperta(s)}
                      className="rounded-xl border bg-card p-3 text-left text-sm shadow-sm transition hover:shadow-md hover:border-primary/40"
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
                    </button>
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

  const linkRichiestaDati = useMemo(
    () => (typeof window !== "undefined" ? `${window.location.origin}/richiesta-dati/${segnalazione.id}` : ""),
    [segnalazione.id]
  );

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

  async function trasmetti() {
    if (!confirm(`Trasmettere la segnalazione #${segnalazione.numero} per l'installazione? Verrà creato un Ticket.`)) return;
    setInCorso(true);
    try {
      const ticket = await trasmettiPerInstallazione(segnalazione.id);
      onChiudi();
      router.push(`/tickets?aperto=${ticket.id}`);
    } finally {
      setInCorso(false);
    }
  }

  function copiaLink() {
    navigator.clipboard.writeText(linkRichiestaDati);
    setCopiato(true);
    setTimeout(() => setCopiato(false), 1500);
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
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-muted-foreground hover:border-primary/40"
              }`}
            >
              {c.titolo}
            </button>
          ))}
        </div>

        <Campo etichetta="Telefono" valore={segnalazione.telefono} />
        <Campo etichetta="Email" valore={segnalazione.email || "—"} />
        <Campo etichetta="Note" valore={segnalazione.note || "—"} />

        {segnalazione.stato === "Gestione Cliente" && !richiesta && (
          <div className="rounded-lg border border-dashed p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Invia questo link al cliente per raccogliere i dati necessari al contratto.
            </p>
            <div className="flex gap-2">
              <input readOnly value={linkRichiestaDati} className="h-9 flex-1 rounded-md border bg-background px-2 text-xs" />
              <Button size="sm" variant="outline" onClick={copiaLink}>
                {copiato ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2.5} />}
                {copiato ? "Copiato" : "Copia link"}
              </Button>
            </div>
          </div>
        )}

        {richiesta && (
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Dati ricevuti dal cliente</p>
            <div className="flex flex-col gap-1.5">
              {Object.entries(richiesta.dettagli).map(([chiave, valore]) => (
                <div key={chiave} className="flex justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{chiave}</span>
                  <span className="font-medium">{valore}</span>
                </div>
              ))}
              {richiesta.documenti.length > 0 && (
                <div className="mt-1 text-xs">
                  <span className="text-muted-foreground">Documenti: </span>
                  {richiesta.documenti.map((d) => d.nome).join(", ")}
                </div>
              )}
            </div>
          </div>
        )}

        {segnalazione.stato !== "Trasmessa" && (
          <Button onClick={trasmetti} disabled={inCorso} className="mt-2">
            <Rocket className="h-4 w-4" strokeWidth={2.25} />
            Trasmetti per l&apos;installazione
          </Button>
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