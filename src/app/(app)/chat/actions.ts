"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import { urlFirmataDocumento } from "@/lib/documenti";
import { NOME_PERSONA_SISTEMA } from "@/lib/chat";
import type { MessaggioChat } from "@/lib/types";

export interface ContattoChat {
  id: string;
  nome: string;
  conversazioneId: string | null;
  ultimoTesto: string | null;
  ultimoAllegatoNome: string | null;
  ultimoCreatoIl: string | null;
  /** ★ NUOVA — l'ultimo messaggio è un avviso automatico (mittente "Sistema")? Serve all'anteprima nell'elenco, prima di aprire il thread. */
  ultimoDaSistema: boolean;
  nonLetti: number;
}

export interface GruppoChat {
  id: string;
  reparto: string;
  ultimoTesto: string | null;
  ultimoAllegatoNome: string | null;
  ultimoCreatoIl: string | null;
  ultimoDaSistema: boolean;
  nonLetti: number;
}

interface AnteprimaConversazione {
  ultimoTesto: string | null;
  ultimoAllegatoNome: string | null;
  ultimoCreatoIl: string | null;
  ultimoDaSistema: boolean;
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
export async function getContattiChat(): Promise<{ persone: ContattoChat[]; gruppi: GruppoChat[]; nonLettiTotali: number; sistemaId: string | null }> {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { persone: [], gruppi: [], nonLettiTotali: 0, sistemaId: null };

  // ★ FIX — filtrava a `attivo = true`: la persona "Sistema" (mittente dei
  // promemoria automatici, es. Lavorazioni Interne assegnate — vedi
  // inviaMessaggioChatSistemaDiretto() in chat.ts) è sempre attivo=false
  // per disegno, quindi spariva dall'elenco contatti anche quando aveva
  // già scritto una DM. Il badge "non letti" (calcolato più sotto da
  // TUTTE le conversazioni viste dalla RLS, non filtrate per attivo)
  // saliva comunque, ma non c'era modo di aprire quella conversazione per
  // leggerla — un contatore che cresce senza una notifica raggiungibile.
  // Ora si legge `attivo` per ogni persona e si include comunque, sotto,
  // chi ha già una conversazione esistente anche se non più attivo.
  const [{ data: persone }, { data: conversazioni }, { data: letture }] = await Promise.all([
    supabase.from("persone").select("id, nome, attivo").neq("id", personaId).order("nome"),
    supabase.from("conversazioni").select("*"),
    supabase.from("conversazioni_letture").select("conversazione_id, ultimo_letto_il").eq("persona_id", personaId),
  ]);

  const sistemaId = (persone ?? []).find((p) => p.nome === NOME_PERSONA_SISTEMA)?.id ?? null;

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
  const ultimoPerConv = new Map<string, { testo: string | null; allegato_nome: string | null; creato_il: string; mittente_id: string }>();
  const nonLettiPerConv = new Map<string, number>();
  for (const m of messaggi ?? []) {
    // ★ i messaggi arrivano ordinati per data crescente: l'ultimo che
    // sovrascrive la mappa, per ciascuna conversazione, è sempre il più
    // recente — non serve un ordinamento separato "prendi solo l'ultimo".
    ultimoPerConv.set(m.conversazione_id, { testo: m.testo, allegato_nome: m.allegato_nome, creato_il: m.creato_il, mittente_id: m.mittente_id });
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
    if (!conversazioneId) return { ultimoTesto: null, ultimoAllegatoNome: null, ultimoCreatoIl: null, ultimoDaSistema: false, nonLetti: 0 };
    const ultimo = ultimoPerConv.get(conversazioneId);
    return {
      ultimoTesto: ultimo?.testo ?? null,
      ultimoAllegatoNome: ultimo?.allegato_nome ?? null,
      ultimoCreatoIl: ultimo?.creato_il ?? null,
      ultimoDaSistema: !!ultimo && !!sistemaId && ultimo.mittente_id === sistemaId,
      nonLetti: nonLettiPerConv.get(conversazioneId) ?? 0,
    };
  }

  const persone2: ContattoChat[] = (persone ?? [])
    // ★ un inattivo (es. "Sistema") compare solo se ha già scritto/ricevuto
    // qualcosa — non ingombra l'elenco "a chi scrivo" di staff che non
    // esiste più, ma non nasconde più le notifiche automatiche già arrivate.
    .filter((p) => p.attivo || conversazionePerAltraPersona.has(p.id))
    .map((p) => {
      const conv = conversazionePerAltraPersona.get(p.id);
      return { id: p.id, nome: p.nome, conversazioneId: conv?.id ?? null, ...anteprima(conv?.id) };
    });

  const gruppi2: GruppoChat[] = conversazioniList
    .filter((c) => c.tipo === "gruppo")
    .map((c) => ({ id: c.id, reparto: c.reparto as string, ...anteprima(c.id) }));

  const nonLettiTotali = [...nonLettiPerConv.values()].reduce((s, n) => s + n, 0);

  return { persone: persone2, gruppi: gruppi2, nonLettiTotali, sistemaId };
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
  const { data, error } = await supabase
    .from("messaggi_chat")
    .select("*")
    .eq("conversazione_id", conversazioneId)
    .order("creato_il", { ascending: true })
    .limit(200);
  if (error) console.error("getMessaggi:", error.message);
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

/**
 * Allegato: passa dalla service role come il resto dei documenti del
 * gestionale (bucket privato, mai accesso diretto).
 *
 * ★ FIX (2026-09-04, bug reale: il corpo di una Server Action è limitato
 * di default a 1MB da Next.js — un allegato fino a 10MB dentro `formData`
 * avrebbe dato lo stesso errore generico già diagnosticato altrove in
 * questo gestionale per le foto delle Schede di Installazione) — non più
 * `FormData` col file dentro: il file vero è già caricato dal browser
 * direttamente allo storage (vedi api/chat/upload-url/route.ts), questa
 * azione riceve solo il percorso già caricato e il nome originale.
 */
export async function inviaAllegatoChat(conversazioneId: string, percorso: string, nomeFile: string): Promise<{ errore: string | null }> {
  const supabase = await createClient();
  // ★ FIX SICUREZZA (2026-09, audit generale) — controllava solo
  // getPersonaCorrenteId() (il cookie firmato), non se la Persona fosse
  // ancora attivo, prima di usare sotto la service role per scrivere
  // (bypassa la RLS) — stesso identico bug già corretto altrove in questo
  // gestionale (creaTicket, completaTicketConRapportino).
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: ERRORE_PERSONA_MANCANTE };

  // ★ la RLS (non l'app) decide chi vede una conversazione — qui va
  // ricontrollata a mano perché sotto si passa alla service role, che la
  // bypassa, per scrivere il messaggio.
  const { data: consentita } = await supabase.from("conversazioni").select("id").eq("id", conversazioneId).maybeSingle();
  if (!consentita) return { errore: "Conversazione non trovata o non accessibile." };

  const service = createServiceClient();
  const { error } = await service
    .from("messaggi_chat")
    .insert({ conversazione_id: conversazioneId, mittente_id: persona.id, allegato_url: percorso, allegato_nome: nomeFile });
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
  const { data: consentita, error: erroreLettura } = await supabase.from("conversazioni").select("id").eq("id", conversazioneId).maybeSingle();
  if (erroreLettura) console.error("urlAllegatoChat:", erroreLettura.message);
  if (!consentita) return { errore: "Allegato non trovato o non accessibile.", url: null };

  return urlFirmataDocumento(percorso);
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
  const { data, error } = await supabase
    .from("conversazioni_letture")
    .select("ultimo_letto_il")
    .eq("conversazione_id", conversazioneId)
    .eq("persona_id", altraPersonaId)
    .maybeSingle();
  if (error) console.error("getUltimaLetturaAltro:", error.message);
  return data?.ultimo_letto_il ?? null;
}

export interface RisultatoRicercaChat {
  messaggioId: string;
  conversazioneId: string;
  isGruppo: boolean;
  titolo: string;
  altraPersonaId: string | null;
  testo: string;
  creatoIl: string;
  mittenteNome: string;
}

/** ★ NUOVA (2026-08-27, richiesta esplicita: "ricerca nei messaggi") —
 * prima non esisteva alcun modo di ritrovare un messaggio passato se non
 * scorrendo a memoria. Cerca solo nel testo (non negli allegati, che non
 * hanno un contenuto testuale da confrontare), solo tra le conversazioni
 * già visibili via RLS (nessun client con service role qui: la sicurezza
 * la fa comunque la RLS, come in getMessaggi()). Limitata alle 30 righe
 * più recenti — abbastanza per un team di questa dimensione, evita di
 * dover paginare una vera ricerca full-text. */
export async function cercaMessaggiChat(query: string): Promise<RisultatoRicercaChat[]> {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  const pulita = query.trim();
  if (!personaId || pulita.length < 2) return [];

  const { data: messaggi, error } = await supabase
    .from("messaggi_chat")
    .select("id, conversazione_id, mittente_id, testo, creato_il")
    .not("testo", "is", null)
    .ilike("testo", `%${pulita}%`)
    .order("creato_il", { ascending: false })
    .limit(30);
  if (error) {
    console.error("cercaMessaggiChat:", error.message);
    return [];
  }
  if (!messaggi || messaggi.length === 0) return [];

  const idConversazioni = Array.from(new Set(messaggi.map((m) => m.conversazione_id)));
  const { data: conversazioni } = await supabase
    .from("conversazioni")
    .select("id, tipo, reparto, persona_a_id, persona_b_id")
    .in("id", idConversazioni);
  const mappaConv = new Map((conversazioni ?? []).map((c) => [c.id, c]));

  const idPersoneServono = new Set<string>();
  for (const m of messaggi) idPersoneServono.add(m.mittente_id);
  for (const c of conversazioni ?? []) {
    if (c.tipo === "diretta") {
      if (c.persona_a_id) idPersoneServono.add(c.persona_a_id);
      if (c.persona_b_id) idPersoneServono.add(c.persona_b_id);
    }
  }
  const { data: persone } = await supabase.from("persone").select("id, nome").in("id", Array.from(idPersoneServono));
  const mappaPersone = new Map((persone ?? []).map((p) => [p.id, p.nome]));

  return messaggi
    .map((m): RisultatoRicercaChat | null => {
      const conv = mappaConv.get(m.conversazione_id);
      if (!conv) return null;
      const isGruppo = conv.tipo === "gruppo";
      const altraPersonaId = isGruppo ? null : conv.persona_a_id === personaId ? conv.persona_b_id : conv.persona_a_id;
      const titolo = isGruppo ? (conv.reparto ?? "Gruppo") : (altraPersonaId && mappaPersone.get(altraPersonaId)) || "—";
      return {
        messaggioId: m.id,
        conversazioneId: m.conversazione_id,
        isGruppo,
        titolo,
        altraPersonaId,
        testo: m.testo ?? "",
        creatoIl: m.creato_il,
        mittenteNome: m.mittente_id === personaId ? "Tu" : (mappaPersone.get(m.mittente_id) ?? "—"),
      };
    })
    .filter((r): r is RisultatoRicercaChat => !!r);
}
