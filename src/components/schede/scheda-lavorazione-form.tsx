"use client";

import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FirmaPad, type FirmaPadHandle } from "@/components/condivisi/firma-pad";
import { SelettoreMateriali } from "@/components/schede/selettore-materiali";
import { salvaSchedaLavoro } from "@/app/(app)/calendario/actions";
import { INTERVENTI_RAPIDI, ESITI_INTERVENTO } from "@/lib/types";
import type { MaterialeMagazzino, MaterialeUsato } from "@/lib/types";

/** ★ ex InterventoLoco.html del vecchio gestionale — rapporto di
 * intervento tecnico sul posto: interventi rapidi selezionati, materiali
 * usati, esito, firma cliente. Si apre da Vista Tecnico quando
 * l'appuntamento ha tipo_servizio "Lavorazione tecnica". */
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
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [materiali, setMateriali] = useState<MaterialeUsato[]>([]);
  const [interventi, setInterventi] = useState<string[]>([]);
  const firmaRef = useRef<FirmaPadHandle>(null);

  function toggleIntervento(nome: string) {
    setInterventi((cur) => (cur.includes(nome) ? cur.filter((i) => i !== nome) : [...cur, nome]));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const esito = String(dati.get("esito") || "");
    if (!esito) return setErrore("Seleziona un esito dell'intervento prima di inviare.");

    setInCorso(true);
    const risultato = await salvaSchedaLavoro(
      appuntamentoId,
      "Lavorazione tecnica",
      {
        esito,
        note: String(dati.get("note") || ""),
        importoFatturato: String(dati.get("importo") || ""),
        materiali,
        firmaClienteDataUrl: firmaRef.current?.ottieniDataUrl() ?? "",
        interventiEseguiti: interventi,
      },
      []
    );
    setInCorso(false);
    if (risultato.errore) return setErrore(risultato.errore);
    onSalvato();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <Label>Interventi eseguiti (seleziona)</Label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {INTERVENTI_RAPIDI.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleIntervento(i)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                interventi.includes(i) ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:border-primary/40"
              }`}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Materiali e consumi</Label>
        <div className="mt-1.5">
          <SelettoreMateriali catalogo={catalogoMateriali} valore={materiali} onChange={setMateriali} />
        </div>
      </div>

      <div>
        <Label htmlFor="esito">Esito intervento *</Label>
        <select id="esito" name="esito" required defaultValue="" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
          <option value="" disabled>-- Seleziona esito --</option>
          {ESITI_INTERVENTO.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
      </div>

      <div>
        <Label htmlFor="importo">Importo totale fatturato al cliente (€, facoltativo)</Label>
        <input id="importo" name="importo" type="number" min="0" step="0.01" placeholder="Es. 49.00" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" />
      </div>

      <div>
        <Label htmlFor="note">Note per la sede centrale</Label>
        <textarea id="note" name="note" rows={2} placeholder="Dettagli tecnici, dati segnale, anomalie riscontrate..." className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
      </div>

      <div>
        <Label>Firma / accettazione cliente</Label>
        <div className="mt-1">
          <FirmaPad ref={firmaRef} />
        </div>
      </div>

      {errore && (
        <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          {errore}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={inCorso} className="flex-1">
          {inCorso ? "Invio in corso..." : "Invia rapporto e completa"}
        </Button>
        <Button type="button" variant="outline" disabled={inCorso} onClick={onAnnulla}>
          Annulla
        </Button>
      </div>
    </form>
  );
}
