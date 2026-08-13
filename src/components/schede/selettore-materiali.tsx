"use client";

import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SuggerimentoCampo } from "@/components/ui/suggerimento-campo";
import { formattaValuta, prezzoPerTipoCliente } from "@/lib/types";
import type { MaterialeMagazzino, MaterialeUsato } from "@/lib/types";

type TipoCliente = "Privato" | "Business";
type TipoRiga = "Comodato" | "Prodotto" | "Servizio";

const GRUPPI: { chiave: TipoRiga; titolo: string; sottotitolo: string; classeHead: string; classeTitolo: string }[] = [
  {
    chiave: "Comodato",
    titolo: "🟢 Apparati in comodato d'uso",
    sottotitolo: "Installati, non fatturati.",
    classeHead: "bg-success/10",
    classeTitolo: "text-success",
  },
  { chiave: "Prodotto", titolo: "📦 Prodotti venduti", sottotitolo: "", classeHead: "bg-muted/50", classeTitolo: "" },
  { chiave: "Servizio", titolo: "🛠️ Servizi", sottotitolo: "", classeHead: "bg-muted/50", classeTitolo: "" },
];

/** ★ RISCRITTA (2026-08) — richiesta esplicita: il vecchio elenco unico
 * mescolava apparati in comodato d'uso (CPE, alimentatore...) con
 * prodotti e servizi a pagamento, ed era il tecnico a decidere ogni
 * volta cosa fosse cosa. Ora la classificazione (Comodato/Prodotto/
 * Servizio) è una proprietà del catalogo Materiali — vedi `tipo_riga`,
 * migrazione 0055 — non più una scelta ripetuta qui: tre gruppi fissi,
 * ognuno con il proprio elenco filtrato dal catalogo.
 *
 * ★ il tipo cliente arriva già impostato dal Ticket (tipoClienteIniziale,
 * null finché non è stato letto — vedi getTipologiaClientePerAppuntamento
 * in calendario/actions.ts), non più un interruttore scollegato dai dati
 * reali: resta comunque modificabile qui, per i casi in cui il dato sul
 * Ticket sia sbagliato o mancante.
 *
 * ★ una riga di catalogo marcata `attivazione_predefinita` per questo
 * tipo cliente si aggiunge da sola una volta sola, con il prezzo preso
 * così com'è (mai passato per prezzoPerTipoCliente() — altrimenti l'IVA
 * rischierebbe di essere applicata due volte su un prezzo già finale,
 * bug reale trovato nell'analisi che ha preceduto questa riscrittura). */
export function SelettoreMateriali({
  catalogo,
  valore,
  onChange,
  tipoClienteIniziale,
}: {
  catalogo: MaterialeMagazzino[];
  valore: MaterialeUsato[];
  onChange: (v: MaterialeUsato[]) => void;
  tipoClienteIniziale: TipoCliente | null;
}) {
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>(tipoClienteIniziale ?? "Privato");
  const sincronizzato = useRef(false);

  // ★ applica il tipo cliente del Ticket e aggiunge l'attivazione
  // predefinita, ma una sola volta: dopo, l'interruttore sotto resta
  // sotto il pieno controllo del tecnico (nessuna sovrascrittura mentre
  // sta già lavorando sull'elenco).
  useEffect(() => {
    if (!tipoClienteIniziale || sincronizzato.current) return;
    sincronizzato.current = true;
    setTipoCliente(tipoClienteIniziale);

    const rigaAttivazione = catalogo.find((m) => m.attivazione_predefinita === tipoClienteIniziale);
    if (rigaAttivazione && !valore.some((v) => v.materiale_id === rigaAttivazione.id)) {
      onChange([
        ...valore,
        {
          materiale_id: rigaAttivazione.id,
          nome: rigaAttivazione.nome,
          quantita: 1,
          unita_misura: rigaAttivazione.unita_misura,
          prezzo_unitario: rigaAttivazione.prezzo_unitario,
          comodato_uso: false,
          tipo_riga: "Servizio",
          automatico: true,
          dettagli: null,
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoClienteIniziale, catalogo]);

  // ★ FIX — mostrava ogni materiale "attivo", compresi quelli di puro
  // servizio (es. voci di Trasferimento) mai usati in una scheda tecnica:
  // il tecnico doveva scorrere l'intero listino per trovare un cavo. Il
  // catalogo qui è ora ulteriormente ristretto a `mostra_in_schede_lavoro`
  // (curato da Materiali → "In Scheda di lavoro"), indipendente da
  // "attivo" che resta il permesso generale usato anche da Preventivi.
  const catalogoAttivo = catalogo.filter((m) => m.attivo && m.mostra_in_schede_lavoro);

  function prezzoRiga(materiale: MaterialeMagazzino): number {
    if (materiale.tipo_riga === "Comodato") return 0;
    if (materiale.attivazione_predefinita) return materiale.prezzo_unitario; // prezzo già finale, non ricalcolare
    return prezzoPerTipoCliente(materiale.prezzo_unitario, tipoCliente);
  }

  function aggiungi(materiale: MaterialeMagazzino, quantita: number, dettagli: string) {
    onChange([
      ...valore,
      {
        materiale_id: materiale.id,
        nome: materiale.nome,
        quantita,
        unita_misura: materiale.unita_misura,
        prezzo_unitario: prezzoRiga(materiale),
        comodato_uso: materiale.tipo_riga === "Comodato",
        tipo_riga: materiale.tipo_riga,
        dettagli: dettagli.trim() || null,
      },
    ]);
  }

  function rimuovi(i: number) {
    onChange(valore.filter((_, idx) => idx !== i));
  }

  const totale = valore.reduce((s, m) => s + m.prezzo_unitario * m.quantita, 0);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          Cliente <SuggerimentoCampo testo="Precompilato dal Ticket — cambialo se il dato non è corretto. Decide il prezzo Prodotti/Servizi e quale attivazione si aggiunge da sola." />
        </span>
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

      {GRUPPI.map((gruppo) => (
        <GruppoMateriali
          key={gruppo.chiave}
          gruppo={gruppo}
          catalogo={catalogoAttivo.filter((m) => m.tipo_riga === gruppo.chiave)}
          righe={valore}
          onAggiungi={aggiungi}
          onRimuovi={rimuovi}
          prezzoRiga={prezzoRiga}
        />
      ))}

      <div className="mt-3 flex items-center justify-between rounded-lg border-2 border-primary/30 bg-primary/5 p-3 text-sm font-bold">
        <span>Totale posa</span>
        <span className="font-mono tabular-nums">{formattaValuta(totale)}</span>
      </div>
    </div>
  );
}

function GruppoMateriali({
  gruppo,
  catalogo,
  righe,
  onAggiungi,
  onRimuovi,
  prezzoRiga,
}: {
  gruppo: (typeof GRUPPI)[number];
  catalogo: MaterialeMagazzino[];
  righe: MaterialeUsato[];
  onAggiungi: (materiale: MaterialeMagazzino, quantita: number, dettagli: string) => void;
  onRimuovi: (indiceGlobale: number) => void;
  prezzoRiga: (m: MaterialeMagazzino) => number;
}) {
  const [selezionato, setSelezionato] = useState("");
  const [quantita, setQuantita] = useState("1");
  const [dettagli, setDettagli] = useState("");

  // ★ indici GLOBALI dell'array valore (non del sottoinsieme filtrato per
  // gruppo): onRimuovi opera sull'array intero passato da SelettoreMateriali.
  const righeGruppo = righe.map((r, i) => ({ r, i })).filter(({ r }) => (r.tipo_riga ?? (r.comodato_uso ? "Comodato" : "Prodotto")) === gruppo.chiave);

  function aggiungi() {
    const materiale = catalogo.find((m) => m.id === selezionato);
    const qta = Number(quantita);
    if (!materiale || !qta || qta <= 0) return;
    onAggiungi(materiale, qta, dettagli);
    setSelezionato("");
    setQuantita("1");
    setDettagli("");
  }

  return (
    <div className="mb-3 overflow-hidden rounded-lg border">
      <div className={`px-3 py-2 ${gruppo.classeHead}`}>
        <span className={`text-xs font-bold ${gruppo.classeTitolo}`}>{gruppo.titolo}</span>
        {gruppo.sottotitolo && <span className="ml-1.5 text-[11px] text-muted-foreground">{gruppo.sottotitolo}</span>}
      </div>

      {righeGruppo.length > 0 && (
        <table className="w-full text-xs">
          <tbody>
            {righeGruppo.map(({ r, i }) => (
              <tr key={i} className="border-t">
                <td className="p-2">
                  {r.nome}
                  {r.automatico && <span className="ml-1.5 text-[10px] font-bold text-info">automatico</span>}
                  {r.dettagli && <div className="text-muted-foreground">{r.dettagli}</div>}
                </td>
                <td className="p-2 text-right tabular-nums text-muted-foreground">
                  {r.quantita} {r.unita_misura}
                </td>
                <td className="w-20 p-2 text-right font-mono tabular-nums">{r.prezzo_unitario === 0 ? "—" : formattaValuta(r.prezzo_unitario * r.quantita)}</td>
                <td className="w-8 p-2 text-right">
                  <button type="button" onClick={() => onRimuovi(i)} className="text-muted-foreground hover:text-critical">
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex flex-col gap-1.5 border-t bg-background p-2 sm:flex-row">
        <select value={selezionato} onChange={(e) => setSelezionato(e.target.value)} className="h-8 flex-1 rounded-md border bg-background px-2 text-xs">
          <option value="">Aggiungi...</option>
          {catalogo.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome} {m.tipo_riga !== "Comodato" && `— ${formattaValuta(prezzoRiga(m))}/${m.unita_misura}`}
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
          className="h-8 w-full rounded-md border bg-background px-2 text-xs sm:w-16"
        />
        <input
          value={dettagli}
          onChange={(e) => setDettagli(e.target.value)}
          placeholder="Dettagli (facoltativo)"
          className="h-8 w-full rounded-md border bg-background px-2 text-xs sm:w-32"
        />
        <Button type="button" size="sm" variant="outline" className="h-8 shrink-0" onClick={aggiungi} disabled={!selezionato}>
          Aggiungi
        </Button>
      </div>
      {catalogo.length === 0 && righeGruppo.length === 0 && (
        <p className="border-t p-2 text-center text-[11px] text-muted-foreground">Nessuna voce in questo gruppo nel catalogo Materiali.</p>
      )}
    </div>
  );
}
