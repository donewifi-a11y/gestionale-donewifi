"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Plus, Trash2, Search, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { formattaValuta, prezzoPerTipoCliente } from "@/lib/types";
import type { Tariffa, MaterialeMagazzino, RigaPreventivo } from "@/lib/types";
import { creaPreventivo, cercaClientiPerPreventivo, type RisultatoRicercaCliente } from "@/app/(app)/preventivi/actions";

/** ★ NUOVA (2026-10-15) — stesso identico raggruppamento "Materiali" già
 * in uso in materiali-board.tsx → Catalogo, vedi `materialiGruppi` sotto. */
const CATEGORIA_SENZA = "Senza categoria";

/** ★ NUOVA (2026-10-15, richiesta esplicita: "devi mettere nelle schede
 * cliente per fare preventivi") — collegamento preventivo→cliente già
 * funzionante end-to-end (`creaPreventivo()` accetta `clienteEsternoId`,
 * `getPreventiviCollegati()` lo rilegge), ma raggiungibile SOLO cercando a
 * mano il cliente dentro questo form — niente partiva dalla sua scheda.
 * Questo prop precompila esattamente come se l'operatore lo avesse appena
 * cercato e scelto dal widget di ricerca sotto (stesso `clienteCollegato`),
 * nessuna logica duplicata. */
export interface ClientePrecompilato {
  id: number;
  nome: string;
  telefono: string | null;
  email: string | null;
  tipologiaCliente: "Privato" | "Azienda";
}

export function NuovoPreventivoForm({
  tariffe,
  materiali,
  clientePrecompilato,
}: {
  tariffe: Tariffa[];
  materiali: MaterialeMagazzino[];
  clientePrecompilato?: ClientePrecompilato;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tipologiaCliente, setTipologiaCliente] = useState<"Privato" | "Azienda">(clientePrecompilato?.tipologiaCliente ?? "Privato");
  const [clienteNome, setClienteNome] = useState(clientePrecompilato?.nome ?? "");
  const [clienteTelefono, setClienteTelefono] = useState(clientePrecompilato?.telefono ?? "");
  const [clienteEmail, setClienteEmail] = useState(clientePrecompilato?.email ?? "");
  const [segnalazioneId, setSegnalazioneId] = useState<string | null>(null);
  const [clienteEsternoId, setClienteEsternoId] = useState<number | null>(clientePrecompilato?.id ?? null);
  const [note, setNote] = useState("");
  // ★ FIX (2026-10-01, audit completezza funzionale — moduli restanti) —
  // nessun campo di scadenza: un preventivo "Inviato" restava aperto a
  // tempo indeterminato, il cliente poteva approvarlo mesi dopo con
  // prezzi nel frattempo cambiati. Precompilato a 30 giorni (prassi
  // comune per un preventivo) ma modificabile o azzerabile.
  const [validoFinoIl, setValidoFinoIl] = useState(() => {
    const tra30giorni = new Date();
    tra30giorni.setDate(tra30giorni.getDate() + 30);
    return tra30giorni.toISOString().slice(0, 10);
  });
  const [righe, setRighe] = useState<RigaPreventivo[]>([]);
  const [rigaLiberaDescrizione, setRigaLiberaDescrizione] = useState("");
  const [rigaLiberaPrezzo, setRigaLiberaPrezzo] = useState("");
  const [inCorso, startTransizione] = useTransition();
  const [errore, setErrore] = useState("");

  // ★ ricerca cliente esistente (Segnalazioni + Clienti Esterni) — collegarlo
  // qui, invece di scrivere sempre i dati a mano, è quello che fa comparire
  // il preventivo nella sua scheda (vedi getPreventiviCollegati).
  const [ricercaCliente, setRicercaCliente] = useState("");
  const [risultatiRicerca, setRisultatiRicerca] = useState<RisultatoRicercaCliente[]>([]);
  const [clienteCollegato, setClienteCollegato] = useState<RisultatoRicercaCliente | null>(
    clientePrecompilato
      ? {
          tipo: "cliente_esterno",
          id: clientePrecompilato.id,
          nome: clientePrecompilato.nome,
          telefono: clientePrecompilato.telefono,
          email: clientePrecompilato.email,
          tipologiaCliente: clientePrecompilato.tipologiaCliente,
        }
      : null
  );
  const timerRicerca = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRicerca.current) clearTimeout(timerRicerca.current);
    if (ricercaCliente.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- azzera i risultati quando la query torna troppo corta per essere cercata, non derivabile durante il render (dipende dal testo digitato nell'effetto precedente).
      setRisultatiRicerca([]);
      return;
    }
    timerRicerca.current = setTimeout(async () => {
      const risultati = await cercaClientiPerPreventivo(ricercaCliente);
      setRisultatiRicerca(risultati);
    }, 300);
    return () => {
      if (timerRicerca.current) clearTimeout(timerRicerca.current);
    };
  }, [ricercaCliente]);

  function selezionaCliente(r: RisultatoRicercaCliente) {
    setClienteCollegato(r);
    setClienteNome(r.nome);
    setClienteTelefono(r.telefono || "");
    setClienteEmail(r.email || "");
    setTipologiaCliente(r.tipologiaCliente);
    setSegnalazioneId(r.tipo === "segnalazione" ? String(r.id) : null);
    setClienteEsternoId(r.tipo === "cliente_esterno" ? Number(r.id) : null);
    setRicercaCliente("");
    setRisultatiRicerca([]);
  }

  function scollegaCliente() {
    setClienteCollegato(null);
    setSegnalazioneId(null);
    setClienteEsternoId(null);
  }

  const tariffeVisibili = tariffe.filter((t) => t.tipologia_cliente === "Tutti" || t.tipologia_cliente === tipologiaCliente);
  const tipoPrezzo = tipologiaCliente === "Azienda" ? "Business" : "Privato";
  // ★ FIX (2026-10-07, audit d'oro gestionale) — "Aggiungi da catalogo"
  // mostrava TUTTE le tariffe e TUTTI i materiali come una parete di
  // pulsanti senza ricerca: con un catalogo medio-grande, trovare la voce
  // giusta richiedeva di scorrere a vista decine di bottoni uguali. Stesso
  // pattern di ricerca già in uso altrove (Materiali, Antenne).
  const [ricercaCatalogo, setRicercaCatalogo] = useState("");
  const testoRicercaCatalogo = ricercaCatalogo.trim().toLowerCase();
  const tariffeFiltrate = testoRicercaCatalogo ? tariffeVisibili.filter((t) => t.nome.toLowerCase().includes(testoRicercaCatalogo)) : tariffeVisibili;
  const materialiFiltrati = testoRicercaCatalogo ? materiali.filter((m) => m.nome.toLowerCase().includes(testoRicercaCatalogo)) : materiali;
  // ★ NUOVA (2026-10-15, bug reale segnalato con screenshot: "troppo
  // caotico il menu per scegliere i prodotti") — "Materiali" era un'unica
  // parete di pulsanti senza alcun ordine percepibile (canoni/attivazioni,
  // modelli di router, staffe di montaggio, cavi, antenne... tutti
  // mescolati). Raggruppati per `categoria` — stesso identico campo e
  // stesso meccanismo già in uso in Materiali → Catalogo
  // (materiali-board.tsx, CATEGORIA_SENZA incluso), non un criterio nuovo:
  // chi gestisce il catalogo compila già quel campo per altri scopi,
  // riusarlo qui non richiede toccare i dati. Nessun `useMemo` — stesso
  // stile non memoizzato già usato sopra per `tariffeFiltrate`/
  // `materialiFiltrati` in questo stesso componente, il calcolo è
  // leggero quanto quei due filtri.
  const mappaMaterialiGruppi = new Map<string, MaterialeMagazzino[]>();
  for (const m of materialiFiltrati) {
    const chiave = m.categoria || CATEGORIA_SENZA;
    if (!mappaMaterialiGruppi.has(chiave)) mappaMaterialiGruppi.set(chiave, []);
    mappaMaterialiGruppi.get(chiave)!.push(m);
  }
  const materialiGruppi = Array.from(mappaMaterialiGruppi.entries()).sort(([a], [b]) =>
    a === CATEGORIA_SENZA ? 1 : b === CATEGORIA_SENZA ? -1 : a.localeCompare(b)
  );

  // ★ NUOVA (2026-10-15, richiesta esplicita: "quando aggiungo un pezzo
  // vorrei che venisse segnato che viene aggiunto, magari con un popup") —
  // prima l'unico riscontro di un click su una tariffa/materiale era la
  // riga che compariva (silenziosamente) in fondo alla sezione "Voci del
  // preventivo", spesso fuori vista mentre si continua a scegliere dal
  // catalogo. Stesso `toast` già usato nel resto del gestionale per
  // confermare un'azione, non un popup/dialog a sé (coerenza con il resto
  // del form, nessun componente nuovo).
  function aggiungiTariffa(t: Tariffa) {
    if (t.prezzo_mensile == null) return;
    setRighe((r) => [...r, { descrizione: `${t.nome} (canone mensile)`, quantita: 1, prezzoUnitario: t.prezzo_mensile as number }]);
    toast(`"${t.nome}" aggiunto al preventivo.`, "successo");
  }

  function aggiungiMateriale(m: MaterialeMagazzino) {
    setRighe((r) => [...r, { descrizione: m.nome, quantita: 1, prezzoUnitario: prezzoPerTipoCliente(m.prezzo_unitario, tipoPrezzo) }]);
    toast(`"${m.nome}" aggiunto al preventivo.`, "successo");
  }

  function aggiungiRigaLibera() {
    const prezzo = Number(rigaLiberaPrezzo.replace(",", "."));
    if (!rigaLiberaDescrizione.trim() || !Number.isFinite(prezzo)) return;
    setRighe((r) => [...r, { descrizione: rigaLiberaDescrizione.trim(), quantita: 1, prezzoUnitario: prezzo }]);
    toast(`"${rigaLiberaDescrizione.trim()}" aggiunto al preventivo.`, "successo");
    setRigaLiberaDescrizione("");
    setRigaLiberaPrezzo("");
  }

  function aggiornaQuantita(indice: number, quantita: number) {
    setRighe((r) => r.map((riga, i) => (i === indice ? { ...riga, quantita: Math.max(1, quantita) } : riga)));
  }

  function rimuoviRiga(indice: number) {
    setRighe((r) => r.filter((_, i) => i !== indice));
  }

  const totale = useMemo(() => righe.reduce((s, r) => s + r.quantita * r.prezzoUnitario, 0), [righe]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    if (!clienteNome.trim()) return setErrore("Il nome del cliente è obbligatorio.");
    if (righe.length === 0) return setErrore("Aggiungi almeno una voce al preventivo.");

    startTransizione(async () => {
      const risultato = await creaPreventivo({
        clienteNome,
        clienteTelefono,
        clienteEmail,
        tipologiaCliente,
        segnalazioneId,
        clienteEsternoId,
        righe,
        note,
        validoFinoIl: validoFinoIl || null,
      });
      if (risultato.errore) {
        setErrore(risultato.errore);
        return;
      }
      // ★ il ToastProvider è montato in AppShell (sopravvive alla
      // navigazione): il toast resta visibile anche dopo il push alla
      // lista, a differenza di uno stato locale di questo form che
      // sparirebbe con lo smontaggio del componente.
      toast(`Preventivo creato per ${clienteNome}.`, "successo");
      router.push("/preventivi");
    });
  }

  return (
    <div>
      <Link href="/preventivi" className="mb-4 flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
        Preventivi
      </Link>
      <h1 className="font-heading mb-6 text-2xl font-bold tracking-tight">Nuovo Preventivo</h1>

      {/* ★ NUOVA (2026-10-15, richiesta esplicita: "avere il riepilogo sul
      lato destro") — due colonne solo da `lg:` in su: a sinistra cliente +
      catalogo (dove si costruisce il preventivo), a destra un riepilogo
      fisso (`lg:sticky`) con voci/totale/validità/note/pulsanti, sempre a
      vista senza dover scorrere mentre si aggiungono voci. Sotto `lg:`
      (`grid-cols-1`), le due colonne tornano una sotto l'altra nello
      stesso ordine di prima — nessun cambiamento per chi usa il form da
      telefono.
      ★ FIX (2026-10-15, bug reale segnalato con screenshot: "il riepilogo
      dovrebbe essere sticky" — non lo era) — `items-start` faceva sì che
      la cella di griglia della colonna destra fosse alta solo quanto il
      proprio contenuto (il riepilogo, breve), non quanto la colonna
      sinistra (il catalogo, lungo): una volta superata quella poca
      altezza lo sticky si "staccava" subito, molto prima della fine della
      pagina — stesso identico meccanismo già diagnosticato per l'header
      sticky della colonna Ticket. Tolto `items-start`: di default CSS
      Grid stira (`align-items: stretch`) la cella destra all'altezza
      della sinistra, dando allo sticky tutto lo spazio della colonna in
      cui restare agganciato. */}
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-5">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Cliente</p>

          {clienteCollegato ? (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs">
              <span>
                Collegato a: <b>{clienteCollegato.nome}</b> ({clienteCollegato.tipo === "segnalazione" ? "Segnalazione" : "Cliente"})
              </span>
              <button type="button" onClick={scollegaCliente} aria-label="Scollega cliente" title="Scollega cliente" className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
              <input
                value={ricercaCliente}
                onChange={(e) => setRicercaCliente(e.target.value)}
                placeholder="Cerca un cliente/Segnalazione esistente (opzionale)…"
                aria-label="Cerca un cliente o segnalazione esistente"
                className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm"
              />
              {risultatiRicerca.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-lg">
                  {risultatiRicerca.map((r) => (
                    <button
                      key={`${r.tipo}-${r.id}`}
                      type="button"
                      onClick={() => selezionaCliente(r)}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-accent"
                    >
                      <span className="font-semibold">{r.nome}</span>
                      <span className="text-muted-foreground">
                        {r.telefono || "—"} · {r.tipo === "segnalazione" ? "Segnalazione" : "Cliente"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mb-3">
            <Label>Tipologia</Label>
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
            <div className="col-span-2">
              <Label htmlFor="clienteNome">Nome *</Label>
              <Input id="clienteNome" value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} required className="mt-1" />
            </div>
            <div>
              <Label htmlFor="clienteTelefono">Telefono</Label>
              <Input id="clienteTelefono" value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="clienteEmail">Email</Label>
              <Input id="clienteEmail" type="email" value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)} className="mt-1" />
              {/* ★ FIX (2026-10-07, audit d'oro gestionale, seguito) — la
              validazione HTML5 (`type="email"`) scatta solo al submit,
              magari giorni dopo: un'email senza "@" scritta per errore
              restava silenziosa finché non si tentava di inviare il
              preventivo. Avviso immediato mentre si scrive, oltre alla nota
              che già c'era. */}
              {clienteEmail.trim() && !clienteEmail.includes("@") ? (
                <p className="mt-1 text-[11px] text-warning">Non sembra un indirizzo email valido.</p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">Serve per poterlo inviare in approvazione.</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Aggiungi da catalogo</p>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
            <input
              value={ricercaCatalogo}
              onChange={(e) => setRicercaCatalogo(e.target.value)}
              placeholder="Cerca tariffa o materiale..."
              aria-label="Cerca tariffa o materiale"
              className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm"
            />
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Tariffe</p>
              {tariffeFiltrate.length === 0 && <p className="text-xs text-muted-foreground">Nessuna tariffa trovata.</p>}
              <div className="flex flex-wrap gap-1.5">
                {tariffeFiltrate.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => aggiungiTariffa(t)}
                    disabled={t.prezzo_mensile == null}
                    className="rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold shadow-sm transition hover:border-primary/40 disabled:opacity-40"
                  >
                    {t.nome} {t.prezzo_mensile != null && `· ${formattaValuta(t.prezzo_mensile)}/mese`}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Materiali</p>
              {materialiFiltrati.length === 0 && <p className="text-xs text-muted-foreground">Nessun materiale trovato.</p>}
              <div className="flex flex-col gap-2.5">
                {materialiGruppi.map(([categoria, voci]) => (
                  <div key={categoria}>
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">{categoria}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {voci.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => aggiungiMateriale(m)}
                          className="rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold shadow-sm transition hover:border-primary/40"
                        >
                          {m.nome} · {formattaValuta(prezzoPerTipoCliente(m.prezzo_unitario, tipoPrezzo))}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Voce libera</p>
              <div className="flex gap-2">
                <Input
                  value={rigaLiberaDescrizione}
                  onChange={(e) => setRigaLiberaDescrizione(e.target.value)}
                  placeholder="Descrizione"
                  className="flex-1"
                />
                <Input
                  value={rigaLiberaPrezzo}
                  onChange={(e) => setRigaLiberaPrezzo(e.target.value)}
                  placeholder="Prezzo €"
                  inputMode="decimal"
                  className="w-28"
                />
                <Button type="button" variant="outline" onClick={aggiungiRigaLibera}>
                  <Plus className="h-4 w-4" strokeWidth={2.25} />
                </Button>
              </div>
            </div>
          </div>
        </div>
        </div>

        <div className="flex flex-col gap-5 lg:sticky lg:top-6">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          {/* ★ FIX (2026-10-07, audit d'oro gestionale, seguito) — il totale
          era visibile solo in fondo alla lista voci: con un preventivo con
          molte righe, bisognava scorrere fino in fondo per vederlo dopo
          ogni aggiunta dal catalogo sopra. Ora anche qui, accanto al
          titolo della sezione — niente barra fissa (rischiava di
          sovrapporsi alla sidebar), solo visibile senza dover scorrere. */}
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Voci del preventivo</p>
            {righe.length > 0 && <span className="font-mono text-sm font-bold tabular-nums">{formattaValuta(totale)}</span>}
          </div>
          {righe.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ancora nessuna voce — aggiungine dal catalogo sopra.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {righe.map((r, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2 text-sm">
                  <span className="flex-1 break-words">{r.descrizione}</span>
                  <input
                    type="number"
                    min={1}
                    value={r.quantita}
                    onChange={(e) => aggiornaQuantita(i, Number(e.target.value))}
                    className="h-8 w-14 rounded-md border bg-background px-2 text-center text-xs"
                  />
                  <span className="w-20 shrink-0 text-right font-mono text-xs font-semibold tabular-nums">
                    {formattaValuta(r.quantita * r.prezzoUnitario)}
                  </span>
                  <button type="button" onClick={() => rimuoviRiga(i)} className="text-muted-foreground hover:text-critical">
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-2 text-sm font-bold">
                <span>Totale</span>
                <span className="tabular-nums">{formattaValuta(totale)}</span>
              </div>
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="validoFinoIl">Valido fino al (facoltativo)</Label>
          <Input id="validoFinoIl" type="date" value={validoFinoIl} onChange={(e) => setValidoFinoIl(e.target.value)} className="mt-1" />
          <p className="mt-1 text-[11px] text-muted-foreground">Oltre questa data il preventivo risulterà scaduto nella lista e per il cliente.</p>
        </div>

        <div>
          <Label htmlFor="note">Note</Label>
          <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1" />
        </div>

        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}

        <div className="flex justify-end gap-2 pb-6">
          <Link href="/preventivi">
            <Button type="button" variant="ghost">
              Annulla
            </Button>
          </Link>
          <Button type="submit" disabled={inCorso} className="min-h-11">
            {inCorso && <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />}
            {inCorso ? "Creazione in corso…" : "Crea Preventivo"}
          </Button>
        </div>
        </div>
      </form>
    </div>
  );
}
