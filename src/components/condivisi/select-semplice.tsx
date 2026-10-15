/**
 * ★ NUOVA (2026-10-15, Fase D — richiesta esplicita: "ridurre le
 * differenze inutili" tra i Select del gestionale) — prima esistevano DUE
 * implementazioni quasi identiche di un `<select>` nativo fatte in casa,
 * una in tickets-board.tsx (filtri Ticket) e una in
 * scheda-installazione-form.tsx (campi struttura/rete), oltre a un terzo
 * componente Select mai usato da nessuna parte del progetto
 * (`src/components/ui/select.tsx`, shadcn/Radix — vedi nota sotto sul
 * perché non è stato adottato come riferimento).
 *
 * Le due varianti fatte in casa avevano una differenza di comportamento
 * REALE, non solo estetica, da preservare: in Tickets il placeholder
 * ("Tutti gli stati" ecc.) è un'opzione selezionabile — rappresenta "nessun
 * filtro", uno stato valido a cui tornare in ogni momento. Nella Scheda
 * Installazione, "Seleziona..." è un placeholder DISABILITATO — il campo è
 * obbligatorio, non deve restare un'opzione a cui tornare dopo aver scelto
 * un valore vero. `placeholderSelezionabile` (default `true`, il
 * comportamento più diffuso) copre entrambi i casi senza perderne nessuno.
 *
 * ★ Perché non il Select shadcn/Radix (`ui/select.tsx`) come riferimento:
 * verificato che non è importato da NESSUN file del progetto — adottarlo
 * avrebbe richiesto riscrivere ciascuno dei 7 punti d'uso (qui sotto) con
 * la sintassi a componenti multipli di Radix (Select/SelectTrigger/
 * SelectContent/SelectItem...), una superficie di modifica molto più ampia
 * per un beneficio concreto non dimostrato: un `<select>` nativo ha già
 * navigazione da tastiera completa (frecce, Home/End, ricerca per lettera,
 * Esc) e il selettore nativo del sistema operativo su mobile, che un
 * listbox custom ricostruirebbe solo in modo peggiore. L'incoerenza reale
 * trovata nell'audit era visiva/di etichettatura, non di accessibilità da
 * tastiera — risolta qui senza toccare il design system.
 */
export function SelectSemplice({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  placeholderSelezionabile = true,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
  /** Nome accessibile per screen reader — il placeholder da solo non basta
   * (è solo la prima opzione, indistinguibile dal valore scelto una volta
   * cambiato). Facoltativo: i chiamanti che non lo passano restano
   * invariati rispetto a prima. */
  ariaLabel?: string;
  /** `false` per un campo obbligatorio dove il placeholder non deve poter
   * essere riselezionato dopo una scelta valida (vedi commento sopra). */
  placeholderSelezionabile?: boolean;
  /** Facoltativo: senza, resta lo stile compatto già in uso nei filtri
   * Ticket. Chi ha bisogno di un aspetto diverso (es. campo a piena
   * larghezza in un form) lo passa esplicitamente. */
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={className ?? "h-9 rounded-md border bg-background px-3 text-sm"}
    >
      <option value="" disabled={!placeholderSelezionabile}>
        {placeholder}
      </option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
