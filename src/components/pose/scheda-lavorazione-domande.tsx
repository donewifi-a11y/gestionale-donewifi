"use client";

import { useEffect, useState } from "react";
import { FirmaClienteScheda } from "@/components/schede/firma-cliente-scheda";
import { SelettoreMateriali } from "@/components/schede/selettore-materiali";
import { DomandaWizard, type Domanda } from "@/components/pose/domanda-wizard";
import { TileScelta, TileMultiScelta, AreaGrande } from "@/components/pose/tile-scelta";
import { salvaSchedaLavoroEsterno, getTipologiaClientePerAppuntamentoEsterno } from "@/app/pose/actions";
import type { FirmaClienteApprovata } from "@/app/(app)/calendario/actions";
import { leggiBozzaScheda, salvaBozzaScheda, cancellaBozzaScheda } from "@/lib/bozza-scheda";
import { INTERVENTI_RAPIDI, ESITI_INTERVENTO } from "@/lib/types";
import type { MaterialeMagazzino, MaterialeUsato } from "@/lib/types";

interface BozzaLavorazione {
  interventi: string[]; materiali: MaterialeUsato[]; esito: string;
  metodoPagamento: "Contanti" | "POS" | "In Fattura" | null; note: string;
}

/** ★ NUOVA (2026-08-26) — equivalente di SchedaLavorazioneForm
 * (schede/scheda-lavorazione-form.tsx) per pose.donewifi.it, "una domanda
 * alla volta" invece di 4 passi con più campi — stesso principio di
 * SchedaInstallazioneDomande, vedi quel commento. */
export function SchedaLavorazioneDomande({
  appuntamentoId,
  catalogoMateriali,
  onSalvato,
  onAnnulla,
}: {
  appuntamentoId: string;
  catalogoMateriali: MaterialeMagazzino[];
  onSalvato: () => void;
  onAnnulla: () => void;
}) {
  const chiaveBozza = `lavorazione:${appuntamentoId}`;
  const bozza = leggiBozzaScheda<BozzaLavorazione>(chiaveBozza);

  const [inCorso, setInCorso] = useState(false);
  const [erroreInvio, setErroreInvio] = useState("");
  const [materiali, setMateriali] = useState<MaterialeUsato[]>(bozza?.materiali ?? []);
  const [interventi, setInterventi] = useState<string[]>(bozza?.interventi ?? []);
  const [esito, setEsito] = useState(bozza?.esito ?? "");
  const [metodoPagamento, setMetodoPagamento] = useState<BozzaLavorazione["metodoPagamento"]>(bozza?.metodoPagamento ?? "Contanti");
  const [note, setNote] = useState(bozza?.note ?? "");
  const [firmaCliente, setFirmaCliente] = useState<FirmaClienteApprovata | null>(null);
  const [tipoClienteTicket, setTipoClienteTicket] = useState<"Privato" | "Business" | null>(null);
  useEffect(() => {
    getTipologiaClientePerAppuntamentoEsterno(appuntamentoId).then(setTipoClienteTicket);
  }, [appuntamentoId]);

  useEffect(() => {
    salvaBozzaScheda<BozzaLavorazione>(chiaveBozza, { interventi, materiali, esito, metodoPagamento, note });
  }, [chiaveBozza, interventi, materiali, esito, metodoPagamento, note]);

  async function invia() {
    setErroreInvio("");
    setInCorso(true);
    const risultato = await salvaSchedaLavoroEsterno(
      appuntamentoId,
      "Lavorazione tecnica",
      { esito, note, metodoPagamentoPosa: metodoPagamento, materiali, firmaCliente: firmaCliente!, interventiEseguiti: interventi },
      []
    );
    setInCorso(false);
    if (risultato.errore) { setErroreInvio(risultato.errore); return; }
    cancellaBozzaScheda(chiaveBozza);
    onSalvato();
  }

  const domande: Domanda[] = [
    {
      domanda: "Cosa hai fatto sul posto?",
      aiuto: "Puoi sceglierne anche più di uno.",
      contenuto: <TileMultiScelta opzioni={INTERVENTI_RAPIDI} valore={interventi} onChange={setInterventi} />,
    },
    {
      domanda: "Hai usato materiali o consumi?",
      contenuto: <SelettoreMateriali catalogo={catalogoMateriali} valore={materiali} onChange={setMateriali} tipoClienteIniziale={tipoClienteTicket} />,
    },
    {
      domanda: "Come ha pagato la posa?",
      contenuto: (
        <TileScelta opzioni={["Contanti", "POS", "In Fattura"]} valore={metodoPagamento ?? ""} onChange={(v) => setMetodoPagamento(v as BozzaLavorazione["metodoPagamento"])} />
      ),
    },
    {
      domanda: "Com'è andato l'intervento?",
      valida: () => (esito ? null : "Scegli un esito prima di continuare."),
      contenuto: <TileScelta opzioni={ESITI_INTERVENTO} valore={esito} onChange={setEsito} />,
    },
    {
      domanda: "Vuoi aggiungere una nota per la sede centrale?",
      aiuto: "Facoltativa — dettagli tecnici, dati segnale, anomalie riscontrate.",
      contenuto: <AreaGrande placeholder="Scrivi qui..." value={note} onChange={(e) => setNote(e.target.value)} />,
    },
    {
      domanda: "Il cliente conferma l'intervento?",
      aiuto: "Un codice a 6 cifre arriva via email — il cliente lo legge ad alta voce, tu lo digiti.",
      valida: () => (firmaCliente ? null : "Conferma la firma del cliente prima di continuare."),
      contenuto: <FirmaClienteScheda riferimento={{ tipo: "appuntamento", id: appuntamentoId }} value={firmaCliente} onChange={setFirmaCliente} />,
    },
  ];

  return (
    <DomandaWizard
      domande={domande}
      inCorso={inCorso}
      erroreInvio={erroreInvio}
      testoInvio="Invia rapporto e completa"
      onAnnulla={onAnnulla}
      onInvia={invia}
    />
  );
}
