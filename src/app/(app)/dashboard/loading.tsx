import { Skeleton } from "@/components/ui/skeleton";

// ★ mostrato automaticamente da Next.js (Suspense di routing) finché la
// Dashboard — un Server Component che legge da Supabase durante il render —
// non ha finito di caricare i dati, al posto dei numeri a 0 che si
// vedevano per un istante prima che i dati reali arrivassero.
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-3.5 w-56" />
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-card p-3.5 shadow-sm">
            <Skeleton className="mb-2 h-4 w-4" />
            <Skeleton className="mb-1.5 h-7 w-10" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>

      <PannelloScheletro righe={4} />
      <PannelloScheletro righe={3} />
      <PannelloScheletro righe={5} />
    </div>
  );
}

function PannelloScheletro({ righe }: { righe: number }) {
  return (
    <div className="mb-5 rounded-2xl border bg-card p-5 shadow-md">
      <Skeleton className="mb-4 h-4 w-48" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: righe }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-3 w-24 shrink-0" />
            <Skeleton className="h-3" style={{ width: `${100 - i * 12}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
