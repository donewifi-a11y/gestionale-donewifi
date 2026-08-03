"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formattaValuta, ALIQUOTA_IVA } from "@/lib/types";
import type { MaterialeMagazzino, MaterialeUsato } from "@/lib/types";

/** ★ ex tabella materiali di Installazione.html/InterventoLoco.html —
 * stessa UI per entrambe le schede, invece di duplicarla: seleziona un
 * materiale dal catalogo, quantità, un campo dettagli libero (sostituisce
 * i campi dinamici per categoria del vecchio gestionale — MAC/tipologia
 * per le antenne, voltaggio per gli alimentatori — con un solo campo
 * generico invece di una lista di casi speciali da mantenere). */
export function SelettoreMateriali({
  catalogo,
  valore,
  onChange,
}: {
  catalogo: MaterialeMagazzino[];
  valore: MaterialeUsato[];
  onChange: (v: MaterialeUsato[]) => void;
}) {
  const [selezionato, setSelezionato] = useState("");
  const [quantita, setQuantita] = useState("1");
  const [dettagli, setDettagli] = useState("");

  const catalogoAttivo = catalogo.filter((m) => m.attivo);

  function aggiungi() {
    const materiale = catalogoAttivo.find((m) => m.id === selezionato);
    const qta = Number(quantita);
    if (!materiale || !qta || qta <= 0) return;

    onChange([
      ...valore,
      {
        materiale_id: materiale.id,
        nome: materiale.nome,
        quantita: qta,
        unita_misura: materiale.unita_misura,
        prezzo_unitario: materiale.comodato_uso ? 0 : materiale.prezzo_unitario,
        comodato_uso: materiale.comodato_uso,
        dettagli: dettagli.trim() || null,
      },
    ]);
    setSelezionato("");
    setQuantita("1");
    setDettagli("");
  }

  function rimuovi(i: number) {
    onChange(valore.filter((_, idx) => idx !== i));
  }

  const totaleNetto = valore.reduce((s, m) => s + m.prezzo_unitario * m.quantita, 0);
  const totaleLordo = totaleNetto * (1 + ALIQUOTA_IVA);

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={selezionato}
          onChange={(e) => setSelezionato(e.target.value)}
          className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Seleziona materiale...</option>
          {catalogoAttivo.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome} — {m.comodato_uso ? "comodato d'uso" : `€${m.prezzo_unitario.toFixed(2)}/${m.unita_misura}`}
            </option>
          ))}
        </select>
        <input
          type="number"
          min="0"
          step="0.1"
          value={quantita}
          onChange={(e) => setQuantita(e.target.value)}
          placeholder="Qtà"
          className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-24"
        />
      </div>
      <input
        value={dettagli}
        onChange={(e) => setDettagli(e.target.value)}
        placeholder="Dettagli (facoltativo — es. MAC, voltaggio...)"
        className="mt-2 h-9 w-full rounded-md border bg-background px-3 text-sm"
      />
      <Button type="button" size="sm" variant="outline" className="mt-2" onClick={aggiungi} disabled={!selezionato}>
        Aggiungi materiale
      </Button>

      {valore.length > 0 && (
        <div className="mt-3 overflow-hidden rounded-lg border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr className="text-left">
                <th className="p-2 font-semibold">Materiale</th>
                <th className="p-2 text-right font-semibold">Qtà</th>
                <th className="p-2 text-right font-semibold">Importo</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {valore.map((m, i) => (
                <tr key={i} className="border-t">
                  <td className="p-2">
                    {m.nome}
                    {m.comodato_uso && <span className="ml-1 text-[10px] font-bold text-success">COMODATO</span>}
                    {m.dettagli && <div className="text-muted-foreground">{m.dettagli}</div>}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {m.quantita} {m.unita_misura}
                  </td>
                  <td className="p-2 text-right tabular-nums">{formattaValuta(m.prezzo_unitario * m.quantita)}</td>
                  <td className="p-2 text-right">
                    <button type="button" onClick={() => rimuovi(i)} className="text-muted-foreground hover:text-critical">
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end gap-3 border-t bg-muted/30 p-2 text-xs">
            <span>Netto: <b>{formattaValuta(totaleNetto)}</b></span>
            <span>IVA incl.: <b>{formattaValuta(totaleLordo)}</b></span>
          </div>
        </div>
      )}
    </div>
  );
}
