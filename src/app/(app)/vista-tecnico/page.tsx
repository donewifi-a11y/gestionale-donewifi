import { HardHat } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { VistaTecnicoBoard } from "@/components/vista-tecnico/vista-tecnico-board";
import type { Appuntamento, Ticket } from "@/lib/types";

export default async function VistaTecnicoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const oraInizio = new Date();
  oraInizio.setHours(0, 0, 0, 0);

  const [{ data: appuntamenti }, { data: tickets }] = await Promise.all([
    supabase
      .from("appuntamenti")
      .select("*")
      .eq("tecnico_id", user?.id ?? "")
      .eq("stato", "Programmato")
      .gte("data_ora", oraInizio.toISOString())
      .order("data_ora", { ascending: true }),
    supabase
      .from("tickets")
      .select("*")
      .eq("tecnico_assegnato", user?.id ?? "")
      .not("stato", "in", "(Completato,Annullato)")
      .order("data_creazione", { ascending: false }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <HardHat className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Vista Tecnico</h1>
          <p className="text-sm text-muted-foreground">Solo quello che è tuo, per oggi.</p>
        </div>
      </div>

      <VistaTecnicoBoard appuntamenti={(appuntamenti as Appuntamento[]) ?? []} tickets={(tickets as Ticket[]) ?? []} />
    </div>
  );
}
