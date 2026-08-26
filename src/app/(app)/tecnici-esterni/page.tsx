import { redirect } from "next/navigation";
import { HardHat } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { getTecniciEsterni } from "./actions";
import { TecniciEsterniBoard } from "@/components/tecnici-esterni/tecnici-esterni-board";

// ★ NUOVA (2026-08-26) — amministrazione degli account pose.donewifi.it,
// il sistema separato per i tecnici esterni (richiesta esplicita:
// "semplificare la procedura... fare un altro sistema"). Solo admin, come
// Persone/Utenti — un tecnico esterno non ha nessun altro modo per
// ottenere un account se non da qui.
export default async function TecniciEsterniPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona)) redirect("/?errore=non-autorizzato");

  const tecnici = await getTecniciEsterni();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <HardHat className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Tecnici esterni</h1>
          <p className="text-sm text-muted-foreground">
            Account per pose.donewifi.it — un tecnico esterno vede qui i propri interventi e compila il rapportino, senza passare dal gestionale.
          </p>
        </div>
      </div>

      <TecniciEsterniBoard tecnici={tecnici} />
    </div>
  );
}
