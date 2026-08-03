import { Badge } from "@/components/ui/badge";

// ★ un solo posto per i colori di tutti gli "stato" del gestionale — prima
// ogni componente aveva la sua mappa/i suoi span a mano (COLORE_PRIORITA
// in tickets-board.tsx, lo span inline in calendario-board.tsx, i badge
// Attivo/Non attivo ripetuti in clienti-esterni/persone/tariffe/utenti...),
// con la stessa idea di stato che finiva colorata in modo leggermente
// diverso da un componente all'altro. Le chiavi sono i valori di stato
// reali già usati nel database/UI (in italiano, come il resto del
// progetto) — nessuna traduzione/mappatura aggiuntiva da mantenere.
const STILI_STATO: Record<string, string> = {
  // Ticket — stato del flusso di lavorazione
  "Da gestire": "bg-muted text-muted-foreground border-transparent",
  "In lavorazione": "bg-primary/10 text-primary border-primary/20",
  "In attesa": "bg-warning/10 text-warning border-warning/20",
  Completato: "bg-success/10 text-success border-success/20",
  Annullato: "bg-muted text-muted-foreground border-transparent",

  // Ticket — priorità
  Urgente: "bg-critical/10 text-critical border-critical/20",
  Normale: "bg-warning/10 text-warning border-warning/20",
  Bassa: "bg-success/10 text-success border-success/20",

  // Segnalazioni
  "Da Contattare": "bg-muted text-muted-foreground border-transparent",
  "In Contatto": "bg-primary/10 text-primary border-primary/20",
  "Gestione Cliente": "bg-warning/10 text-warning border-warning/20",
  Trasmessa: "bg-success/10 text-success border-success/20",

  // Appuntamenti
  Programmato: "bg-primary/10 text-primary border-primary/20",

  // Appuntamenti — tipo di servizio (cosa fa l'installatore sul posto)
  "Nuova installazione": "bg-accent text-accent-foreground border-accent",
  "Lavorazione tecnica": "bg-warning/10 text-warning border-warning/20",

  // Fatture
  Pagata: "bg-success/10 text-success border-success/20",
  Insoluta: "bg-critical/10 text-critical border-critical/20",

  // Attivo/disattivo — persone, clienti, tariffe
  Attivo: "bg-success/10 text-success border-success/20",
  Attiva: "bg-success/10 text-success border-success/20",
  "Non attivo": "bg-muted text-muted-foreground border-transparent",
  "Non sottoscrivibile": "bg-muted text-muted-foreground border-transparent",
  Disattivato: "bg-muted text-muted-foreground border-transparent",

  // Promozioni
  Programmata: "bg-primary/10 text-primary border-primary/20",
  Scaduta: "bg-muted text-muted-foreground border-transparent",
};

const STILE_DEFAULT = "bg-muted text-muted-foreground border-transparent";

/** Badge colorato per un valore di stato — stessa combinazione testo/sfondo
 * ovunque compaia lo stesso stato nel gestionale. Uno stato non presente
 * nella mappa (es. un reparto o un valore libero) ricade su un grigio
 * neutro invece di rompere il rendering. */
export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={`${STILI_STATO[status] ?? STILE_DEFAULT} ${className}`}>
      {status}
    </Badge>
  );
}
