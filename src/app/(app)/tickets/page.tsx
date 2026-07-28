import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { TicketsBoard } from "@/components/tickets/tickets-board";
import type { Ticket } from "@/lib/types";

export default async function TicketsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: tickets } = await supabase
    .from("tickets")
    .select("*")
    .neq("stato", "Annullato")
    .order("data_creazione", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">🎫 Ticket</h1>
          <p className="text-muted-foreground">Assistenza, pratiche commerciali e amministrative.</p>
        </div>
        <Link href="/tickets/nuovo">
          <Button>➕ Nuovo Ticket</Button>
        </Link>
      </div>

      <TicketsBoard tickets={(tickets as Ticket[]) ?? []} currentUserId={user?.id ?? ""} />
    </div>
  );
}
