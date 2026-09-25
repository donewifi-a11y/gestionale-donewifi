"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import { inviaMessaggioChatSistemaDiretto } from "@/lib/chat";
import { revalidatePath } from "next/cache";
import type { CategoriaLavorazione, StatoLavorazione } from "@/lib/types";

// ★ NUOVA — richiesta esplicita: lavorazioni interne (Rete/Ufficio)
// assegnabili da un amministratore ad altro staff, vedi migrazione
// 0053_lavorazioni_interne.sql. Auto-assegnazione (assegnato_a = se
// stessi) passa dal client normale (la policy RLS insert la permette da
// sola); assegnare ad altri richiede essere admin, controllato qui e
// scritto con la service role — stesso schema già usato per
// eliminaSegnalazione()/eliminaRichiestaCliente().
export async function creaLavorazione(dati: {
  categoria: CategoriaLavorazione;
  titolo: string;
  descrizione: string;
  assegnatoA: string;
}) {
  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: ERRORE_PERSONA_MANCANTE };
  if (!dati.titolo.trim()) return { errore: "Il titolo è obbligatorio." };

  const autoAssegnata = dati.assegnatoA === persona.id;
  if (!autoAssegnata && !personaHaAccessoAdmin(persona)) {
    return { errore: "Solo un amministratore può assegnare una lavorazione a un'altra persona." };
  }

  const riga = {
    categoria: dati.categoria,
    titolo: dati.titolo.trim(),
    descrizione: dati.descrizione.trim() || null,
    assegnato_a: dati.assegnatoA,
    assegnato_da: persona.id,
  };

  const client = autoAssegnata ? supabase : createServiceClient();
  const { data, error } = await client.from("lavorazioni_interne").insert(riga).select("id").single();
  if (error) return { errore: error.message };

  // ★ se assegnata a qualcun altro, un avviso in chat gliela fa notare
  // subito invece di doverla scoprire aprendo la pagina — stesso principio
  // già usato per il contratto inviato per approvazione (Analisi Rete
  // avvisata subito, non solo al momento della Trasmissione).
  if (!autoAssegnata) {
    await inviaMessaggioChatSistemaDiretto(
      dati.assegnatoA,
      `📋 Ti è stata assegnata una nuova lavorazione (${dati.categoria}): "${dati.titolo.trim()}".`
    );
  }

  revalidatePath("/lavorazioni");
  return { errore: null, id: data.id };
}

export async function cambiaStatoLavorazione(id: string, nuovoStato: StatoLavorazione) {
  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: ERRORE_PERSONA_MANCANTE };

  // ★ FIX (2026-09-25, audit modulo Team/Lavorazioni) — a differenza delle
  // funzioni gemelle (creaLavorazione/eliminaLavorazione), qui mancava
  // qualunque controllo applicativo: contava solo sulla RLS ("aggiorna le
  // proprie lavorazioni" — assegnato_a o assegnato_da, migrazione 0053).
  // Un update filtrato dalla RLS a 0 righe non torna come errore da
  // PostgREST (stesso identico comportamento silenzioso già scoperto e
  // documentato per i Ticket, migrazione 0072) — chi non è né assegnatario
  // né chi ha assegnato la lavorazione avrebbe visto un "aggiornato" senza
  // che nulla fosse davvero cambiato, invece di un errore chiaro.
  // ★ la RLS (migrazione 0053) non fa eccezioni per l'amministratore su
  // UPDATE (solo la SELECT in pagina passa dalla service role, per
  // mostrare "tutte le lavorazioni di tutti" — vedi lavorazioni/page.tsx):
  // niente bypass admin neanche qui, sarebbe un controllo applicativo più
  // permissivo di quello che la scrittura vera consente comunque.
  const { data: lavorazione } = await supabase.from("lavorazioni_interne").select("assegnato_a, assegnato_da").eq("id", id).maybeSingle();
  if (!lavorazione) return { errore: "Lavorazione non trovata." };
  if (lavorazione.assegnato_a !== persona.id && lavorazione.assegnato_da !== persona.id) {
    return { errore: "Puoi cambiare stato solo alle lavorazioni assegnate a te o da te." };
  }

  const aggiornamento: Record<string, unknown> = { stato: nuovoStato };
  if (nuovoStato === "Fatta") aggiornamento.completato_il = new Date().toISOString();
  else aggiornamento.completato_il = null;

  const { error } = await supabase.from("lavorazioni_interne").update(aggiornamento).eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/lavorazioni");
  return { errore: null };
}

// ★ NUOVA — solo un amministratore la vede (pulsante non renderizzato per
// gli altri, controllo comunque ripetuto qui): "lavorazioni_interne" non
// ha policy RLS di delete (vedi migrazione), la cancellazione vera passa
// dalla service role.
export async function eliminaLavorazione(id: string) {
  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: ERRORE_PERSONA_MANCANTE };
  if (!personaHaAccessoAdmin(persona)) return { errore: "Solo un amministratore può eliminare una lavorazione." };

  const service = createServiceClient();
  const { error } = await service.from("lavorazioni_interne").delete().eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/lavorazioni");
  return { errore: null };
}
