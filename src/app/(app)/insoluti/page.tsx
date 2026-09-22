import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin, personaVedeReparto } from "@/lib/persona";
import { getElencoInsolutiRallentati } from "@/app/(app)/clienti-esterni/actions";
import { InsolutiBoard } from "@/components/insoluti/insoluti-board";

// ★ NUOVA (2026-09-22, richiesta esplicita: "avrei bisogno di avere un
// elenco dei clienti in insoluto o da rallentare da poter consultare, con
// indicazione da parte del reparto fatturazione di quando riattivarlo
// perché ha pagato") — i due flag manuali (fattura_insoluta_manuale/
// rallentato, migrazione 0076) esistevano già, ma erano consultabili solo
// uno alla volta dalla scheda del singolo cliente: nessun modo per
// Fatturazione di vedere l'elenco completo in un colpo d'occhio. Pagina
// riservata a Fatturazione/Admin, stesso schema di /sistema (redirect, non
// solo voce di menu nascosta — vedi getElencoInsolutiRallentati() che si
// protegge comunque da sola lato server).
export default async function InsolutiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona) && !personaVedeReparto(persona, "Fatturazione")) redirect("/?errore=non-autorizzato");

  const clienti = await getElencoInsolutiRallentati();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-critical to-[color-mix(in_oklch,var(--critical),black_20%)] text-white shadow-md shadow-critical/30">
          <AlertTriangle className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Insoluti</h1>
          <p className="text-sm text-muted-foreground">
            Clienti segnati come insoluti o da rallentare, con la data prevista di riattivazione.
          </p>
        </div>
      </div>

      <InsolutiBoard clienti={clienti} />
    </div>
  );
}
