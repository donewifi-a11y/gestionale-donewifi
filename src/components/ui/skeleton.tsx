import { cn } from "@/lib/utils";

/** Sagoma grigia animata (pulse) per gli stati di caricamento — un
 * mattoncino generico, dimensioni/forma decise da chi lo usa via className. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

export { Skeleton };
