"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import type { MessaggioChat } from "@/lib/types";

export interface ContattoChat {
  id: string;
  nome: string;
  conversazioneId: string | null;
  ultimoTesto: string | null;
  ultimoAllegatoNome: string | null;
  ultimoCreatoIl: string | null;
  nonLetti: number;
}

export interface GruppoChat {
  id: string;
  reparto: string;
  ultimoTesto: string | null;
  ultimoAllegatoNome: string | null;
  ultimoCreatoIl: string | null;
  nonLetti: number;
}

interface AnteprimaConversazione {
  ultimoTesto: string | null;
  ultimoAllegatoNome: string | null;
  ultimoCreatoIl: string | null;
  nonLetti: number;
}

/** ★ FIX — prima questa funzione tornava solo "a chi puoi scrivere" (elenco
 * piatto di persone/gruppi): niente anteprima dell'ultimo messaggio, niente
 * indicatore di non letti, la chat ripartiva sempre da zero invece di
 * mostrare le conversazioni già in corso. Ora calcola anche quello, in 3
 * query invece di N+1 (tutte le conversazioni visibili via RLS, tutte le
 * letture proprie, tutti i messaggi di quelle conversazioni), aggregando
 * qui in JS — volume tipico (poche decine di conversazioni per un team di
 * questa dimensione) troppo piccolo per giustificare una funzione SQL
 * dedicata. */
export async function getContattiChat(): Promise<{ persone: ContattoChat[]; gruppi: GruppoChat[]; nonLettiTotali: number }> {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { persone: [], gruppi: [], nonLettiTotali: 0 };

  const [{ data: persone }, { data: conversazioni }, { data: letture }] = await Promise.all([
    supabase.from("persone").select("id, nome").eq("attivo", true).neq("id", personaId).order("nome"),
    supabase.from("conversazioni").select("*"),
    supabase.from("conversazioni_letture").select("conversazione_id, ultimo_letto_il").eq("persona_id", personaId),
  ]);

  const conversazioniList = conversazioni ?? [];
  const idConversazioni = conversazioniList.map((c) => c.id);
  const { data: messaggi } =
    idConversazioni.length > 0
      ? await supabase
          .from("messaggi_chat")
          .select("conversazione_id, mittente_id, testo, allegato_nome, creato_il")
          .in("conversazione_id", idConversazioni)
          .order("creato_il", { ascending: true })
      : { data: [] as { conversazione_id: string; mittente_id: string; testo: string | null; allegato_nome: string | null; creato_il: string }[] };

  const letturaPerConv = new Map((letture ?? []).map((l) => [l.conversazione_id, l.ultimo_letto_il]));
  const ultimoPerConv = new Map<string, { testo: string | null; allegato_nome: string | null; creato_il: string }>();
  const nonLettiPerConv = new Map<string, number>();
  for (const m of messaggi ?? []) {
    // ★ i messaggi arrivano ordinati per data crescente: l'ultimo che
    // sovrascrive la mappa, per ciascuna conversazione, è sempre il più
    // recente — non serve un ordinamento separato "prendi solo l'ultimo".
    ultimoPerConv.set(m.conversazione_id, { testo: m.testo, allegato_nome: m.allegato_nome, creato_il: m.creato_il });
    if (m.mittente_id !== personaId) {
      const mieaLettura = letturaPerConv.get(m.conversazione_id);
      if (!mieaLettura || new Date(m.creato_il) > new Date(mieaLettura)) {
        nonLettiPerConv.set(m.conversazione_id, (nonLettiPerConv.get(m.conversazione_id) ?? 0) + 1);
      }
    }
  }

  const conversazionePerAltraPersona = new Map<string, (typeof conversazioniList)[number]>();
  for (const c of conversazioniList) {
    if (c.tipo === "diretta") {
      const altra = c.persona_a_id === personaId ? c.persona_b_id : c.persona_a_id;
      if (altra) conversazionePerAltraPersona.set(altra, c);
    }
  }

  function anteprima(conversazioneId: string | undefined): AnteprimaConversazione {
    if (!conversazioneId) return { ultimoTesto: null, ultimoAllegatoNome: null, ultimoCreatoIl: null, nonLetti: 0 };
    const ultimo = ultimoPerConv.get(conversazioneId);
    return {
      ultimoTesto: ultimo?.testo ?? null,
      ultimoAllegatoNome: ultimo?.allegato_nome ?? null,
      ultimoCreatoIl: ultimo?.creato_il ?? null,
      nonLetti: nonLettiPerConv.get(conversazioneId) ?? 0,
    };
  }

  const persone2: ContattoChat[] = (persone ?? []).map((p) => {
    const conv = conversazionePerAltraPersona.get(p.id);
    return { id: p.id, nome: p.nome, conversazioneId: conv?.id ?? null, ...anteprima(conv?.id) };
  });

  const gruppi2: GruppoChat[] = conversazioniList
    .filter((c) => c.tipo === "gruppo")
    .map((c) => ({ id: c.id, reparto: c.reparto as string, ...anteprima(c.id) }));

  const nonLettiTotali = [...nonLettiPerConv.values()].reduce((s, n) => s + n, 0);

  return { persone: persone2, gruppi: gruppi2, nonLettiTotali };
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
  // ★ Supabase Storage rifiuta spazi/accenti nella chiave — il nome
  // originale resta comunque quello mostrato in chat (allegato_nome).
  const nomeSicuro = file.name.normalize("NFKD").replace(/[^\w.-]+/g, "_");
  const percorso = `chat/${conversazioneId}/${Date.now()}-${nomeSicuro}`;
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
  // ★ FIX SICUREZZA — controllava solo che ci fosse un cookie persona
  // valido, non che la persona fosse ancora attiva né che avesse accesso
  // a QUESTA conversazione: un dipendente disattivato con sessione ancora
  // valida, o uno staff normale che indovina/riusa un percorso, otteneva
  // comunque l'URL firmato perché sotto si passa alla service role (che
  // bypassa la RLS). Stesso controllo già fatto in inviaAllegatoChat().
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: ERRORE_PERSONA_MANCANTE, url: null };

  const conversazioneId = percorso.split("/")[1];
  const { data: consentita } = await supabase.from("conversazioni").select("id").eq("id", conversazioneId).maybeSingle();
  if (!consentita) return { errore: "Allegato non trovato o non accessibile.", url: null };

  const service = createServiceClient();
  const { data, error } = await service.storage.from("documenti").createSignedUrl(percorso, 3600);
  if (error) return { errore: error.message, url: null };
  return { errore: null, url: data.signedUrl };
}

/** Segna la conversazione come letta ad ora — da chiamare quando si apre il thread e mentre resta aperto. */
export async function segnaConversazioneLetta(conversazioneId: string): Promise<void> {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return;

  await supabase
    .from("conversazioni_letture")
    .upsert({ conversazione_id: conversazioneId, persona_id: personaId, ultimo_letto_il: new Date().toISOString() });
}

/** Solo per le dirette: quando l'altra persona ha letto per l'ultima volta, per mostrare "Letto" sotto l'ultimo messaggio. */
export async function getUltimaLetturaAltro(conversazioneId: string, altraPersonaId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversazioni_letture")
    .select("ultimo_letto_il")
    .eq("conversazione_id", conversazioneId)
    .eq("persona_id", altraPersonaId)
    .maybeSingle();
  return data?.ultimo_letto_il ?? null;
}
