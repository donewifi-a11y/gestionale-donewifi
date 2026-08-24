import { CheckCircle2, XCircle, Clock3, type LucideIcon } from "lucide-react";

// ★ FIX (2026-08, controllo d'oro) — la mappa icona/colore "ok/no/attesa"
// era scritta due volte quasi identica: StatoTraccia (tickets-board.tsx,
// riga estesa nel pannello Ticket) e PallinoTraccia (richieste-clienti-board.tsx,
// pillola compatta in bacheca) — stesso concetto (Subentro: vecchio/nuovo
// cliente ha confermato/rifiutato/è in attesa), due copie della stessa
// logica. Qui resta solo la parte davvero duplicata (icona + colore per
// stato); il layout (riga larga vs pillola piccola) resta specifico di
// ciascun componente, sono contesti visivamente diversi.
export type StatoTraccia = "ok" | "no" | "attesa";

export const CONFIG_STATO_TRACCIA: Record<StatoTraccia, { icona: LucideIcon; classi: string }> = {
  ok: { icona: CheckCircle2, classi: "bg-success/10 text-success" },
  no: { icona: XCircle, classi: "bg-critical/10 text-critical" },
  attesa: { icona: Clock3, classi: "bg-muted text-muted-foreground" },
};
