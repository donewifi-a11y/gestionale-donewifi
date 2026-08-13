import { ClipboardList } from "lucide-react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, personaHaAccessoAdmin } from "@/lib/persona";
import { LavorazioniBoard } from "@/components/lavorazioni/lavorazioni-board";
import type { LavorazioneInterna } from "@/lib/types";

// ★ NUOVA — richiesta esplicita: lavorazioni interne (Rete/Ufficio),
// assegnabili da un amministratore ad altro staff — vedi migrazione
// 0053_lavorazioni_interne.sql. Un amministratore vede tutte le
// lavorazioni di tutti (service role, bypassa la RLS che altrimenti
// limiterebbe a "assegnato_a/assegnato_da = se stesso" — vedi commento
// nella migrazione sul perché non esiste una policy RLS più larga per
// questo); un utente normale vede solo le proprie tramite il client
// normale, la RLS fa il resto.
export default async function LavorazioniPage() {
  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  const isAdmin = personaHaAccessoAdmin(persona);
  const personaCorrenteId = await getPersonaCorrenteId();

  const client = isAdmin ? createServiceClient() : supabase;
  const { data: lavorazioni } = await client
    .from("lavorazioni_interne")
    .select("*")
    .order("creato_il", { ascending: false });

  const { data: persone } = await supabase.from("persone").select("id, nome, attivo, amministratore, reparti").eq("attivo", true).order("nome");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <ClipboardList className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Lavorazioni Interne</h1>
          <p className="text-sm text-muted-foreground">
            Rete (ponti radio, BS, postazioni) e Ufficio — non pratiche cliente.
          </p>
        </div>
      </div>

      <LavorazioniBoard
        lavorazioni={(lavorazioni as LavorazioneInterna[]) ?? []}
        persone={persone ?? []}
        currentPersonaId={personaCorrenteId ?? ""}
        isAdmin={isAdmin}
      />
    </div>
  );
}
