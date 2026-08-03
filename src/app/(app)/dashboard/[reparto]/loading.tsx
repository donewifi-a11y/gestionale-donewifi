import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardRepartoLoading() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-3.5 w-48" />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-card p-3.5 shadow-sm">
            <Skeleton className="mb-2 h-4 w-4" />
            <Skeleton className="mb-1.5 h-7 w-10" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl border bg-card p-5 shadow-md">
            <Skeleton className="mb-4 h-4 w-40" />
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex items-center gap-3">
                  <Skeleton className="h-3 w-24 shrink-0" />
                  <Skeleton className="h-3" style={{ width: `${90 - j * 15}%` }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
