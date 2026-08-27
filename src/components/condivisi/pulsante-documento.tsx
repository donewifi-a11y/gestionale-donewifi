"use client";

import { useState } from "react";
import { FileText, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/**
 * ★ NUOVA (2026-08-27, richiesta esplicita: "quando i clienti mi mandano
 * la documentazione dovrei avere la possibilità di scaricare le foto e
 * non doverle aprire sul browser e fare salva immagine, ma avere il
 * pulsante per scaricare") — prima ogni documento ricevuto da un cliente
 * (richieste_clienti.documenti) apriva solo una nuova scheda del browser:
 * per un'immagine, questo mostra la foto a schermo e l'operatore deve
 * fare "salva immagine con nome" a mano — un passaggio in più, non ovvio
 * su ogni browser/dispositivo. Ora un pulsante dedicato scarica il file
 * direttamente (via blob, non un semplice `<a download>` sul link firmato
 * — cross-origin, il browser lo ignorerebbe e aprirebbe comunque il
 * file). "Apri" resta disponibile separatamente per chi vuole solo dare
 * un'occhiata prima. Un solo componente condiviso al posto di 3 copie
 * quasi identiche (richieste-clienti-board.tsx, segnalazioni-board.tsx,
 * tickets-board.tsx) — ognuna passa la propria funzione server già in uso
 * lì per ottenere l'URL firmato (`urlDocumentoRichiesta`/`urlContratto`),
 * invece di introdurre un'action condivisa nuova con un rischio di
 * autorizzazione diverso da quello già verificato in ciascun punto.
 */
export function PulsanteDocumento({
  percorso,
  nome,
  etichetta,
  onOttieniUrl,
}: {
  percorso: string;
  /** Nome file usato per il download (attributo `download`) — non
   * necessariamente uguale a `etichetta`, che può includere un prefisso
   * (es. "Fronte CI — foto.jpg"). */
  nome: string;
  etichetta: string;
  onOttieniUrl: (percorso: string) => Promise<{ errore: string | null; url: string | null }>;
}) {
  const toast = useToast();
  const [scaricando, setScaricando] = useState(false);

  async function apri() {
    const risultato = await onOttieniUrl(percorso);
    if (risultato.errore || !risultato.url) {
      toast(risultato.errore || "Errore imprevisto.");
      return;
    }
    window.open(risultato.url, "_blank", "noopener,noreferrer");
  }

  async function scarica() {
    setScaricando(true);
    const risultato = await onOttieniUrl(percorso);
    if (risultato.errore || !risultato.url) {
      toast(risultato.errore || "Errore imprevisto.");
      setScaricando(false);
      return;
    }
    try {
      const risposta = await fetch(risultato.url);
      const blob = await risposta.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = nome;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      // ★ ripiego — se il fetch del blob fallisce (rete, CORS inatteso),
      // meglio aprire comunque il file (l'operatore può ancora salvarlo a
      // mano) che restare con un pulsante che non fa nulla.
      window.open(risultato.url, "_blank", "noopener,noreferrer");
    }
    setScaricando(false);
  }

  return (
    <div className="flex items-stretch gap-1.5">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-auto min-h-11 flex-1 justify-start py-2 whitespace-normal"
        onClick={apri}
      >
        <FileText className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        <span className="text-left break-all">{etichetta}</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-auto min-h-11 w-11 shrink-0 p-0"
        onClick={scarica}
        disabled={scaricando}
        aria-label={`Scarica ${nome}`}
        title="Scarica"
      >
        {scaricando ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} /> : <Download className="h-3.5 w-3.5" strokeWidth={2.25} />}
      </Button>
    </div>
  );
}
