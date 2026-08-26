"use client";

import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { FirmaClienteScheda } from "@/components/schede/firma-cliente-scheda";
import { completaTicketConRapportinoEsterno } from "@/app/pose/actions";
import type { FirmaClienteApprovata } from "@/app/(app)/calendario/actions";
import type { StatoTicket } from "@/lib/types";

// ★ pose.donewifi.it è pensato SOLO per smartphone/tablet (richiesta
// esplicita, 2026-08-26): niente riduzione "sm:" per il desktop come nei
// campi condivisi con il gestionale interno (vedi campoClass in
// scheda-installazione-form.tsx) — qui i target touch restano sempre
// grandi, a qualunque larghezza di schermo tocchi il breakpoint.
const campoClass = "mt-1.5 w-full rounded-lg border bg-background px-3.5 py-3 text-base";

// ★ NUOVA (2026-08-26) — equivalente di RapportinoForm (tickets/rapportino.tsx)
// per pose.donewifi.it: stessa interazione (esito/lavori/materiali/foto/firma),
// ma posta a completaTicketConRapportinoEsterno() invece che all'action
// interna (che richiede una sessione staff che qui non esiste). Componente
// a sé invece di generalizzare l'originale — vedi il commento sull'action
// gemella in app/pose/actions.ts. Azione principale fissa in basso, stesso
// principio dello SchedaWizard: raggiungibile col pollice senza scorrere.
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
    // ★ pb-24 lascia spazio sotto l'ultimo campo per non finire nascosto
    // dietro la barra azione fissa (sticky bottom) qui sotto.
    <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-xl border bg-card p-4 pb-24 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Rapportino di chiusura — Intervento #{ticketNumero}
      </p>
      <div>
        <Label htmlFor="esito">Esito intervento *</Label>
        <textarea id="esito" name="esito" required rows={3} className={campoClass} />
      </div>
      <div>
        <Label htmlFor="lavoriSvolti">Lavori svolti</Label>
        <textarea id="lavoriSvolti" name="lavoriSvolti" rows={3} className={campoClass} />
      </div>
      <div>
        <Label htmlFor="materiali">Materiali usati</Label>
        <textarea id="materiali" name="materiali" rows={3} className={campoClass} />
      </div>
      <div>
        <Label htmlFor="importoFatturato">Importo fatturato (€, facoltativo)</Label>
        <input id="importoFatturato" name="importoFatturato" type="number" step="0.01" min="0" inputMode="decimal" className={campoClass} />
      </div>
      <div>
        <Label htmlFor="foto">Foto (facoltative)</Label>
        <label className="mt-1.5 flex h-14 cursor-pointer items-center rounded-lg border border-dashed bg-background px-3.5 text-sm text-muted-foreground">
          <span className="truncate">{nomiFoto || "Scatta o scegli una o più foto"}</span>
          <input
            ref={fileInputRef}
            id="foto"
            name="foto"
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            className="hidden"
            onChange={(e) => setNomiFoto(Array.from(e.target.files ?? []).map((f) => f.name).join(", "))}
          />
        </label>
      </div>
      <div>
        <Label>Firma cliente</Label>
        <div className="mt-1.5">
          <FirmaClienteScheda riferimento={{ tipo: "ticket", id: ticketId }} value={firmaCliente} onChange={setFirmaCliente} />
        </div>
      </div>

      {errore && (
        <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          {errore}
        </p>
      )}

      {/* ★ fissa in basso, sempre raggiungibile col pollice — stesso
      principio del footer di SchedaWizard. -mx-4/-mb-4 pareggia il
      padding del form per toccare i bordi del contenitore. */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-popover/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <button
            type="submit"
            disabled={inCorso}
            className="flex h-14 w-full items-center justify-center rounded-xl bg-gradient-to-b from-primary to-[color-mix(in_oklch,var(--primary),black_14%)] text-base font-semibold text-primary-foreground shadow-md shadow-primary/25 disabled:opacity-60"
          >
            {inCorso ? "Salvataggio..." : "Completa e salva rapportino"}
          </button>
        </div>
      </div>
    </form>
  );
}
