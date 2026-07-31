import { Database } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { ClientiEsterniBoard } from "@/components/clienti-esterni/clienti-esterni-board";
import type { ClienteEsterno } from "@/lib/types";

// ★ "Sincronizza fatture" scarica/scrive 59mila righe: più dei 10s di
// default per una funzione serverless (le Server Action di questa pagina
// ereditano questo limite).
export const maxDuration = 60;

export default async function ClientiEsterniPage() {
  const supabase = await createClient();
  const { data: clienti } = await supabase
    .from("clienti_esterni")
    .select("*")
    .order("cognome", { ascending: true });

  const personaCorrente = await getPersonaCorrente(supabase);
  const isAdmin = personaHaAccessoAdmin(personaCorrente);

  const ultimaSincronizzazione = (clienti ?? []).reduce<string | null>(
    (max, c) => (!max || c.aggiornato_il > max ? c.aggiornato_il : max),
    null
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <Database className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Anagrafica Clienti (Aruba)</h1>
          <p className="text-sm text-muted-foreground">
            Importata dal database del sito — sola lettura, si aggiorna solo da qui con i pulsanti di sincronizzazione.
          </p>
        </div>
      </div>

      <ClientiEsterniBoard
        clienti={(clienti as ClienteEsterno[]) ?? []}
        isAdmin={isAdmin}
        ultimaSincronizzazione={ultimaSincronizzazione}
      />
    </div>
  );
}
