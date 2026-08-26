import Link from "next/link";
import { Ticket as TicketIcon, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrenteId } from "@/lib/persona";
import { Button } from "@/components/ui/button";
import { TicketsBoard } from "@/components/tickets/tickets-board";
import type { MaterialeMagazzino, Ticket } from "@/lib/types";

// ★ FIX — la Kanban Ticket esclude solo "Annullato": la colonna "Lavorata"
// mostra TUTTI i ticket completati dall'inizio dell'attività, senza limite
// temporale. Una `.select()` senza `.range()` è limitata a 1000 righe da
// Supabase/PostgREST — stesso bug già trovato e corretto due volte su
// questo progetto (clienti_esterni, fatture_esterne). Pagina fin da
// subito invece di aspettare che il troncamento diventi visibile.
export const maxDuration = 30;

async function fetchTuttiTicketNonAnnullati(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Ticket[]> {
  const PAGINA = 1000;
  const tutti: Ticket[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data } = await supabase
      .from("tickets")
      .select("*")
      .neq("stato", "Annullato")
      .order("data_creazione", { ascending: false })
      .range(offset, offset + PAGINA - 1);
    const pagina = (data as Ticket[] | null) ?? [];
    tutti.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return tutti;
}

export default async function TicketsPage() {
  const supabase = await createClient();

  const tickets = await fetchTuttiTicketNonAnnullati(supabase);

  const { data: persone } = await supabase.from("persone").select("id, nome, attivo, amministratore, reparti").eq("attivo", true);
  // ★ NUOVA — serve al pannello "Apri scheda di lavoro" (vedi
  // tickets-board.tsx): un admin/commerciale deve poter compilare la
  // Scheda Installazione/Lavorazione dal Ticket, stesso form già usato in
  // Vista Tecnico, che richiede il catalogo materiali per il selettore.
  const { data: materiali } = await supabase.from("materiali_magazzino").select("*").eq("attivo", true).order("ordine", { ascending: true });
  const personaCorrenteId = await getPersonaCorrenteId();
  // ★ NUOVA (2026-08-26) — sistema pose.donewifi.it: elenco tecnici esterni
  // attivi, per assegnare un Ticket a uno di loro dal dettaglio (vedi
  // "Assegnato a" in tickets-board.tsx).
  const { data: tecniciEsterni } = await supabase.from("tecnici_esterni").select("id, nome, cognome").eq("attivo", true).order("nome", { ascending: true });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
            <TicketIcon className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Ticket</h1>
            <p className="text-sm text-muted-foreground">Assistenza, pratiche commerciali e amministrative.</p>
          </div>
        </div>
        <Link href="/tickets/nuovo">
          <Button>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Nuovo Ticket
          </Button>
        </Link>
      </div>

      <TicketsBoard
        tickets={(tickets as Ticket[]) ?? []}
        currentPersonaId={personaCorrenteId ?? ""}
        persone={persone ?? []}
        catalogoMateriali={(materiali as MaterialeMagazzino[]) ?? []}
        tecniciEsterni={tecniciEsterni ?? []}
      />
    </div>
  );
}
