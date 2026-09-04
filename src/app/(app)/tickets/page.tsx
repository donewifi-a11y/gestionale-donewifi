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

// ★ NUOVA (2026-09) — richiesta esplicita: "andrebbe ripulito ogni tot
// giorni per non riempire" — la colonna "Lavorata" qui sopra è proprio il
// problema descritto, cresce da sempre senza mai svuotarsi. Un ticket
// Completato da più di GIORNI_CONSERVAZIONE_LAVORATA giorni sparisce dalla
// bacheca operativa: resta comunque consultabile per sempre in Archivio
// (/archivio, nessun filtro sui giorni) e nella scheda del cliente
// (getTicketCollegati in clienti-esterni/actions.ts) — qui si toglie solo
// dalla vista quotidiana, non si cancella nulla.
const GIORNI_CONSERVAZIONE_LAVORATA = 14;

async function fetchTuttiTicketNonAnnullati(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Ticket[]> {
  const PAGINA = 1000;
  const cutoff = new Date(Date.now() - GIORNI_CONSERVAZIONE_LAVORATA * 24 * 60 * 60 * 1000).toISOString();
  const tutti: Ticket[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data } = await supabase
      .from("tickets")
      .select("*")
      .neq("stato", "Annullato")
      // ★ un Ticket non-Completato resta sempre (prima parte dell'OR);
      // un Completato resta solo se aggiornato di recente — non esiste un
      // campo dedicato "completato_il" su tickets, `aggiornato_il` è
      // un'approssimazione ragionevole (si aggiorna praticamente sempre
      // insieme al passaggio a Completato, vedi aggiornaStatoTicket()).
      .or(`stato.neq.Completato,aggiornato_il.gte.${cutoff}`)
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
  // ★ NUOVA (2026-09-04, richiesta esplicita: "devo vedere dai ticket
  // quando sono pianificati e devo avere l'etichetta che lo dice") — prima
  // l'unico modo di sapere se (e quando) un Ticket avesse già un
  // appuntamento fissato era aprirlo: DettaglioTicket lo scopriva con un
  // fetch a parte, invisibile dalla bacheca. Un solo giro qui invece di un
  // fetch per Ticket aperto — gli appuntamenti "Programmato" sono per
  // natura un insieme limitato (solo lavori futuri/in corso, mai l'intero
  // storico), non serve la paginazione usata per i Ticket sopra.
  const { data: appuntamentiProgrammati } = await supabase
    .from("appuntamenti")
    .select("id, ticket_id, data_ora, tipo_servizio")
    .eq("stato", "Programmato")
    .not("ticket_id", "is", null);

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
        appuntamentiProgrammati={appuntamentiProgrammati ?? []}
      />
    </div>
  );
}
