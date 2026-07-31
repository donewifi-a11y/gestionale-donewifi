"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { revalidatePath } from "next/cache";

async function verificaAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Non autenticato.";

  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona)) {
    return "Non hai i permessi per sincronizzare l'anagrafica.";
  }
  return null;
}

interface RigaClienteAruba {
  id: string;
  nome: string | null;
  cognome: string | null;
  ragionesociale: string | null;
  codfisc: string | null;
  piva: string | null;
  email: string | null;
  telefono: string | null;
  indirizzo: string | null;
  numero: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  codicegestionale: string | null;
  idcontratto: string | null;
  contrattoattivo: string | null;
  idprofilo: string | null;
}

interface RigaAnagraficaAruba {
  nome: string | null;
  cognome: string | null;
  ragionesociale: string | null;
  codfisc: string | null;
  piva: string | null;
  email: string | null;
  indirizzo: string | null;
  numero: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
}

function pulito(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

/**
 * ★ NUOVA — l'anagrafica clienti vive nel database Aruba del sito
 * pubblico (mydone.it), non raggiungibile direttamente da qui (accesso
 * remoto MySQL bloccato lato Aruba). Un piccolo ponte PHP ospitato sullo
 * stesso hosting Aruba espone i campi necessari via HTTPS — questa action
 * lo chiama, unisce md_archivio_clienti con anagrafiche (per completare
 * ragione sociale/P.IVA quando mancano, abbinando per CF) e aggiorna
 * clienti_esterni. Manuale (pulsante admin) invece che un cron: il piano
 * Vercel Hobby del progetto permette solo 2 cron job, già usati altrove.
 */
export async function sincronizzaAnagraficaAruba(): Promise<{ errore: string | null; sincronizzati: number }> {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso, sincronizzati: 0 };

  const url = process.env.ARUBA_BRIDGE_URL;
  const segreto = process.env.ARUBA_BRIDGE_SECRET;
  if (!url || !segreto) return { errore: "ARUBA_BRIDGE_URL/ARUBA_BRIDGE_SECRET non configurate.", sincronizzati: 0 };

  let risposta: Response;
  try {
    risposta = await fetch(`${url}?secret=${encodeURIComponent(segreto)}`, { cache: "no-store" });
  } catch {
    return { errore: "Impossibile raggiungere il ponte Aruba.", sincronizzati: 0 };
  }
  if (!risposta.ok) return { errore: `Ponte Aruba: HTTP ${risposta.status}`, sincronizzati: 0 };

  const { clienti, anagrafiche } = (await risposta.json()) as {
    clienti: RigaClienteAruba[];
    anagrafiche: RigaAnagraficaAruba[];
  };

  const mappaAnagrafiche = new Map<string, RigaAnagraficaAruba>();
  for (const a of anagrafiche) {
    const chiave = pulito(a.codfisc) || pulito(a.piva);
    if (chiave) mappaAnagrafiche.set(chiave, a);
  }

  const righe = clienti.map((c) => {
    const chiave = pulito(c.codfisc) || pulito(c.piva);
    const extra = chiave ? mappaAnagrafiche.get(chiave) : undefined;
    return {
      id: Number(c.id),
      nome: pulito(c.nome) || pulito(extra?.nome),
      cognome: pulito(c.cognome) || pulito(extra?.cognome),
      ragionesociale: pulito(c.ragionesociale) || pulito(extra?.ragionesociale),
      codice_fiscale: pulito(c.codfisc),
      partita_iva: pulito(c.piva) || pulito(extra?.piva),
      email: pulito(c.email) || pulito(extra?.email),
      telefono: pulito(c.telefono),
      indirizzo: pulito(c.indirizzo) || pulito(extra?.indirizzo),
      numero_civico: pulito(c.numero) || pulito(extra?.numero),
      cap: pulito(c.cap) || pulito(extra?.cap),
      comune: pulito(c.comune) || pulito(extra?.comune),
      provincia: pulito(c.provincia) || pulito(extra?.provincia),
      codice_gestionale: pulito(c.codicegestionale),
      id_contratto: pulito(c.idcontratto),
      contratto_attivo: pulito(c.contrattoattivo) === "S",
      profilo_internet: pulito(c.idprofilo),
      aggiornato_il: new Date().toISOString(),
    };
  });

  const service = createServiceClient();
  const DIMENSIONE_BLOCCO = 500;
  for (let i = 0; i < righe.length; i += DIMENSIONE_BLOCCO) {
    const blocco = righe.slice(i, i + DIMENSIONE_BLOCCO);
    const { error } = await service.from("clienti_esterni").upsert(blocco, { onConflict: "id" });
    if (error) return { errore: error.message, sincronizzati: i };
  }

  revalidatePath("/clienti-esterni");
  return { errore: null, sincronizzati: righe.length };
}

export async function getStoricoProfiloCliente(clienteEsternoId: number) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clienti_esterni_storico_profilo")
    .select("*")
    .eq("cliente_esterno_id", clienteEsternoId)
    .order("rilevato_il", { ascending: false });
  return data ?? [];
}
