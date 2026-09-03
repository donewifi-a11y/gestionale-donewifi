import { Archive } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ArchivioBoard } from "@/components/archivio/archivio-board";
import { getRapportiLavoro } from "@/app/(app)/rapporti-lavoro/actions";
import type { Segnalazione, Ticket } from "@/lib/types";

// ★ FIX — l'Archivio accumula per definizione TUTTI i ticket chiusi e
// tutte le Segnalazioni trasmesse dall'inizio dell'attività, senza limite
// temporale: è il caso più probabile per sforare le 1000 righe che
// Supabase/PostgREST tronca in silenzio da una `.select()` senza
// `.range()` — stesso bug già trovato e corretto due volte su questo
// progetto (clienti_esterni, fatture_esterne).
export const maxDuration = 30;

async function fetchTicketArchivio(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Ticket[]> {
  const PAGINA = 1000;
  const tutti: Ticket[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data } = await supabase
      .from("tickets")
      .select("*")
      .in("stato", ["Completato", "Annullato"])
      .order("data_creazione", { ascending: false })
      .range(offset, offset + PAGINA - 1);
    const pagina = (data as Ticket[] | null) ?? [];
    tutti.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return tutti;
}

async function fetchSegnalazioniArchivio(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Segnalazione[]> {
  const PAGINA = 1000;
  const tutte: Segnalazione[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data } = await supabase
      .from("segnalazioni")
      .select("*")
      .eq("stato", "Trasmessa")
      .order("data", { ascending: false })
      .range(offset, offset + PAGINA - 1);
    const pagina = (data as Segnalazione[] | null) ?? [];
    tutte.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return tutte;
}

// ★ FUSA (2026-09-03, richiesta esplicita: "riusciamo a dare un ordine
// logico e avere il meno possibile [di voci di menu]" — proposta con
// artifact "Meno Voci nel Menu", confermata) — "Rapporti di Lavoro" era una
// voce di menu a parte creata poco prima nella stessa sessione, ma è la
// stessa storia dell'Archivio vista dall'altro lato (Archivio = quali
// Ticket sono chiusi, Rapporti di Lavoro = cosa è stato fatto in ognuno) —
// due porte per la stessa cosa. Ora è un secondo tab qui dentro invece di
// una voce di menu a sé; /rapporti-lavoro resta come redirect per chi ha un
// link salvato (stesso trattamento già usato per /utenti, /tecnici-esterni).
export default async function ArchivioPage() {
  const supabase = await createClient();

  const [tickets, segnalazioni, { schede, rapportini }] = await Promise.all([
    fetchTicketArchivio(supabase),
    fetchSegnalazioniArchivio(supabase),
    getRapportiLavoro(),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <Archive className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Archivio</h1>
          <p className="text-sm text-muted-foreground">Ticket chiusi, Segnalazioni trasmesse e i lavori svolti — riferimento storico.</p>
        </div>
      </div>

      <ArchivioBoard tickets={tickets} segnalazioni={segnalazioni} schede={schede} rapportini={rapportini} />
    </div>
  );
}
