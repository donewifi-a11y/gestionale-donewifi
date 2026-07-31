"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrenteId, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import type { MessaggioChat } from "@/lib/types";

export interface ContattoChat {
  id: string;
  nome: string;
}

export interface GruppoChat {
  id: string;
  reparto: string;
}

/** Persone con cui aprire una diretta (tutte tranne sé stessi) + i gruppi reparto visibili (RLS già li filtra). */
export async function getContattiChat(): Promise<{ persone: ContattoChat[]; gruppi: GruppoChat[] }> {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { persone: [], gruppi: [] };

  const [{ data: persone }, { data: gruppi }] = await Promise.all([
    supabase.from("persone").select("id, nome").eq("attivo", true).neq("id", personaId).order("nome"),
    supabase.from("conversazioni").select("id, reparto").eq("tipo", "gruppo"),
  ]);

  return {
    persone: persone ?? [],
    gruppi: (gruppi ?? []).map((g) => ({ id: g.id, reparto: g.reparto as string })),
  };
}

/** Trova (o crea al primo utilizzo) la conversazione diretta con un'altra persona. */
export async function getOrCreaConversazioneDiretta(altraPersonaId: string): Promise<{ errore: string | null; id: string | null }> {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE, id: null };

  const { data: esistente } = await supabase
    .from("conversazioni")
    .select("id")
    .eq("tipo", "diretta")
    .or(
      `and(persona_a_id.eq.${personaId},persona_b_id.eq.${altraPersonaId}),and(persona_a_id.eq.${altraPersonaId},persona_b_id.eq.${personaId})`
    )
    .maybeSingle();
  if (esistente) return { errore: null, id: esistente.id };

  const { data: creata, error } = await supabase
    .from("conversazioni")
    .insert({ tipo: "diretta", persona_a_id: personaId, persona_b_id: altraPersonaId })
    .select("id")
    .single();
  if (error) return { errore: error.message, id: null };

  return { errore: null, id: creata.id };
}

export async function getMessaggi(conversazioneId: string): Promise<MessaggioChat[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messaggi_chat")
    .select("*")
    .eq("conversazione_id", conversazioneId)
    .order("creato_il", { ascending: true })
    .limit(200);
  return data ?? [];
}

export async function inviaMessaggio(conversazioneId: string, testo: string): Promise<{ errore: string | null }> {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };
  if (!testo.trim()) return { errore: "Il messaggio è vuoto." };

  const { error } = await supabase
    .from("messaggi_chat")
    .insert({ conversazione_id: conversazioneId, mittente_id: personaId, testo: testo.trim() });
  if (error) return { errore: error.message };
  return { errore: null };
}

/** Allegato: passa dalla service role come il resto dei documenti del gestionale (bucket privato, mai accesso diretto). */
export async function inviaAllegatoChat(conversazioneId: string, formData: FormData): Promise<{ errore: string | null }> {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

  // ★ la RLS (non l'app) decide chi vede una conversazione — qui va
  // ricontrollata a mano perché sotto si passa alla service role, che la
  // bypassa, per poter scrivere sullo storage privato.
  const { data: consentita } = await supabase.from("conversazioni").select("id").eq("id", conversazioneId).maybeSingle();
  if (!consentita) return { errore: "Conversazione non trovata o non accessibile." };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { errore: "Nessun file selezionato." };
  if (file.size > 10 * 1024 * 1024) return { errore: "Il file supera i 10 MB." };

  const service = createServiceClient();
  const percorso = `chat/${conversazioneId}/${Date.now()}-${file.name}`;
  const { error: erroreUpload } = await service.storage.from("documenti").upload(percorso, file, { contentType: file.type });
  if (erroreUpload) return { errore: erroreUpload.message };

  const { error } = await service
    .from("messaggi_chat")
    .insert({ conversazione_id: conversazioneId, mittente_id: personaId, allegato_url: percorso, allegato_nome: file.name });
  if (error) return { errore: error.message };
  return { errore: null };
}

export async function urlAllegatoChat(percorso: string): Promise<{ errore: string | null; url: string | null }> {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE, url: null };

  const service = createServiceClient();
  const { data, error } = await service.storage.from("documenti").createSignedUrl(percorso, 3600);
  if (error) return { errore: error.message, url: null };
  return { errore: null, url: data.signedUrl };
}
