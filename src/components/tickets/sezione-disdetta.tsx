"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Loader2, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconaCategoria } from "@/components/condivisi/icona-categoria";
import { useToast } from "@/components/ui/toast";
import { impostaRecuperoDisdetta, segnaRitiroDisdettaPagato } from "@/app/(app)/tickets/actions";
import type { Ticket } from "@/lib/types";

const COSTI_RITIRO_IN_LOCO = [95, 61] as const;

/**
 * ★ NUOVA (2026-10-20, richiesta esplicita: revisione del flusso disdette —
 * "la fatturazione apre il ticket di disdetta quando arriva una raccomandata
 * o pec... indica quando cesserà la fatturazione e sarà possibile
 * recuperarla... fissa il costo di recupero 95€, 61€ o consegna in sede che
 * è gratuito... per far saldare il ritiro deve farsi pagare la lavorazione e
 * ricevuto il pagamento schiaccia il pulsante pagato ritiro") — sostituisce
 * il vecchio blocco "Dismissione — ritiro apparati" di
 * sezione-documenti-ticket.tsx, che chiedeva solo una data e passava subito
 * ad Analisi Rete. Autonomo (stato e azioni propri) invece di altre props
 * girate attraverso DettaglioTicket: tutto ciò che serve è il Ticket.
 *
 * Consegna in ufficio (gratuita): il Ticket passa subito ad Analisi Rete.
 * Ritiro in loco (95 € o 61 €): resta a Fatturazione fino a "Pagato
 * ritiro". Vedi impostaRecuperoDisdetta()/segnaRitiroDisdettaPagato() in
 * tickets/actions.ts.
 */
export function SezioneDisdetta({ ticket, onCambiato }: { ticket: Ticket; onCambiato: (t: Ticket) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [inCorso, startTransizione] = useTransition();
  const [errore, setErrore] = useState("");
  const [modifica, setModifica] = useState(false);
  const [data, setData] = useState(ticket.data_dismissione_disdetta ?? "");
  const [modalita, setModalita] = useState<"Ritiro in loco" | "Consegna in ufficio" | "">(ticket.disdetta_modalita_ritiro ?? "");
  const [costo, setCosto] = useState<number>(ticket.disdetta_costo_recupero && ticket.disdetta_costo_recupero > 0 ? ticket.disdetta_costo_recupero : 95);

  const impostato = !!ticket.disdetta_modalita_ritiro && !!ticket.data_dismissione_disdetta;
  const inLoco = ticket.disdetta_modalita_ritiro === "Ritiro in loco";
  const pagato = !!ticket.disdetta_ritiro_pagato_il;
  const siamoFatturazione = ticket.reparto === "Fatturazione";

  function conferma() {
    if (!data) return setErrore("Indica quando cessa la fatturazione.");
    if (!modalita) return setErrore("Scegli come verranno recuperati gli apparati.");
    setErrore("");
    const costoFinale = modalita === "Consegna in ufficio" ? 0 : costo;
    startTransizione(async () => {
      const r = await impostaRecuperoDisdetta(ticket.id, { dataCessazione: data, modalita, costo: costoFinale });
      if (r.errore) {
        setErrore(r.errore);
        toast(r.errore);
        return;
      }
      onCambiato({
        ...ticket,
        data_dismissione_disdetta: data,
        disdetta_modalita_ritiro: modalita,
        disdetta_costo_recupero: costoFinale,
        reparto: r.passatoAdAnalisiRete ? "Analisi Rete" : ticket.reparto,
      });
      setModifica(false);
      toast(r.passatoAdAnalisiRete ? "Recupero impostato — passato ad Analisi Rete." : "Recupero impostato — in attesa del pagamento.", "successo");
      router.refresh();
    });
  }

  function pagatoRitiro() {
    setErrore("");
    startTransizione(async () => {
      const r = await segnaRitiroDisdettaPagato(ticket.id);
      if (r.errore) {
        setErrore(r.errore);
        toast(r.errore);
        return;
      }
      onCambiato({ ...ticket, disdetta_ritiro_pagato_il: new Date().toISOString(), reparto: "Analisi Rete" });
      toast("Ritiro pagato — passato ad Analisi Rete.", "successo");
      router.refresh();
    });
  }

  const intestazione = (
    <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
      <IconaCategoria icona={CalendarClock} categoria="tempo" dimensione="sm" />
      Cessazione e recupero apparati
    </div>
  );

  if (impostato && !modifica) {
    return (
      <div>
        {intestazione}
        <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
          <p>
            Fatturazione cessa il <b>{new Date(ticket.data_dismissione_disdetta!).toLocaleDateString("it-IT")}</b>.
          </p>
          <p>
            Recupero apparati: <b>{ticket.disdetta_modalita_ritiro}</b> —{" "}
            {ticket.disdetta_costo_recupero ? <b>{ticket.disdetta_costo_recupero} €</b> : <b>gratuito</b>}.
          </p>
          {inLoco && pagato && (
            <p className="flex items-center gap-1.5 text-success">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              Ritiro pagato il {new Date(ticket.disdetta_ritiro_pagato_il!).toLocaleDateString("it-IT")}
              {ticket.reparto === "Analisi Rete" ? " — passato ad Analisi Rete." : "."}
            </p>
          )}
          {inLoco && !pagato && (
            <>
              <p className="text-warning">In attesa del pagamento del ritiro: Analisi Rete lo vedrà solo dopo l&apos;incasso.</p>
              {siamoFatturazione && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={pagatoRitiro} disabled={inCorso} className="min-h-9">
                    {inCorso ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
                    Pagato ritiro
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setModifica(true)} className="min-h-9">
                    <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />
                    Modifica
                  </Button>
                </div>
              )}
            </>
          )}
          {!inLoco && ticket.reparto === "Analisi Rete" && <p className="text-muted-foreground">Passato ad Analisi Rete: il cliente consegna gli apparati in ufficio.</p>}
          {errore && <p className="text-xs text-critical">{errore}</p>}
        </div>
      </div>
    );
  }

  if (!siamoFatturazione) {
    return (
      <div>
        {intestazione}
        <p className="text-xs text-muted-foreground">In attesa che Fatturazione indichi la cessazione e le modalità di recupero apparati.</p>
      </div>
    );
  }

  return (
    <div>
      {intestazione}
      <div className="flex flex-col gap-3 rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">
          Indica quando cessa la fatturazione (da quel giorno gli apparati si possono recuperare) e come verranno recuperati.
        </p>
        <div>
          <label htmlFor="data-cessazione" className="text-xs font-semibold">
            Cessazione fatturazione
          </label>
          <input
            id="data-cessazione"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <div>
          <span className="text-xs font-semibold">Recupero apparati</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(["Ritiro in loco", "Consegna in ufficio"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModalita(m)}
                aria-pressed={modalita === m}
                className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-semibold ${
                  modalita === m ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        {modalita === "Ritiro in loco" && (
          <div>
            <span className="text-xs font-semibold">Costo del ritiro</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {COSTI_RITIRO_IN_LOCO.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCosto(c)}
                  aria-pressed={costo === c}
                  className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-semibold ${
                    costo === c ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
                  }`}
                >
                  {c} €
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Il ritiro va pagato prima: il Ticket passa ad Analisi Rete solo dopo &quot;Pagato ritiro&quot;.</p>
          </div>
        )}
        {modalita === "Consegna in ufficio" && (
          <p className="text-[11px] text-muted-foreground">Consegna in ufficio: gratuita. Il Ticket passa subito ad Analisi Rete.</p>
        )}
        {errore && <p className="text-xs text-critical">{errore}</p>}
        <div className="flex gap-2">
          <Button size="sm" onClick={conferma} disabled={inCorso} className="min-h-9 flex-1">
            {inCorso && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />}
            {inCorso ? "Salvataggio…" : "Conferma"}
          </Button>
          {modifica && (
            <Button size="sm" variant="ghost" onClick={() => setModifica(false)} className="min-h-9">
              Annulla
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
