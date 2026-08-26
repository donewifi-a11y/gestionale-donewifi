"use client";

import { useRef, useState } from "react";
import { Printer, FileText, AlertTriangle, Check, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FirmaClienteScheda } from "@/components/schede/firma-cliente-scheda";
import { completaTicketConRapportino, urlDocumentoRapportino } from "@/app/(app)/tickets/actions";
import type { FirmaClienteApprovata } from "@/app/(app)/calendario/actions";
import { useToast } from "@/components/ui/toast";
import { generaTestoRapportino } from "@/lib/testo-rapporto";
import type { RapportinoIntervento, StatoTicket } from "@/lib/types";

export function RapportinoForm({
  ticketId,
  ticketNumero,
  statoVecchio,
  onSalvato,
  onAnnulla,
}: {
  ticketId: string;
  ticketNumero: number;
  statoVecchio: StatoTicket;
  onSalvato: () => void;
  onAnnulla: () => void;
}) {
  const [firmaCliente, setFirmaCliente] = useState<FirmaClienteApprovata | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [nomiFoto, setNomiFoto] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const esito = String(dati.get("esito") || "").trim();
    if (!esito) return setErrore("L'esito dell'intervento è obbligatorio.");
    if (!firmaCliente) return setErrore("Conferma la firma del cliente (codice email o link di approvazione) prima di salvare.");

    const foto = Array.from(fileInputRef.current?.files ?? []);
    setInCorso(true);
    const risultato = await completaTicketConRapportino(
      ticketId,
      statoVecchio,
      {
        esito,
        lavoriSvolti: String(dati.get("lavoriSvolti") || ""),
        materiali: String(dati.get("materiali") || ""),
        firmaCliente,
        importoFatturato: String(dati.get("importoFatturato") || ""),
      },
      foto
    );
    setInCorso(false);
    if (risultato.errore) return setErrore(risultato.errore);
    onSalvato();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Rapportino di chiusura — Ticket #{ticketNumero}
      </p>
      <div>
        <Label htmlFor="esito">Esito intervento *</Label>
        <textarea id="esito" name="esito" required rows={2} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
      </div>
      <div>
        <Label htmlFor="lavoriSvolti">Lavori svolti</Label>
        <textarea id="lavoriSvolti" name="lavoriSvolti" rows={2} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
      </div>
      <div>
        <Label htmlFor="materiali">Materiali usati</Label>
        <textarea id="materiali" name="materiali" rows={2} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
      </div>
      <div>
        <Label htmlFor="importoFatturato">Importo fatturato (€, facoltativo)</Label>
        <input
          id="importoFatturato"
          name="importoFatturato"
          type="number"
          step="0.01"
          min="0"
          className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
        />
      </div>
      <div>
        <Label htmlFor="foto">Foto (facoltative)</Label>
        <input
          ref={fileInputRef}
          id="foto"
          name="foto"
          type="file"
          accept="image/*"
          multiple
          className="mt-1 block w-full text-xs"
          onChange={(e) => setNomiFoto(Array.from(e.target.files ?? []).map((f) => f.name).join(", "))}
        />
        {nomiFoto && <p className="mt-1 text-xs text-muted-foreground">{nomiFoto}</p>}
      </div>
      <div>
        <Label>Firma cliente</Label>
        <div className="mt-1">
          <FirmaClienteScheda riferimento={{ tipo: "ticket", id: ticketId }} value={firmaCliente} onChange={setFirmaCliente} />
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
          {inCorso ? "Salvataggio..." : "Completa e salva rapportino"}
        </Button>
        <Button type="button" variant="outline" disabled={inCorso} onClick={onAnnulla}>
          Annulla
        </Button>
      </div>
    </form>
  );
}

export function RapportinoVista({ rapportino, importoFatturato }: { rapportino: RapportinoIntervento; importoFatturato?: number | null }) {
  const [urlFirma, setUrlFirma] = useState<string | null>(null);
  const toast = useToast();

  async function mostraFirma() {
    if (!rapportino.firma_url) return;
    const risultato = await urlDocumentoRapportino(rapportino.firma_url);
    if (risultato.url) setUrlFirma(risultato.url);
  }

  async function apriFoto(percorso: string) {
    const risultato = await urlDocumentoRapportino(percorso);
    if (risultato.errore || !risultato.url) {
      toast(risultato.errore || "Errore imprevisto.");
      return;
    }
    window.open(risultato.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm print:border-none print:shadow-none" id="rapportino-stampabile">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Rapportino di chiusura</p>
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
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Riepilogo</div>
          <p className="mt-1 leading-relaxed">{generaTestoRapportino(rapportino)}</p>
        </div>
        <Campo etichetta="Esito" valore={rapportino.esito} />
        {rapportino.lavori_svolti && <Campo etichetta="Lavori svolti" valore={rapportino.lavori_svolti} />}
        {rapportino.materiali && <Campo etichetta="Materiali usati" valore={rapportino.materiali} />}
        {importoFatturato != null && <Campo etichetta="Importo fatturato" valore={`€ ${importoFatturato}`} />}
        <Campo
          etichetta="Data"
          valore={new Date(rapportino.creato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        />
        {rapportino.foto?.length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Foto</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {rapportino.foto.map((f, i) => (
                <Button key={i} size="sm" variant="outline" onClick={() => apriFoto(f.percorso)}>
                  <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
                  {f.nome}
                </Button>
              ))}
            </div>
          </div>
        )}
        {/* ★ NUOVA — i rapportini vecchi hanno firma_url (disegno, mostrato
         * come prima); quelli nuovi hanno firma_metodo valorizzato invece —
         * OTP verificato (verde) o link inviato, ancora in attesa di
         * conferma del cliente (giallo). Stesso schema di SchedaVista. */}
        {rapportino.firma_url ? (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Firma cliente</div>
            {urlFirma ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urlFirma} alt="Firma cliente" className="mt-1 h-24 rounded-md border bg-white" />
            ) : (
              <Button size="sm" variant="outline" className="mt-1 print:hidden" onClick={mostraFirma}>
                Mostra firma
              </Button>
            )}
          </div>
        ) : rapportino.firma_metodo ? (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Conferma cliente</div>
            {rapportino.firma_verificato_il ? (
              <p className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-success">
                <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
                Confermato da {rapportino.firma_email} il{" "}
                {new Date(rapportino.firma_verificato_il).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                {rapportino.firma_metodo === "otp_email" ? " (codice email)" : " (link email)"}.
              </p>
            ) : (
              <p className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-warning">
                <Mail className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
                Link inviato a {rapportino.firma_email} — in attesa che il cliente confermi.
              </p>
            )}
          </div>
        ) : null}
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
