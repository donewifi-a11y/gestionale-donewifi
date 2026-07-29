import { Users2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ClientiBoard } from "@/components/clienti/clienti-board";
import type { Ticket } from "@/lib/types";

export default async function ClientiPage() {
  const supabase = await createClient();

  const { data: tickets } = await supabase
    .from("tickets")
    .select("*")
    .order("data_creazione", { ascending: false });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <Users2 className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Clienti</h1>
          <p className="text-sm text-muted-foreground">Registro clienti, ricavato dallo storico dei Ticket.</p>
        </div>
      </div>

      <ClientiBoard tickets={(tickets as Ticket[]) ?? []} />
    </div>
  );
}
