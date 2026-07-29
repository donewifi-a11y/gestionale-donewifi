import Link from "next/link";
import { Ticket as TicketIcon, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrenteId } from "@/lib/persona";
import { Button } from "@/components/ui/button";
import { TicketsBoard } from "@/components/tickets/tickets-board";
import type { Ticket } from "@/lib/types";

export default async function TicketsPage() {
  const supabase = await createClient();

  const { data: tickets } = await supabase
    .from("tickets")
    .select("*")
    .neq("stato", "Annullato")
    .order("data_creazione", { ascending: false });

  const { data: persone } = await supabase.from("persone").select("id, nome, attivo").eq("attivo", true);
  const personaCorrenteId = await getPersonaCorrenteId();

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
            <TicketIcon className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Ticket</h1>
            <p className="text-sm text-muted-foreground">Assistenza, pratiche commerciali e amministrative.</p>
          </div>
        </div>
        <Link href="/tickets/nuovo">
          <Button>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Nuovo Ticket
          </Button>
        </Link>
      </div>

      <TicketsBoard
        tickets={(tickets as Ticket[]) ?? []}
        currentPersonaId={personaCorrenteId ?? ""}
        persone={persone ?? []}
      />
    </div>
  );
}
