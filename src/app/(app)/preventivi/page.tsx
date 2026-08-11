import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, personaHaAccessoAdmin } from "@/lib/persona";
import { PreventiviBoard } from "@/components/preventivi/preventivi-board";
import { Button } from "@/components/ui/button";
import type { Preventivo } from "@/lib/types";

// ★ stessa protezione già usata per Segnalazioni/Ticket contro il limite di
// 1000 righe di Supabase/PostgREST — anche se oggi i Preventivi sono
// pochi, evita di reintrodurre lo stesso bug già corretto altrove appena
// la tabella cresce.
async function fetchTuttiPreventivi(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Preventivo[]> {
  const PAGINA = 1000;
  const tutti: Preventivo[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data } = await supabase
      .from("preventivi")
      .select("*")
      .order("creato_il", { ascending: false })
      .range(offset, offset + PAGINA - 1);
    const pagina = (data as Preventivo[] | null) ?? [];
    tutti.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return tutti;
}

export default async function PreventiviPage() {
  const supabase = await createClient();
  const personaCorrenteId = await getPersonaCorrenteId();
  const persona = await getPersonaCorrente(supabase);

  const preventivi = await fetchTuttiPreventivi(supabase);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
            <FileText className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Preventivi</h1>
            <p className="text-sm text-muted-foreground">Composizione, invio e approvazione del cliente.</p>
          </div>
        </div>
        <Link href="/preventivi/nuovo">
          <Button>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Nuovo Preventivo
          </Button>
        </Link>
      </div>

      <PreventiviBoard
        preventivi={preventivi}
        currentPersonaId={personaCorrenteId ?? ""}
        isAdmin={personaHaAccessoAdmin(persona)}
      />
    </div>
  );
}
