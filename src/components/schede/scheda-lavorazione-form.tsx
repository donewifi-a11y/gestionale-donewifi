"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { FirmaClienteScheda } from "@/components/schede/firma-cliente-scheda";
import { SelettoreMateriali } from "@/components/schede/selettore-materiali";
import { SchedaWizard, type PassoScheda } from "@/components/schede/scheda-wizard";
import { salvaSchedaLavoro, getTipologiaClientePerAppuntamento, type FirmaClienteApprovata } from "@/app/(app)/calendario/actions";
import { leggiBozzaScheda, salvaBozzaScheda, cancellaBozzaScheda } from "@/lib/bozza-scheda";
import { INTERVENTI_RAPIDI, INTERVENTO_RECUPERO_APPARATI, ESITI_INTERVENTO, OPZIONI_INSTALLAZIONE, formattaMac } from "@/lib/types";
import type { MaterialeMagazzino, MaterialeUsato } from "@/lib/types";

interface BozzaLavorazione {
  interventi: string[];
  materiali: MaterialeUsato[];
  esito: string;
  metodoPagamento: "Contanti" | "POS" | "In Fattura" | null;
  note: string;
  // ★ NUOVA (2026-09-10) — solo per l'intervento "Recupero Apparati", vedi
  // sotto.
  apparatoRecuperato: string;
  macRecuperato: string;
}

const campoClass = "mt-1 h-11 w-full rounded-md border bg-background px-3 text-base sm:h-9 sm:text-sm";

/** ★ ex InterventoLoco.html del vecchio gestionale — rapporto di
 * intervento tecnico sul posto: interventi rapidi selezionati, materiali
 * usati, esito, firma cliente. Si apre da Vista Tecnico quando
 * l'appuntamento ha tipo_servizio "Lavorazione tecnica".
 *
 * ★ NUOVA — richiesta esplicita: 4 passi (Interventi → Materiali →
 * Esito/Note → Firma) invece di un unico form lungo, stato controllato
 * per sopravvivere al cambio di passo (vedi scheda-installazione-form.tsx
 * per lo stesso principio). */
export function SchedaLavorazioneForm({
  appuntamentoId,
  catalogoMateriali,
  onSalvato,
  onAnnulla,
}: {
  appuntamentoId: string;
  catalogoMateriali: MaterialeMagazzino[];
  onSalvato: () => void;
  onAnnulla: () => void;
}) {
  const chiaveBozza = `lavorazione:${appuntamentoId}`;
  const bozza = leggiBozzaScheda<BozzaLavorazione>(chiaveBozza);

  const [inCorso, setInCorso] = useState(false);
  const [erroreInvio, setErroreInvio] = useState("");
  const [materiali, setMateriali] = useState<MaterialeUsato[]>(bozza?.materiali ?? []);
  const [interventi, setInterventi] = useState<string[]>(bozza?.interventi ?? []);
  const [esito, setEsito] = useState(bozza?.esito ?? "");
  const [metodoPagamento, setMetodoPagamento] = useState<BozzaLavorazione["metodoPagamento"]>(bozza?.metodoPagamento ?? "Contanti");
  const [note, setNote] = useState(bozza?.note ?? "");
  // ★ NUOVA (2026-09-10, "manca il recupero apparati... l'apparato
  // recuperato e il possibile mac") — visibili solo quando "Recupero
  // Apparati" è tra gli interventi selezionati, vedi passo "Interventi"
  // sotto.
  const [apparatoRecuperato, setApparatoRecuperato] = useState(bozza?.apparatoRecuperato ?? "");
  const [macRecuperato, setMacRecuperato] = useState(bozza?.macRecuperato ?? "");
  const [firmaCliente, setFirmaCliente] = useState<FirmaClienteApprovata | null>(null);
  // ★ NUOVA — il tipo cliente arriva dal Ticket collegato, non più scelto
  // a mano nel selettore materiali (vedi selettore-materiali.tsx).
  const [tipoClienteTicket, setTipoClienteTicket] = useState<"Privato" | "Business" | null>(null);
  useEffect(() => {
    // ★ getTipologiaClientePerAppuntamento() ora porta anche `sottocategoria`
    // (serve solo a Scheda di Installazione, per il Trasferimento — vedi
    // il commento lì) — qui basta ancora `tipoCliente`.
    getTipologiaClientePerAppuntamento(appuntamentoId).then(({ tipoCliente }) => setTipoClienteTicket(tipoCliente));
  }, [appuntamentoId]);

  const recuperoApparati = interventi.includes(INTERVENTO_RECUPERO_APPARATI);

  useEffect(() => {
    salvaBozzaScheda<BozzaLavorazione>(chiaveBozza, { interventi, materiali, esito, metodoPagamento, note, apparatoRecuperato, macRecuperato });
  }, [chiaveBozza, interventi, materiali, esito, metodoPagamento, note, apparatoRecuperato, macRecuperato]);

  function toggleIntervento(nome: string) {
    setInterventi((cur) => (cur.includes(nome) ? cur.filter((i) => i !== nome) : [...cur, nome]));
  }

  async function invia() {
    setErroreInvio("");
    if (!firmaCliente) {
      setErroreInvio("Conferma la firma del cliente (codice email o link di approvazione) prima di salvare.");
      return;
    }
    setInCorso(true);
    // ★ FIX (2026-08-28, bug reale segnalato su pose: "fermo su
    // salvataggio" — vedi il commento gemello in
    // pose/scheda-installazione-domande.tsx) — senza try/catch un errore
    // imprevisto lasciava il pulsante bloccato per sempre.
    try {
      const risultato = await salvaSchedaLavoro(
        appuntamentoId,
        "Lavorazione tecnica",
        {
          esito,
          note,
          metodoPagamentoPosa: metodoPagamento,
          materiali,
          firmaCliente,
          interventiEseguiti: interventi,
          // ★ NUOVA (2026-09-10) — solo se "Recupero Apparati" è tra gli
          // interventi selezionati (recuperoApparati), altrimenti restano
          // vuoti come sempre.
          modelloCpe: recuperoApparati ? apparatoRecuperato : undefined,
          mac: recuperoApparati ? macRecuperato : undefined,
        },
        []
      );
      if (risultato.errore) {
        setErroreInvio(risultato.errore);
        return;
      }
      cancellaBozzaScheda(chiaveBozza);
      onSalvato();
    } catch (err) {
      // ★ FIX (2026-09-02, "di nuovo il problema") — l'errore vero non
      // veniva più scartato in silenzio, vedi il commento gemello in
      // pose/scheda-installazione-domande.tsx.
      console.error("invia() - errore imprevisto durante il salvataggio scheda:", err);
      setErroreInvio("Errore imprevisto durante il salvataggio — ricarica la pagina e riprova.");
    } finally {
      setInCorso(false);
    }
  }

  const passi: PassoScheda[] = [
    {
      titolo: "Interventi",
      valida: () =>
        recuperoApparati && !apparatoRecuperato ? "Seleziona quale apparato è stato recuperato prima di proseguire." : null,
      contenuto: (
        <div>
          <Label>Interventi eseguiti (seleziona)</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {INTERVENTI_RAPIDI.map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleIntervento(i)}
                className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
                  interventi.includes(i) ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-primary/40"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
          {/* ★ NUOVA (2026-09-10, "manca il recupero apparati... l'apparato
          recuperato e il possibile mac") — solo con "Recupero Apparati"
          selezionato: cosa è stato ritirato e, se leggibile, il suo MAC.
          Riusano modello_cpe/mac di SchedaLavoro, finora scritti solo dalla
          Scheda di Installazione — vedi riconciliaAntennaRecuperata()
          (materiali/actions.ts). */}
          {recuperoApparati && (
            <div className="mt-4 space-y-3 rounded-lg border bg-muted/30 p-3">
              <div>
                <Label htmlFor="apparato-recuperato">Apparato recuperato *</Label>
                <select
                  id="apparato-recuperato"
                  value={apparatoRecuperato}
                  onChange={(e) => setApparatoRecuperato(e.target.value)}
                  className={campoClass}
                >
                  <option value="" disabled>-- Seleziona apparato --</option>
                  {OPZIONI_INSTALLAZIONE.cpe.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="mac-recuperato">MAC (se leggibile)</Label>
                <input
                  id="mac-recuperato"
                  type="text"
                  placeholder="AA:BB:CC:DD:EE:FF"
                  value={macRecuperato}
                  onChange={(e) => setMacRecuperato(formattaMac(e.target.value))}
                  className={campoClass}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Facoltativo — anche parziale, se l&apos;etichetta è consumata o illeggibile.
                </p>
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      titolo: "Materiali",
      contenuto: (
        <div>
          <Label>Materiali e consumi</Label>
          <div className="mt-1.5">
            <SelettoreMateriali catalogo={catalogoMateriali} valore={materiali} onChange={setMateriali} tipoClienteIniziale={tipoClienteTicket} />
          </div>
          <Label className="mt-3 block">Metodo di pagamento della posa</Label>
          <div className="mt-1.5 flex overflow-hidden rounded-lg border">
            {(["Contanti", "POS", "In Fattura"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMetodoPagamento(m)}
                className={`flex-1 px-2 py-2.5 text-sm font-semibold transition ${
                  metodoPagamento === m ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      ),
    },
    {
      titolo: "Esito",
      valida: () => (esito ? null : "Seleziona un esito dell'intervento prima di proseguire."),
      contenuto: (
        <>
          <div>
            <Label htmlFor="esito">Esito intervento *</Label>
            <select id="esito" value={esito} onChange={(e) => setEsito(e.target.value)} className={campoClass}>
              <option value="" disabled>-- Seleziona esito --</option>
              {ESITI_INTERVENTO.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="note">Note per la sede centrale</Label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Dettagli tecnici, dati segnale, anomalie riscontrate..."
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        </>
      ),
    },
    {
      titolo: "Firma",
      valida: () => (firmaCliente ? null : "Conferma la firma del cliente (codice email o link di approvazione) prima di proseguire."),
      contenuto: (
        <div>
          <Label>Firma / accettazione cliente</Label>
          <div className="mt-1.5">
            <FirmaClienteScheda riferimento={{ tipo: "appuntamento", id: appuntamentoId }} value={firmaCliente} onChange={setFirmaCliente} />
          </div>
        </div>
      ),
    },
  ];

  return (
    <SchedaWizard
      titolo="Rapporto Intervento in Loco"
      sottotitolo="Interventi eseguiti, materiali, esito e firma."
      passi={passi}
      inCorso={inCorso}
      erroreInvio={erroreInvio}
      testoInvio="Invia rapporto e completa"
      onAnnulla={onAnnulla}
      onInvia={invia}
    />
  );
}
