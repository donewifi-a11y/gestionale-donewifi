"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer, FileText, Check, Mail, MapPin, Euro, Calendar, UserRound, Trash2, Plus, Loader2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { urlDocumentoScheda, eliminaFotoScheda, aggiungiFotoScheda } from "@/app/(app)/calendario/actions";
import { createClient } from "@/lib/supabase/client";
import { comprimiImmagine } from "@/lib/comprimi-immagine";
import { generaTestoScheda } from "@/lib/testo-rapporto";
import { formattaValuta } from "@/lib/types";
import { useToast } from "@/components/ui/toast";
import { IconaCategoria } from "@/components/condivisi/icona-categoria";
import type { SchedaLavoro } from "@/lib/types";

// ★ NUOVA (2026-09-10, "ok va bene" sulla proposta dell'artifact "La
// Scheda, Ripensata") — colore dell'esito per lo stesso principio già in
// uso per lo stato del Ticket: un giudizio (buono/da tenere d'occhio/
// negativo), non una decorazione. "Installazione certificata con
// successo" è l'unico valore possibile per una Nuova installazione
// (SchedaInstallazioneForm lo scrive fisso); per una Lavorazione tecnica
// arriva da ESITI_INTERVENTO (lib/types.ts) — un valore imprevisto ricade
// sul grigio neutro invece di rompere il rendering, stesso principio di
// STILI_STATO in status-badge.tsx.
const COLORE_ESITO: Record<string, string> = {
  "Installazione certificata con successo": "bg-success/10 text-success",
  Risolto: "bg-success/10 text-success",
  Parziale: "bg-warning/10 text-warning",
  "In Attesa": "bg-warning/10 text-warning",
  "Non Risolto": "bg-critical/10 text-critical",
};

/** Vista di sola lettura di una Scheda di Installazione o Lavorazione
 * Tecnica già salvata — stessa idea di RapportinoVista (stampabile via
 * browser, niente generazione PDF lato server).
 *
 * ★ RIDISEGNATA (2026-09-10, "una scheda più bella esteticamente e con i
 * dati che ci servono" — proposta approvata dell'artifact "La Scheda,
 * Ripensata") — da un unico elenco di ~15 etichette in fila a gruppi per
 * argomento (Impianto/Rete e collaudo/Materiali & pagamento/Quando):
 * stessi identici dati, nessuno tolto o aggiunto qui, solo raggruppati.
 * Ogni gruppo compare solo se ha almeno un campo valorizzato — una Scheda
 * di Lavorazione tecnica (niente cablaggio/GPS) non mostra riquadri vuoti. */
export function SchedaVista({ scheda, modificabile = false }: { scheda: SchedaLavoro; modificabile?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [urlFirmaCliente, setUrlFirmaCliente] = useState<string | null>(null);
  const [urlFirmaTecnico, setUrlFirmaTecnico] = useState<string | null>(null);
  // ★ NUOVA (2026-09-10, "avrei bisogno di poter cancellare o modificare
  // le foto anche successivamente") — vedi eliminaFotoScheda/
  // aggiungiFotoScheda (calendario/actions.ts): solo un amministratore
  // (`modificabile`, il controllo vero è comunque server-side).
  const [inCorsoEliminaFoto, setInCorsoEliminaFoto] = useState<string | null>(null);
  const [inCorsoAggiungiFoto, startAggiungiFoto] = useTransition();

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

  function eliminaFoto(percorso: string) {
    if (!confirm("Eliminare questa foto dalla Scheda? L'operazione non è reversibile.")) return;
    setInCorsoEliminaFoto(percorso);
    (async () => {
      const risultato = await eliminaFotoScheda(scheda.id, percorso);
      setInCorsoEliminaFoto(null);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      toast("Foto eliminata.", "successo");
      router.refresh();
    })();
  }

  function aggiungiFoto(file: File | null) {
    if (!file) return;
    startAggiungiFoto(async () => {
      try {
        const fileDaCaricare = await comprimiImmagine(file);
        const rispostaUrl = await fetch("/api/schede/upload-foto-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appuntamentoId: scheda.appuntamento_id, nomeFile: fileDaCaricare.name }),
        });
        const risultatoUrl = await rispostaUrl.json();
        if (!rispostaUrl.ok) throw new Error(risultatoUrl.errore || "Errore preparazione upload.");

        const supabase = createClient();
        const { error: erroreUpload } = await supabase.storage.from("documenti").uploadToSignedUrl(risultatoUrl.percorso, risultatoUrl.token, fileDaCaricare);
        if (erroreUpload) throw new Error(erroreUpload.message);

        const risultato = await aggiungiFotoScheda(scheda.id, risultatoUrl.percorso, file.name);
        if (risultato.errore) throw new Error(risultato.errore);

        toast("Foto aggiunta.", "successo");
        router.refresh();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Errore imprevisto durante il caricamento.");
      }
    });
  }

  const isInstallazione = scheda.tipo === "Nuova installazione";

  const impianto = scheda.supporto || scheda.posizione || (scheda.gps_lat != null && scheda.gps_lng != null);
  const reteCollaudo =
    scheda.tipo_cavo || scheda.metri_cavo || scheda.modello_cpe || scheda.mac || scheda.bts || scheda.vlan ||
    scheda.rssi != null || scheda.snr != null || scheda.router ||
    scheda.ping_ms != null || scheda.download_mbps != null || scheda.upload_mbps != null;

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm print:border-none print:shadow-none" id="scheda-stampabile">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Scheda {scheda.tipo}
          </p>
          {scheda.esito && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${COLORE_ESITO[scheda.esito] ?? "bg-muted text-muted-foreground"}`}>
              {scheda.esito}
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" strokeWidth={2.25} />
          Stampa / Salva PDF
        </Button>
      </div>

      <div className="flex flex-col gap-3 text-sm">
        {/* ★ riepilogo in prosa, ricalcolato dai campi già sotto (non
        salvato a parte): stessa fonte di verità, mai disallineato. */}
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <IconaCategoria icona={FileText} categoria="documento" dimensione="sm" />
            Riepilogo
          </div>
          <p className="mt-1 leading-relaxed">{generaTestoScheda(scheda)}</p>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {isInstallazione && impianto && (
            <div className="rounded-lg border p-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                <IconaCategoria icona={MapPin} categoria="luogo" dimensione="sm" />
                Impianto
              </div>
              <div className="flex flex-col gap-1.5">
                {(scheda.supporto || scheda.posizione) && <SottoCampo etichetta="Struttura" valore={`${scheda.supporto || "—"}${scheda.posizione ? ` · ${scheda.posizione}` : ""}`} />}
                {scheda.gps_lat != null && scheda.gps_lng != null && (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">Posizione GPS</div>
                    <a
                      href={`https://maps.google.com/?q=${scheda.gps_lat},${scheda.gps_lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {scheda.gps_lat.toFixed(6)}, {scheda.gps_lng.toFixed(6)} — apri in Maps
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {isInstallazione && reteCollaudo && (
            <div className="rounded-lg border p-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                <IconaCategoria icona={FileText} categoria="documento" dimensione="sm" />
                Rete e collaudo
              </div>
              <div className="flex flex-col gap-1.5">
                {(scheda.tipo_cavo || scheda.metri_cavo) && <SottoCampo etichetta="Cablaggio" valore={`${scheda.tipo_cavo || "—"}${scheda.metri_cavo ? ` · ${scheda.metri_cavo} m` : ""}`} />}
                {(scheda.modello_cpe || scheda.mac || scheda.bts || scheda.vlan) && (
                  <SottoCampo
                    etichetta="Radio/CPE"
                    valore={`${scheda.modello_cpe || "—"}${scheda.mac ? ` · MAC ${scheda.mac}` : ""}${scheda.bts ? ` · BTS ${scheda.bts}` : ""}${scheda.vlan ? ` · VLAN ${scheda.vlan}` : ""}`}
                  />
                )}
                {(scheda.rssi != null || scheda.snr != null) && <SottoCampo etichetta="Segnale" valore={`RSSI ${scheda.rssi ?? "—"} dBm · SNR ${scheda.snr ?? "—"} dB`} />}
                {scheda.router && <SottoCampo etichetta="Rete interna" valore={scheda.router} />}
                {(scheda.ping_ms != null || scheda.download_mbps != null || scheda.upload_mbps != null) && (
                  <SottoCampo etichetta="Collaudo" valore={`${scheda.ping_ms ?? "—"} ms · ↓${scheda.download_mbps ?? "—"} Mbps · ↑${scheda.upload_mbps ?? "—"} Mbps`} />
                )}
              </div>
            </div>
          )}

          {!isInstallazione && scheda.interventi_eseguiti.length > 0 && (
            <div className="rounded-lg border p-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                <IconaCategoria icona={Wrench} categoria="documento" dimensione="sm" />
                Interventi eseguiti
              </div>
              <p className="text-sm font-medium">{scheda.interventi_eseguiti.join(", ")}</p>
            </div>
          )}

          {(scheda.materiali.length > 0 || scheda.importo_fatturato != null || scheda.metodo_pagamento_posa) && (
            <div className="rounded-lg border p-2.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
                <IconaCategoria icona={Euro} categoria="denaro" dimensione="sm" />
                Materiali & pagamento
              </div>
              {(["Comodato", "Prodotto", "Servizio"] as const).map((gruppo) => {
                // ★ le schede salvate prima di tipo_riga non hanno il campo:
                // trattate come "Prodotto" se non comodato_uso.
                const righe = scheda.materiali.filter((m) => (m.tipo_riga ?? (m.comodato_uso ? "Comodato" : "Prodotto")) === gruppo);
                if (righe.length === 0) return null;
                return (
                  <div key={gruppo} className="mb-1.5 last:mb-0">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">
                      {gruppo === "Comodato" ? "Comodato d'uso" : gruppo === "Prodotto" ? "Prodotti" : "Servizi"}
                    </div>
                    <ul className="flex flex-col gap-0.5 text-sm">
                      {righe.map((m, i) => (
                        <li key={i} className="flex items-baseline justify-between gap-2">
                          <span>
                            {m.quantita} {m.unita_misura} — {m.nome}
                            {m.automatico && " · automatico"}
                            {m.dettagli && ` — ${m.dettagli}`}
                          </span>
                          {!m.comodato_uso && <span className="shrink-0 tabular-nums text-muted-foreground">{formattaValuta(m.prezzo_unitario * m.quantita)}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {scheda.importo_fatturato != null && (
                <div className="flex items-baseline justify-between border-t pt-1.5 text-sm font-bold">
                  <span>Totale fatturato</span>
                  <span className="tabular-nums">{formattaValuta(scheda.importo_fatturato)}</span>
                </div>
              )}
              {scheda.metodo_pagamento_posa && <p className="mt-0.5 text-xs text-muted-foreground">Metodo: {scheda.metodo_pagamento_posa}</p>}
            </div>
          )}

          <div className="rounded-lg border p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
              <IconaCategoria icona={Calendar} categoria="tempo" dimensione="sm" />
              Quando
            </div>
            <SottoCampo etichetta="Data" valore={new Date(scheda.creato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })} />
          </div>
        </div>

        {scheda.note && <SottoCampoLargo etichetta="Note" valore={scheda.note} categoria="documento" icona={FileText} />}

        {(scheda.foto.length > 0 || modificabile) && (
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <IconaCategoria icona={FileText} categoria="documento" dimensione="sm" />
              Foto
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {scheda.foto.map((f, i) => (
                <span key={i} className="inline-flex items-stretch overflow-hidden rounded-md border">
                  <button type="button" onClick={() => apriAllegato(f.percorso)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium hover:bg-muted">
                    <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
                    {f.nome}
                  </button>
                  {modificabile && (
                    <button
                      type="button"
                      onClick={() => eliminaFoto(f.percorso)}
                      disabled={inCorsoEliminaFoto === f.percorso}
                      title="Elimina foto"
                      aria-label={`Elimina ${f.nome}`}
                      className="flex items-center justify-center border-l bg-critical/5 px-2 text-critical transition hover:bg-critical/10 disabled:opacity-50 print:hidden"
                    >
                      {inCorsoEliminaFoto === f.percorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />}
                    </button>
                  )}
                </span>
              ))}
              {modificabile && (
                <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-primary print:hidden">
                  {inCorsoAggiungiFoto ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />}
                  {inCorsoAggiungiFoto ? "Caricamento…" : "Aggiungi foto"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={inCorsoAggiungiFoto}
                    onChange={(e) => {
                      aggiungiFoto(e.target.files?.[0] ?? null);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {(scheda.firma_cliente_url || scheda.firma_cliente_metodo || scheda.firma_tecnico_url) && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* ★ le schede vecchie hanno firma_cliente_url (disegno, mostrato
            come prima); quelle nuove hanno firma_cliente_metodo valorizzato
            invece: "otp_email"/"link_email" (il cliente in prima persona) o
            "otp_admin" (l'ufficio autorizza al posto suo — vedi ramo dedicato
            sotto, colore ambra: non è la stessa cosa di una vera conferma). */}
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
            ) : scheda.firma_cliente_metodo === "otp_admin" ? (
              <div>
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <IconaCategoria icona={UserRound} categoria="persona" dimensione="sm" />
                  Autorizzazione
                </div>
                <p className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-warning">
                  <UserRound className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
                  Autorizzato dall&apos;ufficio ({scheda.firma_cliente_admin_nome || "amministratore"})
                  {scheda.firma_cliente_verificato_il &&
                    ` il ${new Date(scheda.firma_cliente_verificato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                  {" "}— cliente irraggiungibile.
                </p>
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

function SottoCampo({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">{etichetta}</div>
      <div className="text-sm font-medium">{valore}</div>
    </div>
  );
}

function SottoCampoLargo({
  etichetta,
  valore,
  categoria,
  icona: Icona,
}: {
  etichetta: string;
  valore: string;
  categoria: Parameters<typeof IconaCategoria>[0]["categoria"];
  icona: Parameters<typeof IconaCategoria>[0]["icona"];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <IconaCategoria icona={Icona} categoria={categoria} dimensione="sm" />
        {etichetta}
      </div>
      <div className="mt-0.5 font-medium whitespace-pre-wrap">{valore}</div>
    </div>
  );
}
