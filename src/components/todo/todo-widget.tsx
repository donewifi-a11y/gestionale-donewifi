"use client";

import { TodoPanel } from "@/components/todo/todo-panel";

/** ★ SEMPLIFICATO — vedi chat-widget.tsx per lo stesso ragionamento: non
 * più un pulsante flottante sempre visibile, ora un pop-up controllato
 * dall'esterno (richiamato dalla sidebar). Il contenuto vive in
 * `TodoPanel`, condiviso con il riquadro fisso in home. */
export function TodoWidget({
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
    <div className="fixed bottom-5 left-5 z-40 print:hidden">
      <TodoPanel personaCorrenteId={personaCorrenteId} onChiudi={onChiudi} variant="popup" />
    </div>
  );
}
