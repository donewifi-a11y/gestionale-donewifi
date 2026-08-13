import { Skeleton } from "@/components/ui/skeleton";

/** ★ NUOVA — richiesta esplicita: solo la Dashboard aveva uno stato di
 * caricamento dedicato (`loading.tsx`) — le altre pagine restavano ferme
 * senza alcun segnale durante il fetch server-side, poi scattavano di
 * colpo al contenuto vero. Mattoncini condivisi invece di ridisegnare lo
 * scheletro da zero in ogni `loading.tsx`: l'intestazione (icona+titolo,
 * uguale ovunque) più due forme di contenuto (bacheca a colonne, o lista
 * di righe) — chi li usa sceglie solo quante colonne/righe mostrare. */
export function IntestazionePaginaScheletro({ conPulsante = true }: { conPulsante?: boolean }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3.5 w-56" />
        </div>
      </div>
      {conPulsante && <Skeleton className="h-9 w-32 rounded-md" />}
    </div>
  );
}

/** Bacheca a colonne (Ticket, Segnalazioni) — ogni colonna qualche card. */
export function BachecaScheletro({ colonne = 3, carte = 3 }: { colonne?: number; carte?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: `repeat(${colonne}, minmax(0, 1fr))` }}>
      {Array.from({ length: colonne }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-muted/50 p-3">
          <Skeleton className="mb-3 h-4 w-20" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: carte }).map((_, j) => (
              <div key={j} className="rounded-xl border bg-card p-3 shadow-sm">
                <Skeleton className="mb-2 h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Lista semplice (Preventivi, Materiali, Clienti, Persone, Archivio,
 * Richieste Clienti, Vista Tecnico) — righe orizzontali, una sotto l'altra. */
export function ListaScheletro({ righe = 6 }: { righe?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: righe }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5" style={{ width: `${55 - (i % 3) * 8}%` }} />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
