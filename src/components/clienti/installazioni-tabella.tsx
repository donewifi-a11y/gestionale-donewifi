"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, FileText, ClipboardList } from "lucide-react";
import { urlContratto } from "@/app/(app)/segnalazioni/actions";
import { useToast } from "@/components/ui/toast";
import { StatoVuoto } from "@/components/ui/stato-vuoto";
import { formattaValuta } from "@/lib/types";
import type { RigaInstallazione } from "@/app/(app)/clienti/actions";

type Filtro = "tutte" | "mese" | "segnale-debole";

// ★ soglia indicativa "segnale debole" — RSSI/SNR sono numeri assoluti
// negativi/positivi con convenzioni diverse a seconda dell'apparato: un
// valore approssimativo per evidenziare i casi da ricontrollare, non una
// certificazione tecnica.
function segnaleDebole(rssi: number | null, snr: number | null): boolean {
  return (rssi != null && rssi <= -75) || (snr != null && snr <= 20);
}

function contaPerGruppo(materiali: RigaInstallazione["materiali"]) {
  const conteggio = { Comodato: 0, Prodotto: 0, Servizio: 0 };
  for (const m of materiali) {
    const gruppo = m.tipo_riga ?? (m.comodato_uso ? "Comodato" : "Prodotto");
    conteggio[gruppo] = (conteggio[gruppo] ?? 0) + 1;
  }
  return conteggio;
}

/** ★ NUOVA — richiesta esplicita: elenco dei clienti installati con i dati
 * della Scheda di lavoro (modello CPE/MAC, segnale, materiali, importo),
 * scelto come tabella (opzione A della proposta via artifact) dentro una
 * nuova tab "Installazioni" in Clienti. */
export function InstallazioniTabella({ installazioni }: { installazioni: RigaInstallazione[] }) {
  const toast = useToast();
  const [ricerca, setRicerca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("tutte");

  const filtrate = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    const oraInizioMese = new Date();
    oraInizioMese.setDate(1);
    oraInizioMese.setHours(0, 0, 0, 0);

    return installazioni.filter((i) => {
      if (testo) {
        const corrisponde =
          i.cliente.toLowerCase().includes(testo) ||
          (i.indirizzo || "").toLowerCase().includes(testo) ||
          (i.mac || "").toLowerCase().includes(testo);
        if (!corrisponde) return false;
      }
      if (filtro === "mese" && new Date(i.completataIl) < oraInizioMese) return false;
      if (filtro === "segnale-debole" && !segnaleDebole(i.rssi, i.snr)) return false;
      return true;
    });
  }, [installazioni, ricerca, filtro]);

  async function vediContratto(percorso: string) {
    const risultato = await urlContratto(percorso);
    if (risultato.errore || !risultato.url) {
      toast(risultato.errore || "Errore imprevisto.");
      return;
    }
    window.open(risultato.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1" style={{ minWidth: 220 }}>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
          <input
            value={ricerca}
            onChange={(e) => setRicerca(e.target.value)}
            placeholder="Cerca cliente, indirizzo, MAC..."
            className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm"
          />
        </div>
        <div className="flex overflow-hidden rounded-lg border">
          {([
            ["tutte", "Tutte"],
            ["mese", "Questo mese"],
            ["segnale-debole", "Segnale debole"],
          ] as [Filtro, string][]).map(([valore, etichetta]) => (
            <button
              key={valore}
              onClick={() => setFiltro(valore)}
              className={`px-3 py-1.5 text-xs font-semibold transition ${filtro === valore ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
            >
              {etichetta}
            </button>
          ))}
        </div>
      </div>

      {filtrate.length === 0 ? (
        <StatoVuoto icona={ClipboardList} titolo="Nessuna installazione trovata." compatto />
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 font-semibold">Cliente</th>
                  <th className="p-3 font-semibold">Data</th>
                  <th className="p-3 font-semibold">Tecnico</th>
                  <th className="p-3 font-semibold">CPE / MAC</th>
                  <th className="p-3 font-semibold">Segnale</th>
                  <th className="p-3 font-semibold">Materiali</th>
                  <th className="p-3 text-right font-semibold">Importo</th>
                  <th className="p-3 font-semibold">Documenti</th>
                </tr>
              </thead>
              <tbody>
                {filtrate.map((i) => {
                  const debole = segnaleDebole(i.rssi, i.snr);
                  const gruppi = contaPerGruppo(i.materiali);
                  return (
                    <tr key={i.schedaId} className="border-t align-top hover:bg-muted/30">
                      <td className="p-3">
                        <div className="font-semibold">{i.cliente}</div>
                        {i.indirizzo && <div className="text-muted-foreground">{i.indirizzo}</div>}
                      </td>
                      <td className="p-3 whitespace-nowrap tabular-nums">
                        {new Date(i.completataIl).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                      </td>
                      <td className="p-3">{i.tecnico || "—"}</td>
                      <td className="p-3 font-mono">
                        {i.modelloCpe || "—"}
                        {i.mac && <div className="text-muted-foreground">{i.mac}</div>}
                      </td>
                      <td className="p-3">
                        {i.rssi == null && i.snr == null ? (
                          "—"
                        ) : (
                          <span className={debole ? "font-semibold text-warning" : "font-semibold text-success"}>
                            {i.rssi != null && `RSSI ${i.rssi}`}
                            {i.rssi != null && i.snr != null && " · "}
                            {i.snr != null && `SNR ${i.snr}`}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {gruppi.Comodato > 0 && (
                            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">{gruppi.Comodato} comodato</span>
                          )}
                          {gruppi.Prodotto > 0 && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{gruppi.Prodotto} prodotti</span>
                          )}
                          {gruppi.Servizio > 0 && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{gruppi.Servizio} servizi</span>
                          )}
                          {gruppi.Comodato === 0 && gruppi.Prodotto === 0 && gruppi.Servizio === 0 && <span className="text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums">
                        {i.importoFatturato != null ? formattaValuta(i.importoFatturato) : "—"}
                        {i.metodoPagamento && <div className="text-[10px] font-normal text-muted-foreground">{i.metodoPagamento}</div>}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          {i.contrattoUrl ? (
                            <button onClick={() => vediContratto(i.contrattoUrl!)} className="flex items-center gap-1 text-left font-semibold text-primary hover:underline">
                              <FileText className="h-3 w-3 shrink-0" strokeWidth={2.5} />
                              Contratto
                            </button>
                          ) : (
                            <span className="text-muted-foreground">Nessun contratto</span>
                          )}
                          <Link href={`/tickets?aperto=${i.ticketId}`} className="flex items-center gap-1 font-semibold text-primary hover:underline">
                            <ClipboardList className="h-3 w-3 shrink-0" strokeWidth={2.5} />
                            Scheda
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
