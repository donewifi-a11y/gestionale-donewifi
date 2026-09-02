"use client";

import { useState } from "react";
import { Printer, FileText, Check, Mail, MapPin, Euro, Calendar, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { urlDocumentoScheda } from "@/app/(app)/calendario/actions";
import { generaTestoScheda } from "@/lib/testo-rapporto";
import { formattaValuta } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { IconaCategoria } from "@/components/condivisi/icona-categoria";
import type { CategoriaIcona } from "@/lib/colore-icone";
import type { SchedaLavoro } from "@/lib/types";

/** Vista di sola lettura di una Scheda di Installazione o Lavorazione
 * Tecnica già salvata — stessa idea di RapportinoVista (stampabile via
 * browser, niente generazione PDF lato server). */
export function SchedaVista({ scheda }: { scheda: SchedaLavoro }) {
  const [urlFirmaCliente, setUrlFirmaCliente] = useState<string | null>(null);
  const [urlFirmaTecnico, setUrlFirmaTecnico] = useState<string | null>(null);
  const toast = useToast();

  async function mostraFirma(percorso: string, setUrl: (u: string) => void) {
    const risultato = await urlDocumentoScheda(percorso);
    if (risultato.url) setUrl(risultato.url);
  }

  async function apriAllegato(percorso: string) {
    const risultato = await urlDocumentoScheda(percorso);
    if (risultato.errore || !risultato.url) {
      toast(risultato.errore || "Errore imprevisto.");
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
        {/* ★ NUOVA (2026-08-26, richiesta esplicita: "i rapporti generassero
        un testo completo") — riepilogo in prosa, ricalcolato dai campi già
        sotto (non salvato a parte): stessa fonte di verità, mai disallineato. */}
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <IconaCategoria icona={FileText} categoria="documento" dimensione="sm" />
            Riepilogo
          </div>
          <p className="mt-1 leading-relaxed">{generaTestoScheda(scheda)}</p>
        </div>
        {scheda.esito && <Campo etichetta="Esito" valore={scheda.esito} />}

        {isInstallazione ? (
          <>
            <Campo etichetta="Struttura esterna" valore={`${scheda.supporto || "—"}${scheda.posizione ? ` · ${scheda.posizione}` : ""}`} />
            {scheda.gps_lat != null && scheda.gps_lng != null && (
              <div>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <IconaCategoria icona={MapPin} categoria="luogo" dimensione="sm" />
                  Posizione GPS
                </div>
                <a
                  href={`https://maps.google.com/?q=${scheda.gps_lat},${scheda.gps_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  {scheda.gps_lat.toFixed(6)}, {scheda.gps_lng.toFixed(6)} — apri in Google Maps
                </a>
              </div>
            )}
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
            {(["Comodato", "Prodotto", "Servizio"] as const).map((gruppo) => {
              // ★ le schede salvate prima di tipo_riga non hanno il campo:
              // trattate come "Prodotto" se non comodato_uso.
              const righe = scheda.materiali.filter((m) => (m.tipo_riga ?? (m.comodato_uso ? "Comodato" : "Prodotto")) === gruppo);
              if (righe.length === 0) return null;
              return (
                <div key={gruppo} className="mt-1">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">
                    {gruppo === "Comodato" ? "Comodato d'uso" : gruppo === "Prodotto" ? "Prodotti" : "Servizi"}
                  </div>
                  <ul className="flex flex-col gap-0.5">
                    {righe.map((m, i) => (
                      <li key={i}>
                        {m.quantita} {m.unita_misura} — {m.nome}
                        {m.comodato_uso ? "" : ` (${formattaValuta(m.prezzo_unitario * m.quantita)})`}
                        {m.automatico && " · automatico"}
                        {m.dettagli && ` — ${m.dettagli}`}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {scheda.importo_fatturato != null && <Campo etichetta="Importo fatturato" valore={formattaValuta(scheda.importo_fatturato)} categoria="denaro" icona={Euro} />}
        {scheda.metodo_pagamento_posa && <Campo etichetta="Metodo di pagamento" valore={scheda.metodo_pagamento_posa} categoria="denaro" icona={Euro} />}
        {scheda.note && <Campo etichetta="Note" valore={scheda.note} categoria="documento" icona={FileText} />}
        <Campo
          etichetta="Data"
          valore={new Date(scheda.creato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          categoria="tempo"
          icona={Calendar}
        />

        {scheda.foto.length > 0 && (
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <IconaCategoria icona={FileText} categoria="documento" dimensione="sm" />
              Foto
            </div>
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

        {(scheda.firma_cliente_url || scheda.firma_cliente_metodo || scheda.firma_tecnico_url) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* ★ NUOVA — le schede vecchie hanno firma_cliente_url (disegno,
             * mostrato come prima); quelle nuove hanno firma_cliente_metodo
             * valorizzato invece — OTP verificato (verde) o link inviato,
             * ancora in attesa di conferma del cliente (giallo). */}
            {scheda.firma_cliente_url ? (
              <div>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <IconaCategoria icona={UserRound} categoria="persona" dimensione="sm" />
                  Firma cliente
                </div>
                {urlFirmaCliente ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urlFirmaCliente} alt="Firma cliente" className="mt-1 h-24 rounded-md border bg-white" />
                ) : (
                  <Button size="sm" variant="outline" className="mt-1 print:hidden" onClick={() => mostraFirma(scheda.firma_cliente_url!, setUrlFirmaCliente)}>
                    Mostra firma
                  </Button>
                )}
              </div>
            ) : scheda.firma_cliente_metodo ? (
              <div>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <IconaCategoria icona={UserRound} categoria="persona" dimensione="sm" />
                  Conferma cliente
                </div>
                {scheda.firma_cliente_verificato_il ? (
                  <p className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-success">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
                    Confermato da {scheda.firma_cliente_email} il{" "}
                    {new Date(scheda.firma_cliente_verificato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    {scheda.firma_cliente_metodo === "otp_email" ? " (codice email)" : " (link email)"}.
                  </p>
                ) : (
                  <p className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-warning">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
                    Link inviato a {scheda.firma_cliente_email} — in attesa che il cliente confermi.
                  </p>
                )}
              </div>
            ) : null}
            {scheda.firma_tecnico_url && (
              <div>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <IconaCategoria icona={UserRound} categoria="persona" dimensione="sm" />
                  Firma tecnico
                </div>
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

function Campo({
  etichetta,
  valore,
  categoria,
  icona: Icona,
}: {
  etichetta: string;
  valore: string;
  // ★ NUOVA (2026-09-01, "metti icone ovunque per uniformare") — facoltativa:
  // Campo è riusato per molti tipi di dato diversi (tecnici, esito,
  // collaudo...) che non corrispondono a nessuno dei 6 di COLORE_ICONA —
  // quelli restano senza icona, invariati; solo dove il tipo è chiaro
  // (Data, Importo, Note) si passano categoria+icona.
  categoria?: CategoriaIcona;
  icona?: LucideIcon;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {categoria && Icona && <IconaCategoria icona={Icona} categoria={categoria} dimensione="sm" />}
        {etichetta}
      </div>
      <div className="font-medium whitespace-pre-wrap">{valore}</div>
    </div>
  );
}
