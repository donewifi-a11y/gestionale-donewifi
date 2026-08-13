"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { FirmaClienteScheda } from "@/components/schede/firma-cliente-scheda";
import { SelettoreMateriali } from "@/components/schede/selettore-materiali";
import { SchedaWizard, type PassoScheda } from "@/components/schede/scheda-wizard";
import { salvaSchedaLavoro, type FirmaClienteApprovata } from "@/app/(app)/calendario/actions";
import { leggiBozzaScheda, salvaBozzaScheda, cancellaBozzaScheda } from "@/lib/bozza-scheda";
import { INTERVENTI_RAPIDI, ESITI_INTERVENTO } from "@/lib/types";
import type { MaterialeMagazzino, MaterialeUsato } from "@/lib/types";

interface BozzaLavorazione {
  interventi: string[];
  materiali: MaterialeUsato[];
  esito: string;
  importo: string;
  note: string;
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
  const [importo, setImporto] = useState(bozza?.importo ?? "");
  const [note, setNote] = useState(bozza?.note ?? "");
  const [firmaCliente, setFirmaCliente] = useState<FirmaClienteApprovata | null>(null);

  useEffect(() => {
    salvaBozzaScheda<BozzaLavorazione>(chiaveBozza, { interventi, materiali, esito, importo, note });
  }, [chiaveBozza, interventi, materiali, esito, importo, note]);

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
    const risultato = await salvaSchedaLavoro(
      appuntamentoId,
      "Lavorazione tecnica",
      {
        esito,
        note,
        importoFatturato: importo,
        materiali,
        firmaCliente,
        interventiEseguiti: interventi,
      },
      []
    );
    setInCorso(false);
    if (risultato.errore) {
      setErroreInvio(risultato.errore);
      return;
    }
    cancellaBozzaScheda(chiaveBozza);
    onSalvato();
  }

  const passi: PassoScheda[] = [
    {
      titolo: "Interventi",
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
        </div>
      ),
    },
    {
      titolo: "Materiali",
      contenuto: (
        <div>
          <Label>Materiali e consumi</Label>
          <div className="mt-1.5">
            <SelettoreMateriali catalogo={catalogoMateriali} valore={materiali} onChange={setMateriali} />
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
            <Label htmlFor="importo">Importo totale fatturato al cliente (€, facoltativo)</Label>
            <input id="importo" value={importo} onChange={(e) => setImporto(e.target.value)} type="number" min="0" step="0.01" placeholder="Es. 49.00" className={campoClass} />
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
            <FirmaClienteScheda appuntamentoId={appuntamentoId} value={firmaCliente} onChange={setFirmaCliente} />
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
