import Link from "next/link";
import { PhoneCall, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, personaHaAccessoAdmin } from "@/lib/persona";
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

// ★ NUOVA (2026-09) — richiesta esplicita "in entrambi i posti": il popup
// di dettaglio già mostra lo stato del Ticket collegato una volta
// Trasmessa, ma la card della colonna "Trasmessa" restava muta (bisognava
// aprire ogni pratica per saperlo). Un fetch in blocco qui, sullo stesso
// modello dei ticket bulk-fetch di /tickets, evita un round-trip per card.
// ★ ESTESA (2026-09-14, richiesta esplicita: "quando viene pianificato un
// nuovo contratto nella sezione della segnalazione va aggiornato non in
// attesa di installazione ma pianificato il e metti la data") — porta
// anche la data del primo appuntamento "Programmato" per ogni Ticket,
// stesso identico dato aggiunto a getTicketPerSegnalazione() (usata dal
// popup di dettaglio) — qui per la card nella bacheca, un solo giro extra
// invece di uno per riga.
async function fetchTicketPerSegnalazione(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<Record<string, { id: string; numero: number; stato: string; appuntamentoDataOra: string | null }>> {
  const { data } = await supabase.from("tickets").select("id, numero, stato, segnalazione_id").not("segnalazione_id", "is", null);
  const mappa: Record<string, { id: string; numero: number; stato: string; appuntamentoDataOra: string | null }> = {};
  const ticketIds: string[] = [];
  for (const t of data ?? []) {
    if (t.segnalazione_id) {
      mappa[t.segnalazione_id] = { id: t.id, numero: t.numero, stato: t.stato, appuntamentoDataOra: null };
      ticketIds.push(t.id);
    }
  }

  if (ticketIds.length > 0) {
    const { data: appuntamenti } = await supabase
      .from("appuntamenti")
      .select("ticket_id, data_ora")
      .eq("stato", "Programmato")
      .in("ticket_id", ticketIds)
      .order("data_ora", { ascending: true });
    const dataPerTicket = new Map<string, string>();
    for (const a of appuntamenti ?? []) {
      if (a.ticket_id && !dataPerTicket.has(a.ticket_id)) dataPerTicket.set(a.ticket_id, a.data_ora);
    }
    for (const segnalazioneId of Object.keys(mappa)) {
      const dataOra = dataPerTicket.get(mappa[segnalazioneId].id);
      if (dataOra) mappa[segnalazioneId].appuntamentoDataOra = dataOra;
    }
  }

  return mappa;
}

export default async function SegnalazioniPage() {
  const supabase = await createClient();
  const personaCorrenteId = await getPersonaCorrenteId();
  const persona = await getPersonaCorrente(supabase);

  // ★ FIX (2026-09-17, code review approfondita) — 3 fetch indipendenti (nessuno
  // usa il risultato di un altro) eseguiti in sequenza invece che in parallelo:
  // ogni round-trip di rete si sommava al successivo invece di sovrapporsi.
  const [segnalazioni, richieste, ticketPerSegnalazione] = await Promise.all([
    fetchTutteSegnalazioni(supabase),
    fetchTutteRichieste(supabase),
    fetchTicketPerSegnalazione(supabase),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
            <PhoneCall className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div>
            {/* ★ RINOMINATA (2026-08, proposta con artifact) — "Segnalazioni"
            era ambiguo: questa pagina gestisce solo i contatti NUOVI, non un
            cliente già esistente (per quello vedi "Gestione Cliente"). Solo
            l'etichetta cambia, l'indirizzo resta /segnalazioni. */}
            <h1 className="font-heading text-2xl font-bold tracking-tight">Nuovi Clienti</h1>
            <p className="text-sm text-muted-foreground">
              Nuovi contatti, richiesta dati e trasmissione per l&apos;installazione.
            </p>
          </div>
        </div>
        <Link href="/segnalazioni/nuovo">
          <Button>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Nuovo Cliente
          </Button>
        </Link>
      </div>

      <SegnalazioniBoard
        segnalazioni={segnalazioni}
        richieste={richieste}
        ticketPerSegnalazione={ticketPerSegnalazione}
        currentPersonaId={personaCorrenteId ?? ""}
        isAdmin={personaHaAccessoAdmin(persona)}
      />
    </div>
  );
}
