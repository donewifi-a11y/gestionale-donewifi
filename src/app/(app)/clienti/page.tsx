import { Users2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin, personaVedeReparto } from "@/lib/persona";
import { ClientiBoard, type DatiAnagrafica } from "@/components/clienti/clienti-board";
import { getInstallazioni } from "./actions";
import { fetchTuttiClientiEsterni, dedupClientiPerContratto, dedupClientiPerInstallazione } from "@/lib/clienti-esterni";
import { getRiepilogoInsoluti, getClientiBuyGo } from "@/app/(app)/clienti-esterni/actions";
import type { ClienteAttivo, ClienteEsterno, Tariffa, Ticket } from "@/lib/types";

// ★ "Sincronizza fatture" (tab Anagrafica) scarica/scrive 59mila righe: più
// dei 10s di default per una funzione serverless — ereditato qui da quando
// era una pagina a sé (clienti-esterni/page.tsx), vedi fusione sotto.
export const maxDuration = 60;

type ClienteEsternoRidotto = Pick<ClienteEsterno, "id" | "telefono" | "attivo" | "profilo_internet" | "id_contratto" | "codice_gestionale">;

// ★ FIX — una `.select()` senza `.range()` è limitata a 1000 righe da
// Supabase/PostgREST: questa pagina raggruppa TUTTI i ticket per
// telefono per ricostruire il registro clienti, quindi un troncamento
// silenzioso a 1000 farebbe sparire clienti dalla lista. Poco più di un
// ticket oggi, ma è lo stesso bug già capitato due volte su questo
// progetto (clienti_esterni, fatture_esterne) — pagina fin da subito.
async function fetchTuttiTicket(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Ticket[]> {
  const PAGINA = 1000;
  const tutti: Ticket[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data } = await supabase
      .from("tickets")
      .select("*")
      .order("data_creazione", { ascending: false })
      .range(offset, offset + PAGINA - 1);
    const pagina = (data as Ticket[] | null) ?? [];
    tutti.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return tutti;
}

// ★ NUOVA (2026-08) — richiesta esplicita "semplifica come si raggiunge la
// gestione clienti": "Clienti" e "Anagrafica Clienti" erano due voci quasi
// omonime nel menu senza nessun indizio su quale aprire — proposta con
// artifact, Opzione B scelta (stesso schema già usato per Persone+Utenti e
// Materiali in questo gestionale: una voce sola nel menu, due tab dentro).
// La tab "Anagrafica" resta però disponibile solo a chi aveva già il
// permesso di vedere "Anagrafica Clienti" (Commerciale/Fatturazione/admin) —
// senza permesso questi dati pesanti (3900+ righe, fatture, insoluti) non
// vengono nemmeno recuperati, non solo nascosti in pagina.
export default async function ClientiPage() {
  const supabase = await createClient();
  const personaCorrente = await getPersonaCorrente(supabase);
  const isAdmin = personaHaAccessoAdmin(personaCorrente);
  const vedeAnagrafica = personaVedeReparto(personaCorrente, "Commerciale") || personaVedeReparto(personaCorrente, "Fatturazione");

  const [tickets, { data: clienti }, { data: tariffe }, clientiEsterniRidotti, installazioni, anagrafica] = await Promise.all([
    fetchTuttiTicket(supabase),
    supabase.from("clienti").select("*"),
    supabase.from("tariffe").select("*").order("ordine", { ascending: true }),
    fetchTuttiClientiEsterni<ClienteEsternoRidotto>(supabase, "id, telefono, attivo, profilo_internet, id_contratto, codice_gestionale").then(
      dedupClientiPerContratto
    ),
    getInstallazioni(),
    vedeAnagrafica ? caricaDatiAnagrafica(supabase, isAdmin) : Promise.resolve(null),
  ]);

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
          <p className="text-sm text-muted-foreground">Registro clienti, ricavato dallo storico dei Ticket{anagrafica ? " — o l'anagrafica completa Aruba, nella tab \"Anagrafica\"" : ""}.</p>
        </div>
      </div>

      <ClientiBoard
        tickets={tickets}
        clienti={(clienti as ClienteAttivo[]) ?? []}
        tariffe={(tariffe as Tariffa[]) ?? []}
        clientiEsterni={clientiEsterniRidotti}
        installazioni={installazioni}
        puoModificare={puoModificare}
        anagrafica={anagrafica}
      />
    </div>
  );
}

async function caricaDatiAnagrafica(supabase: Awaited<ReturnType<typeof createClient>>, isAdmin: boolean): Promise<DatiAnagrafica> {
  const clientiGrezzi = await fetchTuttiClientiEsterni<ClienteEsterno>(supabase, "*");
  const clientiNonOrdinati = dedupClientiPerInstallazione(clientiGrezzi);
  const clienti = [...clientiNonOrdinati].sort((a, b) => (a.cognome || "").localeCompare(b.cognome || ""));

  const ultimaSincronizzazione = clienti.reduce<string | null>(
    (max, c) => (!max || c.aggiornato_il > max ? c.aggiornato_il : max),
    null
  );

  // ★ una persona può avere più righe (più contratti/installazioni con lo
  // stesso CF/PIVA) — la KPI conta le persone uniche, non le righe.
  const chiaviClientiAttivi = new Set(
    clienti.filter((c) => c.attivo).map((c) => c.codice_fiscale || c.partita_iva || `id:${c.id}`)
  );

  const [insoluti, clientiBuyGo] = await Promise.all([
    isAdmin ? getRiepilogoInsoluti() : Promise.resolve(null),
    getClientiBuyGo(),
  ]);

  return {
    clienti,
    isAdmin,
    ultimaSincronizzazione,
    clientiAttivi: chiaviClientiAttivi.size,
    insoluti,
    clientiBuyGo,
  };
}
