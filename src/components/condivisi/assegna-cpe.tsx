"use client";

import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { getAntenneDisponibili, assegnaCpeATicket } from "@/app/(app)/materiali/actions";
import { OPZIONI_INSTALLAZIONE, formattaMac } from "@/lib/types";

/**
 * ★ NUOVA (2026-10-16, richiesta esplicita: "quando vengono pianificate
 * installazioni e cambio cpe... fai che possiamo assegnare una cpe con il
 * suo mac... visibile nel calendario") — prima la prenotazione di una CPE
 * era raggiungibile SOLO da Materiali → Antenne, mai dalla pianificazione
 * stessa. Condiviso tra i tre punti dove oggi si pianifica un
 * appuntamento (PianificaAppuntamento in tickets-board.tsx,
 * FormNuovoAppuntamento/FormModificaAppuntamento in calendario-board.tsx)
 * invece di tre copie quasi identiche. Riusa `prenotaAntennaInventario`
 * (un pezzo già censito a magazzino) e la nuova `assegnaCpeATicket` per il
 * caso "MAC mai visto prima" (scelta esplicita dell'utente, non limitata
 * al solo magazzino già pronto) — stesso controllo di permesso in
 * entrambi i casi (solo Analisi Rete o admin), lato server.
 *
 * "Visibile nel calendario": la riga "📡 Antenna riservata: ..." nella
 * descrizione dell'evento Google Calendar (descrizioneEventoGoogle in
 * calendario/actions.ts) legge le stesse righe Prenotate per questo
 * Ticket al momento di creare/modificare l'appuntamento — assegnare la
 * CPE PRIMA di inviare il form (vedi i tre punti d'uso) la fa comparire
 * lì in automatico, nessuna modifica necessaria a quella funzione.
 */
export function AssegnaCpe({
  ticketId,
  antenneRiservate,
  onAssegnata,
}: {
  ticketId: string;
  antenneRiservate: { tipologia: string; mac: string }[];
  onAssegnata: () => void;
}) {
  const toast = useToast();
  const [disponibili, setDisponibili] = useState<{ id: string; tipologia: string; mac: string }[]>([]);
  const [aperto, setAperto] = useState(false);
  const [antennaId, setAntennaId] = useState("");
  const [nuovaTipologia, setNuovaTipologia] = useState("");
  const [nuovoMac, setNuovoMac] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    if (aperto) getAntenneDisponibili().then(setDisponibili);
  }, [aperto]);

  async function assegna() {
    setErrore("");
    if (!antennaId && (!nuovaTipologia || !nuovoMac.trim())) {
      setErrore("Scegli una CPE a magazzino oppure inserisci modello e MAC.");
      return;
    }
    setInCorso(true);
    const risultato = antennaId
      ? await assegnaCpeATicket({ ticketId, antennaId })
      : await assegnaCpeATicket({ ticketId, tipologia: nuovaTipologia, mac: nuovoMac });
    setInCorso(false);
    if (risultato.errore) {
      setErrore(risultato.errore);
      return;
    }
    toast("CPE assegnata.", "successo");
    setAntennaId("");
    setNuovaTipologia("");
    setNuovoMac("");
    setAperto(false);
    onAssegnata();
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-2">
      {antenneRiservate.length > 0 && (
        <p className={`flex items-center gap-1.5 text-xs font-semibold text-primary ${aperto ? "mb-2" : ""}`}>
          <Radio className="h-3 w-3 shrink-0" strokeWidth={2.5} />
          {antenneRiservate.map((a) => `${a.tipologia} (${a.mac})`).join(", ")}
        </p>
      )}
      {!aperto ? (
        <button
          type="button"
          onClick={() => setAperto(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-primary"
        >
          <Radio className="h-3 w-3 shrink-0" strokeWidth={2.5} />
          {antenneRiservate.length > 0 ? "Assegna un'altra CPE" : "Assegna CPE"}
        </button>
      ) : (
        <div className="flex flex-col gap-1.5">
          {disponibili.length > 0 && (
            <select
              value={antennaId}
              onChange={(e) => {
                setAntennaId(e.target.value);
                if (e.target.value) {
                  setNuovaTipologia("");
                  setNuovoMac("");
                }
              }}
              className="h-8 rounded-md border bg-background px-2 text-xs"
            >
              <option value="">— da magazzino —</option>
              {disponibili.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.tipologia} · {a.mac}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-1.5">
            <select
              value={nuovaTipologia}
              onChange={(e) => {
                setNuovaTipologia(e.target.value);
                if (e.target.value) setAntennaId("");
              }}
              disabled={!!antennaId}
              className="h-8 flex-1 rounded-md border bg-background px-2 text-xs disabled:opacity-50"
            >
              <option value="">— oppure nuovo modello —</option>
              {OPZIONI_INSTALLAZIONE.cpe.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              value={nuovoMac}
              onChange={(e) => {
                setNuovoMac(formattaMac(e.target.value));
                if (e.target.value) setAntennaId("");
              }}
              disabled={!!antennaId}
              placeholder="MAC nuovo"
              className="h-8 w-32 rounded-md border bg-background px-2 text-xs disabled:opacity-50"
            />
          </div>
          {errore && <p className="text-[11px] text-critical">{errore}</p>}
          <div className="flex gap-1.5">
            <Button type="button" size="sm" disabled={inCorso} onClick={assegna} className="flex-1">
              {inCorso ? "Assegno…" : "Assegna"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAperto(false)}>
              Annulla
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
