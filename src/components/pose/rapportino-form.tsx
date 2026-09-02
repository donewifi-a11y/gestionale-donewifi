"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Mail } from "lucide-react";
import { Label } from "@/components/ui/label";
import { completaTicketConRapportinoEsterno } from "@/app/pose/actions";
import { caricaFotoScheda } from "@/lib/carica-foto-scheda";
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

    const fileDaCaricare = Array.from(fileInputRef.current?.files ?? []);
    setInCorso(true);
    // ★ FIX (2026-09-02, bug reale: "Errore imprevisto durante il
    // salvataggio" — causa reale: le foto grezze da fotocamera nel corpo
    // della Server Action superavano il limite di default di 1MB di
    // Next.js, vedi il commento gemello in scheda-installazione-domande.tsx)
    // — caricate qui, direttamente dal browser allo storage, prima di
    // chiamare l'azione. Anche il try/catch mancava qui (mai corretto nel
    // giro "fermo su salvataggio" del 28/08, che aveva toccato solo le
    // Schede di Installazione/Lavorazione): senza, un errore imprevisto
    // lasciava il pulsante bloccato su "Salvataggio…" per sempre.
    try {
      const foto = await Promise.all(fileDaCaricare.map((f) => caricaFotoScheda(f, ticketId)));
      const risultato = await completaTicketConRapportinoEsterno(
        ticketId,
        statoVecchio,
        {
          esito,
          lavoriSvolti: String(dati.get("lavoriSvolti") || ""),
          materiali: String(dati.get("materiali") || ""),
          importoFatturato: String(dati.get("importoFatturato") || ""),
        },
        foto
      );
      if (risultato.errore) { setErrore(risultato.errore); return; }
      onSalvato();
    } catch (err) {
      console.error("onSubmit() - errore imprevisto durante il salvataggio rapportino:", err);
      setErrore("Errore imprevisto durante il salvataggio — ricarica la pagina e riprova.");
    } finally {
      setInCorso(false);
    }
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
          {/* ★ FIX (2026-08-28, richiesta esplicita: "o le scatto sul
          momento o le pesco dalla galleria") — `capture="environment"`
          apriva direttamente la fotocamera su gran parte dei browser
          mobile, saltando la scelta nativa "Fotocamera / Libreria foto".
          Tolto: `accept="image/*"` da solo basta a far comparire entrambe
          le opzioni. */}
          <input
            ref={fileInputRef}
            id="foto"
            name="foto"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => setNomiFoto(Array.from(e.target.files ?? []).map((f) => f.name).join(", "))}
          />
        </label>
      </div>
      {/* ★ SEMPLIFICATA (2026-08-27, richiesta esplicita — revisione Ticket
      via artifact: "deve solo inviare il rapportino al cliente") — stessa
      semplificazione della versione staff interno, vedi rapportino.tsx. */}
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Mail className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        Il cliente riceverà via email il riepilogo — non serve una sua conferma per chiudere.
      </p>

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
