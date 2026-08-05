"use client";

import { ChatPanel } from "@/components/chat/chat-panel";

/** ★ SEMPLIFICATO — non più un pulsante flottante sempre visibile
 * (l'utente lo ha segnalato come "troppi pulsanti in giro"): ora è un
 * pop-up controllato dall'esterno (richiamato dalla sidebar, vedi
 * app-shell.tsx), invisibile finché `aperto` non è vero. Il contenuto vero
 * e proprio vive in `ChatPanel`, condiviso con il riquadro fisso in home. */
export function ChatWidget({
  personaCorrenteId,
  aperto,
  onChiudi,
}: {
  personaCorrenteId: string | null;
  aperto: boolean;
  onChiudi: () => void;
}) {
  if (!aperto || !personaCorrenteId) return null;
  return (
    <div className="fixed bottom-5 right-5 z-40 print:hidden">
      <ChatPanel personaCorrenteId={personaCorrenteId} onChiudi={onChiudi} variant="popup" />
    </div>
  );
}
