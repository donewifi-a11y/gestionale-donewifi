import { HardHat, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrenteId } from "@/lib/persona";
import { VistaTecnicoBoard } from "@/components/vista-tecnico/vista-tecnico-board";
import type { Appuntamento, Ticket } from "@/lib/types";

export default async function VistaTecnicoPage() {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();

  const oraInizio = new Date();
  oraInizio.setHours(0, 0, 0, 0);
  const oraFine = new Date();
  oraFine.setHours(23, 59, 59, 999);

  const [{ data: appuntamenti }, { data: tickets }, { data: completatiOggi }] = await Promise.all([
    supabase
      .from("appuntamenti")
      .select("*")
      .eq("tecnico_id", personaId ?? "")
      .eq("stato", "Programmato")
      .gte("data_ora", oraInizio.toISOString())
      .order("data_ora", { ascending: true }),
    supabase
      .from("tickets")
      .select("*")
      .eq("tecnico_assegnato", personaId ?? "")
      .not("stato", "in", "(Completato,Annullato)")
      .order("data_creazione", { ascending: false }),
    supabase
      .from("tickets")
      .select("*")
      .eq("tecnico_assegnato", personaId ?? "")
      .eq("stato", "Completato")
      .gte("aggiornato_il", oraInizio.toISOString())
      .lte("aggiornato_il", oraFine.toISOString())
      .order("aggiornato_il", { ascending: false }),
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

      {!personaId ? (
        <div className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          Seleziona prima &quot;Tu sei&quot; dal menu in basso a sinistra per vedere i tuoi appuntamenti e ticket.
        </div>
      ) : (
        <VistaTecnicoBoard
          appuntamenti={(appuntamenti as Appuntamento[]) ?? []}
          tickets={(tickets as Ticket[]) ?? []}
          completatiOggi={(completatiOggi as Ticket[]) ?? []}
        />
      )}
    </div>
  );
}
