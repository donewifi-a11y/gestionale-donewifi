import type { StatoTecnicoCliente } from "@/app/(app)/clienti-esterni/actions";

/** ★ NUOVA (2026-10-01, audit completezza funzionale — moduli restanti) —
 * vedi il commento su getStatoTecnicoCliente(): riassunto a colpo d'occhio
 * per chi riceve una chiamata di assistenza, senza dover aprire il Ticket
 * e la Scheda di lavoro per vedere CPE/BTS/segnale. */
export function StatoTecnicoCliente({ stato }: { stato: StatoTecnicoCliente | null }) {
  if (!stato) return <p className="text-sm text-muted-foreground">Nessun dato tecnico registrato ancora per questo cliente.</p>;

  const campi: { etichetta: string; valore: string | null }[] = [
    { etichetta: "CPE", valore: stato.modelloCpe },
    { etichetta: "MAC", valore: stato.mac },
    { etichetta: "BTS", valore: stato.bts },
    { etichetta: "Router", valore: stato.router },
    { etichetta: "RSSI", valore: stato.rssi != null ? `${stato.rssi} dBm` : null },
    { etichetta: "SNR", valore: stato.snr != null ? `${stato.snr} dB` : null },
  ].filter((c) => c.valore);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {campi.map((c) => (
          <span key={c.etichetta}>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.etichetta}</span>{" "}
            <span className="font-mono">{c.valore}</span>
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Da Ticket #{stato.ticketNumero} · aggiornato il {new Date(stato.aggiornatoIl).toLocaleDateString("it-IT")}
      </p>
    </div>
  );
}
