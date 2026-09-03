import { ClipboardList } from "lucide-react";
import { getRapportiLavoro } from "./actions";
import { RapportiLavoroBoard } from "@/components/rapporti-lavoro/rapporti-lavoro-board";

// ★ NUOVA (2026-09-03, richiesta esplicita: "una volta salvato il rapporto
// di lavoro ho bisogno di poterci accedere per visionare tutti i dati
// fatti e anche ufficio fatturazione per fatturare" → precisata: "deve
// esserci un tab con i rapporti di lavoro divisi per tipologia") — pagina
// unica per rivedere ogni Scheda di Installazione/Lavorazione e ogni
// Rapportino già salvato, senza dover ritrovare il Ticket di partenza.
// Nessun gate di reparto: sotto Mondo Assistenza, visibile a chiunque
// (incluso l'ufficio Fatturazione) come le altre pagine di quel mondo.
export default async function RapportiLavoroPage() {
  const { schede, rapportini } = await getRapportiLavoro();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
          <ClipboardList className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Rapporti di Lavoro</h1>
          <p className="text-sm text-muted-foreground">Ogni Scheda di Installazione/Lavorazione e Rapportino salvato — con foto e materiali.</p>
        </div>
      </div>

      <RapportiLavoroBoard schede={schede} rapportini={rapportini} />
    </div>
  );
}
