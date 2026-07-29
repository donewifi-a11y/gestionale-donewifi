import { Archive } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ArchivioBoard } from "@/components/archivio/archivio-board";
import type { Segnalazione, Ticket } from "@/lib/types";

export default async function ArchivioPage() {
  const supabase = await createClient();

  const { data: tickets } = await supabase
    .from("tickets")
    .select("*")
    .in("stato", ["Completato", "Annullato"])
    .order("data_creazione", { ascending: false });

  const { data: segnalazioni } = await supabase
    .from("segnalazioni")
    .select("*")
    .eq("stato", "Trasmessa")
    .order("data", { ascending: false });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <Archive className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Archivio</h1>
          <p className="text-sm text-muted-foreground">Ticket chiusi e Segnalazioni trasmesse — riferimento storico.</p>
        </div>
      </div>

      <ArchivioBoard tickets={(tickets as Ticket[]) ?? []} segnalazioni={(segnalazioni as Segnalazione[]) ?? []} />
    </div>
  );
}
