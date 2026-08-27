export type TonoSegnale = "info" | "critico" | "successo" | "avviso";

const STILE_TONO: Record<TonoSegnale, string> = {
  info: "bg-info/15 text-info ring-1 ring-info/40",
  critico: "bg-critical/10 text-critical",
  successo: "bg-success/10 text-success",
  avviso: "bg-warning/10 text-warning",
};

/**
 * ★ ESTRATTO (2026-08-27, richiesta esplicita: "rivedere il sistema di
 * notificazione come pulsa la notifica di documenti ricevuti" →
 * "estenderlo agli altri 6 eventi-cliente") — prima questo badge (colore
 * + un'eventuale animazione "pulsa", Tailwind `animate-pulse` sul badge
 * intero + un puntino "ping" stile WhatsApp/iOS) esisteva solo scritto a
 * mano dentro segnalazioni-board.tsx, per il caso "Dati ricevuti".
 * Estratto qui, identico, per riusarlo ovunque arrivi un evento generato
 * dal cliente che merita lo stesso trattamento — vedi tickets-board.tsx,
 * preventivi-board.tsx, richieste-clienti-board.tsx.
 */
export function SegnalePulsante({ testo, tono, pulsante }: { testo: string; tono: TonoSegnale; pulsante?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ${
        pulsante ? "bg-info/15 text-info ring-1 ring-info/40 animate-pulse" : STILE_TONO[tono]
      }`}
    >
      {pulsante && (
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-info" />
        </span>
      )}
      {testo}
    </span>
  );
}

/** Il segnale "pulsa" solo per un tempo limitato dopo l'evento (nessun
 * campo "visto" da aggiungere/spuntare a mano) — passata la finestra
 * resta comunque visibile lo stato di sempre, solo senza animazione:
 * l'informazione non sparisce, smette solo di richiedere attenzione
 * immediata. Stessa idea del "si ferma da solo quando la pratica avanza"
 * già in uso per "Dati ricevuti", applicata qui con una finestra di tempo
 * dove non esiste un passaggio di stato successivo su cui agganciarsi. */
export function entroOreDa(iso: string | null | undefined, ore: number): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < ore * 60 * 60 * 1000;
}
