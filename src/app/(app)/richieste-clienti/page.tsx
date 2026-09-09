import { ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { RichiesteClientiBoard } from "@/components/richieste-clienti/richieste-clienti-board";
import type { RichiestaCliente } from "@/lib/types";

// ★ FIX — nessun filtro di stato/data: la lista cresce indefinitamente.
// Una `.select()` senza `.range()` è limitata a 1000 righe da
// Supabase/PostgREST — stesso bug già trovato e corretto due volte su
// questo progetto.
//
// ★ FIX (2026-08) — richiesta esplicita: "Gestione Cliente" è per le
// pratiche di un cliente GIÀ esistente (Trasferimento/Cambio IBAN/Cambio
// Anagrafica/Subentro/Disdetta) — "Richiesta Dati" è tutt'altra cosa,
// riguarda un contatto NUOVO ancora nella pipeline "Nuovi Clienti" (vedi
// segnalazioni-board.tsx, dove resta comunque visibile dentro il dettaglio
// della Segnalazione d'origine). Escluderla qui, non nasconderla ovunque:
// `fetchTutteRichieste` di segnalazioni/page.tsx non tocca questo filtro.
async function fetchTutteRichieste(supabase: Awaited<ReturnType<typeof createClient>>): Promise<RichiestaCliente[]> {
  const PAGINA = 1000;
  const tutte: RichiestaCliente[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data } = await supabase
      .from("richieste_clienti")
      .select("*")
      .neq("tipo_richiesta", "Richiesta Dati")
      .order("data", { ascending: false })
      .range(offset, offset + PAGINA - 1);
    const pagina = (data as RichiestaCliente[] | null) ?? [];
    tutte.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return tutte;
}

// ★ NUOVA (2026-09, "il contratto nuovo approvato solo da nuovo" — vedi
// l'artifact "Il Subentro Fino all'Installazione") — "pronta da
// completare" ora richiede anche che il Ticket collegato sia
// "Completato" (installazione svolta): un giro in blocco, solo per i
// Ticket dei Subentro (un insieme per natura piccolo), invece di un
// fetch per card.
async function fetchStatoTicketSubentro(
  supabase: Awaited<ReturnType<typeof createClient>>,
  richieste: RichiestaCliente[]
): Promise<Record<string, string>> {
  const ticketIds = [...new Set(richieste.filter((r) => r.tipo_richiesta === "Subentro" && r.ticket_id).map((r) => r.ticket_id as string))];
  if (ticketIds.length === 0) return {};
  const { data } = await supabase.from("tickets").select("id, stato").in("id", ticketIds);
  const mappa: Record<string, string> = {};
  for (const t of data ?? []) mappa[t.id] = t.stato;
  return mappa;
}

export default async function RichiesteClientiPage() {
  const supabase = await createClient();
  const richieste = await fetchTutteRichieste(supabase);
  const statoTicketPerId = await fetchStatoTicketSubentro(supabase, richieste);
  const persona = await getPersonaCorrente(supabase);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <ClipboardList className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          {/* ★ RINOMINATA (2026-08, proposta con artifact) — "Richieste
          Clienti" era un nome tecnico in un mondo (Assistenza) sbagliato
          per chi gestisce un cliente già esistente — vedi app-sidebar.tsx.
          Solo l'etichetta cambia, l'indirizzo resta /richieste-clienti. */}
          <h1 className="font-heading text-2xl font-bold tracking-tight">Gestione Cliente</h1>
          <p className="text-sm text-muted-foreground">
            Cambio IBAN, Cambio Anagrafica, Trasferimento, Subentro e Disdetta per un cliente già esistente.
          </p>
        </div>
      </div>

      <RichiesteClientiBoard richieste={richieste} isAdmin={personaHaAccessoAdmin(persona)} statoTicketPerId={statoTicketPerId} />
    </div>
  );
}
