"use client";

import { useEffect, useState } from "react";
import { ClipboardCheck, Wrench, Package, Euro, Camera, Mail } from "lucide-react";
import { DomandaWizard, type Domanda } from "@/components/pose/domanda-wizard";
import { AreaGrande, CampoGrande, FotoInputMulti } from "@/components/pose/tile-scelta";
import { completaTicketConRapportinoEsterno } from "@/app/pose/actions";
import { caricaFotoScheda } from "@/lib/carica-foto-scheda";
import { leggiBozzaScheda, salvaBozzaScheda, cancellaBozzaScheda } from "@/lib/bozza-scheda";
import type { StatoTicket } from "@/lib/types";

interface BozzaRapportino {
  esito: string;
  lavoriSvolti: string;
  materiali: string;
  importoFatturato: string;
}

// ★ NUOVA (2026-10-08, audit d'oro gestionale, seguito — richiesta esplicita
// "procedi") — equivalente di SchedaLavorazioneDomande/SchedaInstallazioneDomande
// ma per il rapportino di chiusura di un Ticket assegnato direttamente (non
// tramite appuntamento/Scheda di Lavoro): sostituisce RapportinoFormEsterno
// (rapportino-form.tsx, rimossa — era un form classico con 5 campi tutti
// sulla stessa schermata, l'unico dei due flussi di chiusura su
// pose.donewifi.it a NON usare il motore "una domanda alla volta",
// introdotto esplicitamente per essere più semplice "per persone non più
// giovani", vedi domanda-wizard.tsx). Stesso tecnico, stesso turno, due
// logiche di compilazione diverse per due attività quasi identiche
// (chiudere un lavoro sul campo) — qui uniformate.
export function RapportinoDomande({
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
  const chiaveBozza = `rapportino:${ticketId}`;
  const bozza = leggiBozzaScheda<BozzaRapportino>(chiaveBozza);

  const [inCorso, setInCorso] = useState(false);
  const [erroreInvio, setErroreInvio] = useState("");
  const [esito, setEsito] = useState(bozza?.esito ?? "");
  const [lavoriSvolti, setLavoriSvolti] = useState(bozza?.lavoriSvolti ?? "");
  const [materiali, setMateriali] = useState(bozza?.materiali ?? "");
  const [importoFatturato, setImportoFatturato] = useState(bozza?.importoFatturato ?? "");
  const [foto, setFoto] = useState<File[]>([]);

  useEffect(() => {
    salvaBozzaScheda<BozzaRapportino>(chiaveBozza, { esito, lavoriSvolti, materiali, importoFatturato });
  }, [chiaveBozza, esito, lavoriSvolti, materiali, importoFatturato]);

  async function invia() {
    setErroreInvio("");
    setInCorso(true);
    // ★ stesso motivo del try/catch già usato nel vecchio form (vedi sopra) — le
    // foto grezze da fotocamera superavano il limite di default di 1MB di
    // Next.js se passate nel corpo della Server Action; caricate qui,
    // direttamente dal browser allo storage, prima di chiamare l'azione.
    try {
      const fotoCaricate = await Promise.all(foto.map((f) => caricaFotoScheda(f, ticketId)));
      const risultato = await completaTicketConRapportinoEsterno(ticketId, statoVecchio, { esito, lavoriSvolti, materiali, importoFatturato }, fotoCaricate);
      if (risultato.errore) {
        setErroreInvio(risultato.errore);
        return;
      }
      cancellaBozzaScheda(chiaveBozza);
      onSalvato();
    } catch (err) {
      console.error("invia() - errore imprevisto durante il salvataggio rapportino:", err);
      setErroreInvio("Errore imprevisto durante il salvataggio — ricarica la pagina e riprova.");
    } finally {
      setInCorso(false);
    }
  }

  const domande: Domanda[] = [
    {
      domanda: "Com'è andato l'intervento?",
      categoria: "note",
      icona: <ClipboardCheck className="h-6 w-6" strokeWidth={2.25} />,
      aiuto: "L'esito dell'intervento — obbligatorio.",
      valida: () => (esito.trim() ? null : "L'esito dell'intervento è obbligatorio."),
      contenuto: <AreaGrande placeholder="Scrivi qui..." value={esito} onChange={(e) => setEsito(e.target.value)} />,
    },
    {
      domanda: "Cosa hai fatto sul posto? (facoltativo)",
      categoria: "note",
      icona: <Wrench className="h-6 w-6" strokeWidth={2.25} />,
      contenuto: <AreaGrande placeholder="Scrivi qui..." value={lavoriSvolti} onChange={(e) => setLavoriSvolti(e.target.value)} />,
    },
    {
      domanda: "Hai usato materiali? (facoltativo)",
      categoria: "materiali",
      icona: <Package className="h-6 w-6" strokeWidth={2.25} />,
      contenuto: <AreaGrande placeholder="Scrivi qui..." value={materiali} onChange={(e) => setMateriali(e.target.value)} />,
    },
    {
      domanda: "Quanto hai fatturato? (facoltativo)",
      categoria: "pagamento",
      icona: <Euro className="h-6 w-6" strokeWidth={2.25} />,
      aiuto: "In euro — lascia vuoto se niente da fatturare.",
      contenuto: <CampoGrande type="number" step="0.01" min="0" inputMode="decimal" placeholder="0,00" value={importoFatturato} onChange={(e) => setImportoFatturato(e.target.value)} />,
    },
    {
      domanda: "Foto dell'intervento? (facoltative)",
      categoria: "foto",
      icona: <Camera className="h-6 w-6" strokeWidth={2.25} />,
      contenuto: <FotoInputMulti value={foto} onChange={setFoto} etichetta="Scatta o scegli una o più foto" />,
    },
  ];

  return (
    <>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Rapportino di chiusura — Intervento #{ticketNumero}</p>
      {/* ★ SEMPLIFICATA (eredita dal vecchio form) — il cliente riceve
      comunque il riepilogo via email, non serve una sua conferma per
      chiudere. */}
      <p className="mb-3 flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        Il cliente riceverà via email il riepilogo al termine.
      </p>
      <DomandaWizard domande={domande} inCorso={inCorso} erroreInvio={erroreInvio} testoInvio="Completa e salva rapportino" onAnnulla={onAnnulla} onInvia={invia} />
    </>
  );
}
