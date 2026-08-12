"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formattaValuta, prezzoPerTipoCliente } from "@/lib/types";
import type { MaterialeMagazzino, MaterialeUsato } from "@/lib/types";

type TipoCliente = "Privato" | "Business";

/** ★ ex tabella materiali di Installazione.html/InterventoLoco.html —
 * stessa UI per entrambe le schede, invece di duplicarla: seleziona un
 * materiale dal catalogo, quantità, un campo dettagli libero (sostituisce
 * i campi dinamici per categoria del vecchio gestionale — MAC/tipologia
 * per le antenne, voltaggio per gli alimentatori — con un solo campo
 * generico invece di una lista di casi speciali da mantenere).
 *
 * ★ prezzi: il catalogo salva sempre il prezzo per un cliente Privato
 * (IVA inclusa) — un cliente Business paga lo stesso importo trattato
 * come imponibile + IVA 22% (prezzoPerTipoCliente(), src/lib/types.ts).
 * Il tipo cliente scelto qui decide quale dei due finisce effettivamente
 * nella riga aggiunta: il prezzo salvato in MaterialeUsato è già quello
 * definitivo, niente ricalcoli IVA da fare dopo. */
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
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>("Privato");

  // ★ FIX — mostrava ogni materiale "attivo", compresi quelli di puro
  // servizio (es. voci di Trasferimento) mai usati in una scheda tecnica:
  // il tecnico doveva scorrere l'intero listino per trovare un cavo. Il
  // catalogo qui è ora ulteriormente ristretto a `mostra_in_schede_lavoro`
  // (curato da Materiali → "In Scheda di lavoro"), indipendente da
  // "attivo" che resta il permesso generale usato anche da Preventivi.
  const catalogoAttivo = catalogo.filter((m) => m.attivo && m.mostra_in_schede_lavoro);

  function aggiungi() {
    const materiale = catalogoAttivo.find((m) => m.id === selezionato);
    const qta = Number(quantita);
    if (!materiale || !qta || qta <= 0) return;

    const prezzo = materiale.comodato_uso ? 0 : prezzoPerTipoCliente(materiale.prezzo_unitario, tipoCliente);

    onChange([
      ...valore,
      {
        materiale_id: materiale.id,
        nome: materiale.nome,
        quantita: qta,
        unita_misura: materiale.unita_misura,
        prezzo_unitario: prezzo,
        comodato_uso: materiale.comodato_uso,
        dettagli: [dettagli.trim() || null, materiale.comodato_uso ? null : tipoCliente].filter(Boolean).join(" · ") || null,
      },
    ]);
    setSelezionato("");
    setQuantita("1");
    setDettagli("");
  }

  function rimuovi(i: number) {
    onChange(valore.filter((_, idx) => idx !== i));
  }

  const totale = valore.reduce((s, m) => s + m.prezzo_unitario * m.quantita, 0);

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Prezzi per:</span>
        <div className="flex overflow-hidden rounded-md border">
          {(["Privato", "Business"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipoCliente(t)}
              className={`px-2.5 py-1 text-xs font-semibold transition ${
                tipoCliente === t ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={selezionato}
          onChange={(e) => setSelezionato(e.target.value)}
          className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Seleziona materiale...</option>
          {catalogoAttivo.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome} — {m.comodato_uso ? "comodato d'uso" : `${formattaValuta(prezzoPerTipoCliente(m.prezzo_unitario, tipoCliente))}/${m.unita_misura}`}
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
          <div className="flex justify-end border-t bg-muted/30 p-2 text-xs">
            <span>Totale: <b>{formattaValuta(totale)}</b></span>
          </div>
        </div>
      )}
    </div>
  );
}
