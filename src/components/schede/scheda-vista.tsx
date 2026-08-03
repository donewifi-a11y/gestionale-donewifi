"use client";

import { useState } from "react";
import { Printer, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { urlDocumentoScheda } from "@/app/(app)/calendario/actions";
import { formattaValuta } from "@/lib/types";
import type { SchedaLavoro } from "@/lib/types";

/** Vista di sola lettura di una Scheda di Installazione o Lavorazione
 * Tecnica già salvata — stessa idea di RapportinoVista (stampabile via
 * browser, niente generazione PDF lato server). */
export function SchedaVista({ scheda }: { scheda: SchedaLavoro }) {
  const [urlFirmaCliente, setUrlFirmaCliente] = useState<string | null>(null);
  const [urlFirmaTecnico, setUrlFirmaTecnico] = useState<string | null>(null);

  async function mostraFirma(percorso: string, setUrl: (u: string) => void) {
    const risultato = await urlDocumentoScheda(percorso);
    if (risultato.url) setUrl(risultato.url);
  }

  async function apriAllegato(percorso: string) {
    const risultato = await urlDocumentoScheda(percorso);
    if (risultato.errore || !risultato.url) {
      alert(risultato.errore || "Errore imprevisto.");
      return;
    }
    window.open(risultato.url, "_blank", "noopener,noreferrer");
  }

  const isInstallazione = scheda.tipo === "Nuova installazione";

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm print:border-none print:shadow-none" id="scheda-stampabile">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Scheda {scheda.tipo}
        </p>
        <Button size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" strokeWidth={2.25} />
          Stampa / Salva PDF
        </Button>
      </div>

      <div className="flex flex-col gap-2.5 text-sm">
        {scheda.esito && <Campo etichetta="Esito" valore={scheda.esito} />}

        {isInstallazione ? (
          <>
            <Campo etichetta="Struttura esterna" valore={`${scheda.supporto || "—"}${scheda.posizione ? ` · ${scheda.posizione}` : ""}`} />
            <Campo etichetta="Cablaggio" valore={`${scheda.tipo_cavo || "—"}${scheda.metri_cavo ? ` · ${scheda.metri_cavo} m` : ""}`} />
            <Campo etichetta="Radio/CPE" valore={`${scheda.modello_cpe || "—"}${scheda.mac ? ` · MAC ${scheda.mac}` : ""}${scheda.bts ? ` · BTS ${scheda.bts}` : ""}`} />
            {(scheda.rssi != null || scheda.snr != null) && (
              <Campo etichetta="Segnale" valore={`RSSI ${scheda.rssi ?? "—"} dBm · SNR ${scheda.snr ?? "—"} dB`} />
            )}
            <Campo etichetta="Rete interna" valore={`${scheda.router || "—"}`} />
            {(scheda.ping_ms != null || scheda.download_mbps != null || scheda.upload_mbps != null) && (
              <Campo etichetta="Collaudo" valore={`Ping ${scheda.ping_ms ?? "—"} ms · Down ${scheda.download_mbps ?? "—"} Mbps · Up ${scheda.upload_mbps ?? "—"} Mbps`} />
            )}
          </>
        ) : (
          scheda.interventi_eseguiti.length > 0 && (
            <Campo etichetta="Interventi eseguiti" valore={scheda.interventi_eseguiti.join(", ")} />
          )
        )}

        {scheda.materiali.length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Materiali usati</div>
            <ul className="mt-1 flex flex-col gap-0.5">
              {scheda.materiali.map((m, i) => (
                <li key={i}>
                  {m.quantita} {m.unita_misura} — {m.nome}
                  {m.comodato_uso ? " (comodato d'uso)" : ` (${formattaValuta(m.prezzo_unitario * m.quantita)})`}
                  {m.dettagli && ` — ${m.dettagli}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {scheda.importo_fatturato != null && <Campo etichetta="Importo fatturato" valore={formattaValuta(scheda.importo_fatturato)} />}
        {scheda.note && <Campo etichetta="Note" valore={scheda.note} />}
        <Campo
          etichetta="Data"
          valore={new Date(scheda.creato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        />

        {scheda.foto.length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Foto</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {scheda.foto.map((f, i) => (
                <Button key={i} size="sm" variant="outline" onClick={() => apriAllegato(f.percorso)}>
                  <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
                  {f.nome}
                </Button>
              ))}
            </div>
          </div>
        )}

        {(scheda.firma_cliente_url || scheda.firma_tecnico_url) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {scheda.firma_cliente_url && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Firma cliente</div>
                {urlFirmaCliente ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urlFirmaCliente} alt="Firma cliente" className="mt-1 h-24 rounded-md border bg-white" />
                ) : (
                  <Button size="sm" variant="outline" className="mt-1 print:hidden" onClick={() => mostraFirma(scheda.firma_cliente_url!, setUrlFirmaCliente)}>
                    Mostra firma
                  </Button>
                )}
              </div>
            )}
            {scheda.firma_tecnico_url && (
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Firma tecnico</div>
                {urlFirmaTecnico ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urlFirmaTecnico} alt="Firma tecnico" className="mt-1 h-24 rounded-md border bg-white" />
                ) : (
                  <Button size="sm" variant="outline" className="mt-1 print:hidden" onClick={() => mostraFirma(scheda.firma_tecnico_url!, setUrlFirmaTecnico)}>
                    Mostra firma
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Campo({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{etichetta}</div>
      <div className="font-medium whitespace-pre-wrap">{valore}</div>
    </div>
  );
}
