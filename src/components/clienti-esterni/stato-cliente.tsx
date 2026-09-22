"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Gauge, Calendar, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { impostaFatturaInsolutaManuale, impostaRallentato, impostaDataRiattivazionePrevista } from "@/app/(app)/clienti-esterni/actions";

/** ★ NUOVA (2026-09-16, migrazione 0076, richiesta esplicita: "metterei
 * all'interno della scheda cliente la possibilità di far inserire se una
 * fattura è insoluta e far indicare se un cliente va rallentato e mettere
 * status rallentato") — due flag manuali indipendenti:
 * - "Fattura insoluta": copre i casi che gli insoluti calcolati sulle
 *   fatture sincronizzate da Aruba (vedi "insoluti" nella pagina) non
 *   intercettano.
 * - "Rallentato": solo stato/tracciamento interno — impostarlo non tocca
 *   alcun apparato di rete (scelta esplicita dell'utente: "solo uno status
 *   visibile"), è chi guarda il gestionale a decidere cosa farne.
 * Un semplice interruttore ciascuno, con una nota/motivo facoltativi
 * raccolti solo quando si accende — niente conferma prima di spegnerlo,
 * non è un'azione distruttiva.
 */
export function StatoCliente({
  clienteId,
  fatturaInsoluta,
  fatturaInsolutaDal,
  fatturaInsolutaNota,
  rallentato,
  rallentatoDal,
  rallentatoMotivo,
  dataRiattivazionePrevista,
}: {
  clienteId: number;
  fatturaInsoluta: boolean;
  fatturaInsolutaDal: string | null;
  fatturaInsolutaNota: string | null;
  rallentato: boolean;
  rallentatoDal: string | null;
  rallentatoMotivo: string | null;
  /** ★ NUOVA (2026-09-22, migrazione 0080, richiesta esplicita: "elenco dei
   * clienti in insoluto o da rallentare... con indicazione da parte del
   * reparto fatturazione di quando riattivarlo") — vedi anche l'elenco
   * aggregato /insoluti, dove lo stesso campo è modificabile per tutti i
   * clienti insieme; qui resta comunque editabile scheda per scheda. */
  dataRiattivazionePrevista: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [inCorsoData, startTransizioneData] = useTransition();
  const [bozzaData, setBozzaData] = useState(dataRiattivazionePrevista ?? "");

  function salvaData(nuovaData: string) {
    setBozzaData(nuovaData);
    startTransizioneData(async () => {
      const risultato = await impostaDataRiattivazionePrevista(clienteId, nuovaData || null);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-md">
      <h2 className="mb-3 flex items-center gap-2 font-heading text-sm font-bold">
        <AlertTriangle className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
        Stato cliente
      </h2>
      <div className="flex flex-col gap-4">
        <RigaStato
          icona={AlertTriangle}
          tono="critico"
          etichettaSpenta="Segna come insoluta"
          etichettaAccesa="Fattura insoluta"
          placeholderTesto="Nota (facoltativa)"
          attivo={fatturaInsoluta}
          dal={fatturaInsolutaDal}
          testo={fatturaInsolutaNota}
          onCambia={async (nuovoValore, testo) => {
            const risultato = await impostaFatturaInsolutaManuale(clienteId, nuovoValore, testo);
            if (risultato.errore) {
              toast(risultato.errore);
              return false;
            }
            toast(nuovoValore ? "Segnata come insoluta." : "Non più segnata come insoluta.", "successo");
            router.refresh();
            return true;
          }}
        />
        <RigaStato
          icona={Gauge}
          tono="avviso"
          etichettaSpenta="Segna da rallentare"
          etichettaAccesa="Cliente rallentato"
          placeholderTesto="Motivo (facoltativo)"
          attivo={rallentato}
          dal={rallentatoDal}
          testo={rallentatoMotivo}
          onCambia={async (nuovoValore, testo) => {
            const risultato = await impostaRallentato(clienteId, nuovoValore, testo);
            if (risultato.errore) {
              toast(risultato.errore);
              return false;
            }
            toast(nuovoValore ? "Cliente segnato come da rallentare." : "Rallentamento rimosso.", "successo");
            router.refresh();
            return true;
          }}
        />
        {(fatturaInsoluta || rallentato) && (
          <div className="flex items-center gap-2 rounded-xl border p-3">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.25} />
            <label className="text-xs font-semibold text-muted-foreground" htmlFor={`riattivazione-${clienteId}`}>
              Riattivare il
            </label>
            <input
              id={`riattivazione-${clienteId}`}
              type="date"
              value={bozzaData}
              disabled={inCorsoData}
              onChange={(e) => salvaData(e.target.value)}
              className="h-9 rounded-md border bg-background px-2.5 text-xs disabled:opacity-60"
            />
            {inCorsoData && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" strokeWidth={2.5} />}
          </div>
        )}
      </div>
    </div>
  );
}

function RigaStato({
  icona: Icona,
  tono,
  etichettaSpenta,
  etichettaAccesa,
  placeholderTesto,
  attivo,
  dal,
  testo,
  onCambia,
}: {
  icona: typeof AlertTriangle;
  tono: "critico" | "avviso";
  etichettaSpenta: string;
  etichettaAccesa: string;
  placeholderTesto: string;
  attivo: boolean;
  dal: string | null;
  testo: string | null;
  onCambia: (nuovoValore: boolean, testo: string | null) => Promise<boolean>;
}) {
  const [inCorso, startTransizione] = useTransition();
  // ★ il campo di testo si apre solo quando si sta per ACCENDERE il flag —
  // spegnerlo non chiede nulla, non è un'azione distruttiva da confermare.
  const [inserimentoAperto, setInserimentoAperto] = useState(false);
  const [bozzaTesto, setBozzaTesto] = useState("");

  function confermaAccensione() {
    startTransizione(async () => {
      const riuscito = await onCambia(true, bozzaTesto.trim() || null);
      if (riuscito) {
        setInserimentoAperto(false);
        setBozzaTesto("");
      }
    });
  }

  function spegni() {
    startTransizione(async () => {
      await onCambia(false, null);
    });
  }

  const coloreTono = tono === "critico" ? "text-critical" : "text-warning";
  const sfondoTono = tono === "critico" ? "bg-critical/10 border-critical/20" : "bg-warning/10 border-warning/20";

  if (attivo) {
    return (
      <div className={`rounded-xl border p-3 ${sfondoTono}`}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className={`flex items-center gap-1.5 text-xs font-bold ${coloreTono}`}>
            <Icona className="h-3.5 w-3.5" strokeWidth={2.5} />
            {etichettaAccesa}
          </span>
          <button
            type="button"
            onClick={spegni}
            disabled={inCorso}
            className="text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
          >
            {inCorso ? "..." : "Rimuovi"}
          </button>
        </div>
        {dal && <p className="text-[11px] text-muted-foreground">Dal {new Date(dal).toLocaleDateString("it-IT")}</p>}
        {testo && <p className="mt-1 text-xs">{testo}</p>}
      </div>
    );
  }

  if (inserimentoAperto) {
    return (
      <div className="rounded-xl border p-3">
        <textarea
          value={bozzaTesto}
          onChange={(e) => setBozzaTesto(e.target.value)}
          placeholder={placeholderTesto}
          rows={2}
          autoFocus
          className="w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
        />
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setInserimentoAperto(false)} disabled={inCorso} className="flex-1">
            Annulla
          </Button>
          <Button size="sm" onClick={confermaAccensione} disabled={inCorso} className="flex-1">
            {inCorso && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />}
            Conferma
          </Button>
        </div>
      </div>
    );
  }

  // ★ FIX (2026-09-16, "migliora visibilità stato cliente") — lo stato
  // "spento" era un link di testo grigio senza bordo né sfondo: accanto ai
  // badge pieni "Insoluta" nella tabella Fatture, spariva quasi del tutto
  // — si notava solo passandoci sopra per caso, non a colpo d'occhio come
  // il resto della scheda. Ora è un pulsante vero, a tutta larghezza, col
  // colore del tono (rosso/arancio) invece del solito grigio neutro.
  return (
    <button
      type="button"
      onClick={() => setInserimentoAperto(true)}
      className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition hover:brightness-95 ${sfondoTono} ${coloreTono}`}
    >
      <Icona className="h-4 w-4 shrink-0" strokeWidth={2.5} />
      {etichettaSpenta}
    </button>
  );
}
