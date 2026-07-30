import { Tags } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { TariffeBoard } from "@/components/tariffe/tariffe-board";
import type { Promozione, Tariffa } from "@/lib/types";

export default async function TariffePage() {
  const supabase = await createClient();
  const [{ data: tariffe }, { data: promozioni }] = await Promise.all([
    supabase.from("tariffe").select("*").order("ordine", { ascending: true }),
    supabase.from("promozioni").select("*").order("da", { ascending: false }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <Tags className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Tariffe</h1>
          <p className="text-sm text-muted-foreground">
            Il catalogo che il cliente vede nello step &quot;scegli il tuo piano&quot; di Richiesta Dati.
          </p>
        </div>
      </div>

      <TariffeBoard tariffe={(tariffe as Tariffa[]) ?? []} promozioni={(promozioni as Promozione[]) ?? []} />
    </div>
  );
}
