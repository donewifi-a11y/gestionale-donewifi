import { Boxes } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MaterialiBoard } from "@/components/materiali/materiali-board";
import type { MaterialeMagazzino } from "@/lib/types";

export default async function MaterialiPage() {
  const supabase = await createClient();
  const { data: materiali } = await supabase.from("materiali_magazzino").select("*").order("ordine", { ascending: true });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <Boxes className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Materiali</h1>
          <p className="text-sm text-muted-foreground">
            Catalogo prezzi (cavi, alimentatori, antenne...) usato nelle Schede di Installazione e Lavorazione Tecnica.
          </p>
        </div>
      </div>

      <MaterialiBoard materiali={(materiali as MaterialeMagazzino[]) ?? []} />
    </div>
  );
}
