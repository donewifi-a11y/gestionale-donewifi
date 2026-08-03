import Link from "next/link";
import { PhoneCall, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrenteId } from "@/lib/persona";
import { Button } from "@/components/ui/button";
import { SegnalazioniBoard } from "@/components/segnalazioni/segnalazioni-board";
import type { RichiestaCliente, Segnalazione } from "@/lib/types";

// ★ FIX — la Kanban Segnalazioni non ha filtro di stato: la colonna
// "Trasmessa" accumula tutte le segnalazioni trasmesse dall'inizio
// dell'attività, senza limite temporale. Una `.select()` senza `.range()`
// è limitata a 1000 righe da Supabase/PostgREST — stesso bug già trovato
// e corretto due volte su questo progetto.
export const maxDuration = 30;

async function fetchTutteSegnalazioni(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Segnalazione[]> {
  const PAGINA = 1000;
  const tutte: Segnalazione[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data } = await supabase
      .from("segnalazioni")
      .select("*")
      .order("data", { ascending: false })
      .range(offset, offset + PAGINA - 1);
    const pagina = (data as Segnalazione[] | null) ?? [];
    tutte.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return tutte;
}

async function fetchTutteRichieste(supabase: Awaited<ReturnType<typeof createClient>>): Promise<RichiestaCliente[]> {
  const PAGINA = 1000;
  const tutte: RichiestaCliente[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data } = await supabase
      .from("richieste_clienti")
      .select("*")
      .order("data", { ascending: false })
      .range(offset, offset + PAGINA - 1);
    const pagina = (data as RichiestaCliente[] | null) ?? [];
    tutte.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return tutte;
}

export default async function SegnalazioniPage() {
  const supabase = await createClient();
  const personaCorrenteId = await getPersonaCorrenteId();

  const segnalazioni = await fetchTutteSegnalazioni(supabase);
  const richieste = await fetchTutteRichieste(supabase);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
            <PhoneCall className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Segnalazioni</h1>
            <p className="text-sm text-muted-foreground">
              Nuovi contatti, richiesta dati e trasmissione per l&apos;installazione.
            </p>
          </div>
        </div>
        <Link href="/segnalazioni/nuovo">
          <Button>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Nuova Segnalazione
          </Button>
        </Link>
      </div>

      <SegnalazioniBoard
        segnalazioni={segnalazioni}
        richieste={richieste}
        currentPersonaId={personaCorrenteId ?? ""}
      />
    </div>
  );
}
