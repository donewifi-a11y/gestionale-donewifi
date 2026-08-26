"use client";

import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FirmaClienteScheda } from "@/components/schede/firma-cliente-scheda";
import { completaTicketConRapportinoEsterno } from "@/app/pose/actions";
import type { FirmaClienteApprovata } from "@/app/(app)/calendario/actions";
import type { StatoTicket } from "@/lib/types";

// ★ NUOVA (2026-08-26) — equivalente di RapportinoForm (tickets/rapportino.tsx)
// per pose.donewifi.it: stessa interazione (esito/lavori/materiali/foto/firma),
// ma posta a completaTicketConRapportinoEsterno() invece che all'action
// interna (che richiede una sessione staff che qui non esiste). Componente
// a sé invece di generalizzare l'originale — vedi il commento sull'action
// gemella in app/pose/actions.ts.
export function RapportinoFormEsterno({
  ticketId,
  ticketNumero,
  statoVecchio,
  onSalvato,
}: {
  ticketId: string;
  ticketNumero: number;
  statoVecchio: StatoTicket;
  onSalvato: () => void;
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
    const risultato = await completaTicketConRapportinoEsterno(
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
        Rapportino di chiusura — Intervento #{ticketNumero}
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
          capture="environment"
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

      <Button type="submit" disabled={inCorso}>
        {inCorso ? "Salvataggio..." : "Completa e salva rapportino"}
      </Button>
    </form>
  );
}
