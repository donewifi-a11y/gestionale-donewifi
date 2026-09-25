"use server";

import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente } from "@/lib/persona";
import { revalidatePath } from "next/cache";
import type { MaterialeUsato } from "@/lib/types";

type DatiCliente = {
  nome: string;
  telefono: string;
  email: string;
  indirizzo: string;
  tariffa_id: string;
  canone_mensile: string;
  scadenza_contratto: string;
  note: string;
};

// ★ ex aggiornaClienteAttivo()/_registraClienteAttivo() del vecchio
// gestionale — qui un solo upsert: se il cliente (per id, o per telefono
// se non ha ancora un record proprio) esiste già lo aggiorna, altrimenti
// lo crea. Dati contrattuali (tariffa/canone/scadenza) che non stanno su
// nessun Ticket.
export async function salvaDatiContrattualiCliente(clienteId: string | null, dati: DatiCliente) {
  const supabase = await createClient();
  // ★ FIX (2026-09-25, audit modulo Clienti) — `auth.getUser()` controlla
  // solo che esista una sessione Supabase Auth valida, non che corrisponda
  // a una Persona ancora attiva: stessa causa già trovata più volte in
  // questo gestionale (un accesso condiviso/vecchio ancora autenticato,
  // vedi i fix su creaTicket()/aggiornaStatoTicket() in tickets/actions.ts)
  // — `getPersonaCorrente()` è il controllo giusto, usato ovunque altrove.
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: "Non autenticato." };

  const payload = {
    nome: dati.nome,
    telefono: dati.telefono || null,
    email: dati.email || null,
    indirizzo: dati.indirizzo || null,
    tariffa_id: dati.tariffa_id || null,
    canone_mensile: dati.canone_mensile ? Number(dati.canone_mensile) : null,
    scadenza_contratto: dati.scadenza_contratto || null,
    note: dati.note || null,
    aggiornato_il: new Date().toISOString(),
  };

  const { error } = clienteId
    ? await supabase.from("clienti").update(payload).eq("id", clienteId)
    : await supabase.from("clienti").insert(payload);
  if (error) return { errore: error.message };

  revalidatePath("/clienti");
  return { errore: null };
}

export interface RigaInstallazione {
  schedaId: string;
  ticketId: string;
  ticketNumero: number;
  cliente: string;
  indirizzo: string | null;
  completataIl: string;
  tecnico: string | null;
  modelloCpe: string | null;
  mac: string | null;
  rssi: number | null;
  snr: number | null;
  materiali: MaterialeUsato[];
  importoFatturato: number | null;
  metodoPagamento: string | null;
  contrattoUrl: string | null;
}

/** ★ NUOVA — richiesta esplicita: "una volta che i tecnici ultimano
 * l'installazione, un listato dei clienti installati con i dati inseriti
 * nella scheda di lavoro" — proposta con artifact (3 stili), scelto A
 * (tabella), come nuova tab dentro "Clienti". Una riga per Scheda di
 * Installazione completata (tipo='Nuova installazione' — una Lavorazione
 * tecnica non è un'installazione), arricchita col Ticket collegato
 * (cliente/indirizzo/contratto) e il nome del tecnico che l'ha compilata.
 * Paginata a 1000 righe come le altre liste "tutto lo storico" del
 * gestionale (fetchTuttiTicket, fetchTicketArchivio...). */
export async function getInstallazioni(): Promise<RigaInstallazione[]> {
  const supabase = await createClient();
  // ★ FIX (2026-09-25, audit modulo Clienti) — mancava del tutto un
  // controllo di autenticazione (a differenza di salvaDatiContrattualiCliente
  // qui sopra): nome/indirizzo/dati tecnici dei clienti installati erano
  // leggibili da chiunque chiamasse questa Server Action, autenticato o no.
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return [];

  const PAGINA = 1000;
  const schede: {
    id: string;
    ticket_id: string | null;
    creato_il: string;
    creato_da: string | null;
    modello_cpe: string | null;
    mac: string | null;
    rssi: number | null;
    snr: number | null;
    materiali: MaterialeUsato[];
    importo_fatturato: number | null;
    metodo_pagamento_posa: string | null;
  }[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await supabase
      .from("schede_lavoro")
      .select("id, ticket_id, creato_il, creato_da, modello_cpe, mac, rssi, snr, materiali, importo_fatturato, metodo_pagamento_posa")
      .eq("tipo", "Nuova installazione")
      .order("creato_il", { ascending: false })
      .range(offset, offset + PAGINA - 1);
    // ★ FIX (2026-09-25, audit modulo Clienti) — stesso bug di
    // fetchTuttiTicket()/fetchTuttiClientiEsterni(): un errore a metà
    // paginazione veniva trattato come fine dei risultati, elenco
    // installazioni troncato in silenzio.
    if (error) throw new Error(`getInstallazioni: ${error.message}`);
    const pagina = data ?? [];
    schede.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  if (schede.length === 0) return [];

  const idTicket = [...new Set(schede.map((s) => s.ticket_id).filter((id): id is string => !!id))];
  const idPersona = [...new Set(schede.map((s) => s.creato_da).filter((id): id is string => !!id))];

  const [{ data: tickets }, { data: persone }] = await Promise.all([
    idTicket.length > 0
      ? supabase.from("tickets").select("id, numero, cliente, indirizzo, contratto_pdf_url").in("id", idTicket)
      : Promise.resolve({ data: [] as { id: string; numero: number; cliente: string; indirizzo: string | null; contratto_pdf_url: string | null }[] }),
    idPersona.length > 0
      ? supabase.from("persone").select("id, nome").in("id", idPersona)
      : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
  ]);
  const ticketPerId = new Map((tickets ?? []).map((t) => [t.id, t]));
  const personaPerId = new Map((persone ?? []).map((p) => [p.id, p]));

  return schede
    .filter((s): s is typeof s & { ticket_id: string } => !!s.ticket_id && ticketPerId.has(s.ticket_id))
    .map((s) => {
      const ticket = ticketPerId.get(s.ticket_id)!;
      return {
        schedaId: s.id,
        ticketId: s.ticket_id,
        ticketNumero: ticket.numero,
        cliente: ticket.cliente,
        indirizzo: ticket.indirizzo,
        completataIl: s.creato_il,
        tecnico: s.creato_da ? (personaPerId.get(s.creato_da)?.nome ?? null) : null,
        modelloCpe: s.modello_cpe,
        mac: s.mac,
        rssi: s.rssi,
        snr: s.snr,
        materiali: s.materiali ?? [],
        importoFatturato: s.importo_fatturato,
        metodoPagamento: s.metodo_pagamento_posa,
        contrattoUrl: ticket.contratto_pdf_url,
      };
    });
}
