import { CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CalendarioBoard } from "@/components/calendario/calendario-board";
import type { Appuntamento } from "@/lib/types";

export default async function CalendarioPage() {
  const supabase = await createClient();

  const inizioSettimanaFa = new Date();
  inizioSettimanaFa.setDate(inizioSettimanaFa.getDate() - 7);

  const { data: appuntamenti } = await supabase
    .from("appuntamenti")
    .select("*")
    .gte("data_ora", inizioSettimanaFa.toISOString())
    .order("data_ora", { ascending: true });

  const { data: persone } = await supabase.from("persone").select("id, nome, attivo, area_accesso").eq("attivo", true);

  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, numero, cliente, indirizzo")
    .not("stato", "in", "(Completato,Annullato)")
    .order("data_creazione", { ascending: false });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <CalendarDays className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Calendario</h1>
          <p className="text-sm text-muted-foreground">Appuntamenti e installazioni programmate.</p>
        </div>
      </div>

      <CalendarioBoard
        appuntamenti={(appuntamenti as Appuntamento[]) ?? []}
        persone={persone ?? []}
        ticket={ticket ?? []}
      />
    </div>
  );
}
