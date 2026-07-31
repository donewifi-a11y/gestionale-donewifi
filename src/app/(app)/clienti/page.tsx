import { Users2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { ClientiBoard } from "@/components/clienti/clienti-board";
import { fetchTuttiClientiEsterni } from "@/lib/clienti-esterni";
import type { ClienteAttivo, ClienteEsterno, Tariffa, Ticket } from "@/lib/types";

type ClienteEsternoRidotto = Pick<ClienteEsterno, "id" | "telefono" | "contratto_attivo" | "profilo_internet" | "id_contratto">;

export default async function ClientiPage() {
  const supabase = await createClient();

  const [{ data: tickets }, { data: clienti }, { data: tariffe }, clientiEsterni] = await Promise.all([
    supabase.from("tickets").select("*").order("data_creazione", { ascending: false }),
    supabase.from("clienti").select("*"),
    supabase.from("tariffe").select("*").order("ordine", { ascending: true }),
    fetchTuttiClientiEsterni<ClienteEsternoRidotto>(supabase, "id, telefono, contratto_attivo, profilo_internet, id_contratto"),
  ]);

  const personaCorrente = await getPersonaCorrente(supabase);
  const isAdmin = personaHaAccessoAdmin(personaCorrente);
  const puoModificare =
    isAdmin || !!personaCorrente?.reparti.includes("Commerciale") || !!personaCorrente?.reparti.includes("Fatturazione");

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

      <ClientiBoard
        tickets={(tickets as Ticket[]) ?? []}
        clienti={(clienti as ClienteAttivo[]) ?? []}
        tariffe={(tariffe as Tariffa[]) ?? []}
        clientiEsterni={clientiEsterni}
        puoModificare={puoModificare}
      />
    </div>
  );
}
