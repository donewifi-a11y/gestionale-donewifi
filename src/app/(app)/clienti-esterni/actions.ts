"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { fetchTuttiClientiEsterni } from "@/lib/clienti-esterni";
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

  // ★ il flag "attivo" mostrato in tutta l'app non è il campo grezzo
  // Aruba (inaffidabile, tenuto solo per riferimento) ma dedotto da chi
  // ha davvero fatturato negli ultimi 90 giorni — va ricalcolato ogni
  // volta che cambia l'anagrafica o le fatture.
  await service.rpc("ricalcola_clienti_attivi");

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

interface RigaFatturaAruba {
  codice: string;
  numero: string;
  emissione: string | null;
  scadenza: string | null;
  importo: string | null;
  pagata: string | null;
  piva: string | null;
  cfisc: string | null;
  nominativo: string | null;
  tipo_pag: string | null;
}

/** "24/06/2020 0:00:00" (o solo "24/06/2020") → "2020-06-24", per una colonna date. */
function dataItalianaAIso(v: string | null): string | null {
  const t = pulito(v);
  if (!t) return null;
  const [dataParte] = t.split(" ");
  const [giorno, mese, anno] = dataParte.split("/");
  if (!giorno || !mese || !anno) return null;
  return `${anno.padStart(4, "0")}-${mese.padStart(2, "0")}-${giorno.padStart(2, "0")}`;
}

/**
 * ★ NUOVA — 59mila fatture, troppe per una sola risposta del ponte PHP:
 * si scaricano a pagine (vedi ?tabella=fatture&offset=...&limite=... nel
 * ponte) e si scrivono via via, invece di tenerle tutte in memoria.
 * Scarta le fatture il cui CF/PIVA non corrisponde a nessun cliente noto
 * (ex clienti cessati mai rimossi da Aruba, o un'altra linea di business
 * come l'ospitalità torri/ripetitori) — non sono clienti nostri.
 */
export async function sincronizzaFattureAruba(): Promise<{ errore: string | null; sincronizzati: number; scartate?: number }> {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso, sincronizzati: 0 };

  const url = process.env.ARUBA_BRIDGE_URL;
  const segreto = process.env.ARUBA_BRIDGE_SECRET;
  if (!url || !segreto) return { errore: "ARUBA_BRIDGE_URL/ARUBA_BRIDGE_SECRET non configurate.", sincronizzati: 0 };

  const service = createServiceClient();

  // ★ le fatture Aruba includono anche nominativi che non compaiono in
  // md_archivio_clienti (ex clienti cessati mai rimossi da Aruba, o
  // un'altra linea di business come l'ospitalità torri/ripetitori) — non
  // sono clienti nostri, si escludono per non gonfiare fatturato/insoluti.
  const supabase = await createClient();
  const clientiNoti = await fetchTuttiClientiEsterni<{ codice_fiscale: string | null; partita_iva: string | null }>(
    supabase,
    "codice_fiscale, partita_iva"
  );
  const chiaviClientiNoti = new Set<string>();
  for (const c of clientiNoti) {
    if (c.codice_fiscale) chiaviClientiNoti.add(c.codice_fiscale.trim());
    if (c.partita_iva) chiaviClientiNoti.add(c.partita_iva.trim());
  }

  const LIMITE_PAGINA = 5000;
  let offset = 0;
  let totale = 0;
  let sincronizzati = 0;
  let scartate = 0;

  do {
    let risposta: Response;
    try {
      risposta = await fetch(
        `${url}?secret=${encodeURIComponent(segreto)}&tabella=fatture&offset=${offset}&limite=${LIMITE_PAGINA}`,
        { cache: "no-store" }
      );
    } catch {
      return { errore: `Impossibile raggiungere il ponte Aruba (offset ${offset}).`, sincronizzati };
    }
    if (!risposta.ok) return { errore: `Ponte Aruba: HTTP ${risposta.status} (offset ${offset})`, sincronizzati };

    const pagina = (await risposta.json()) as { fatture: RigaFatturaAruba[]; totale: number };
    totale = pagina.totale;

    // ★ la sorgente ha qualche doppione di (codice, numero) — dedup per
    // chiave prima di scrivere, altrimenti l'upsert rifiuta l'intero
    // blocco ("cannot affect row a second time").
    const mappaRighe = new Map<string, (typeof pagina.fatture)[number]>();
    for (const f of pagina.fatture) mappaRighe.set(`${f.codice}|${f.numero}`, f);

    const righeComplete = Array.from(mappaRighe.values()).map((f) => ({
      codice: f.codice,
      numero: f.numero,
      emissione: dataItalianaAIso(f.emissione),
      scadenza: dataItalianaAIso(f.scadenza),
      importo: f.importo ? Number(f.importo) : null,
      pagata: pulito(f.pagata) === "1",
      partita_iva: pulito(f.piva),
      codice_fiscale: pulito(f.cfisc),
      nominativo: pulito(f.nominativo),
      tipo_pagamento: pulito(f.tipo_pag),
      aggiornato_il: new Date().toISOString(),
    }));

    const righe = righeComplete.filter(
      (f) => (f.codice_fiscale && chiaviClientiNoti.has(f.codice_fiscale)) || (f.partita_iva && chiaviClientiNoti.has(f.partita_iva))
    );
    scartate += righeComplete.length - righe.length;

    if (righe.length > 0) {
      const { error } = await service.from("fatture_esterne").upsert(righe, { onConflict: "codice,numero" });
      if (error) return { errore: error.message, sincronizzati };
    }

    sincronizzati += righe.length;
    offset += LIMITE_PAGINA;
  } while (offset < totale);

  await service.rpc("ricalcola_clienti_attivi");

  revalidatePath("/clienti-esterni");
  return { errore: null, sincronizzati, scartate };
}

export async function getFattureCliente(codiceFiscale: string | null, partitaIva: string | null) {
  if (!codiceFiscale && !partitaIva) return [];
  const supabase = await createClient();
  let query = supabase.from("fatture_esterne").select("*").order("emissione", { ascending: false });
  query = codiceFiscale ? query.eq("codice_fiscale", codiceFiscale) : query.eq("partita_iva", partitaIva!);
  const { data } = await query;
  return data ?? [];
}

/** ★ NUOVA — collega la scheda cliente ai Ticket del gestionale: non c'è
 * una chiave comune affidabile (l'importazione Aruba non ha un CF su ogni
 * Ticket), quindi si abbina per telefono, ultime 9 cifre come già fa
 * ClientiBoard altrove nel gestionale. */
export async function getTicketCollegati(telefono: string | null) {
  if (!telefono) return [];
  const ultimeCifre = telefono.replace(/\D/g, "").slice(-9);
  if (ultimeCifre.length < 6) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("tickets")
    .select("id, numero, categoria, stato, priorita, data_creazione")
    .ilike("telefono", `%${ultimeCifre}%`)
    .order("data_creazione", { ascending: false })
    .limit(20);
  return data ?? [];
}

export interface ClienteInsoluto {
  clienteId: number | null;
  nome: string;
  importo: number;
  numeroFatture: number;
}

/** ★ NUOVA — prima di avere fatture_esterne non esisteva alcun modo di
 * vedere gli insoluti nel gestionale. Aggrega per cliente (CF/PIVA),
 * ordina per importo dovuto. */
export async function getRiepilogoInsoluti(): Promise<{ totale: number; numeroFatture: number; clienti: ClienteInsoluto[] }> {
  const supabase = await createClient();
  const { data: fatture } = await supabase.from("fatture_esterne").select("importo, codice_fiscale, partita_iva").eq("pagata", false);
  const righe = fatture ?? [];

  const mappa = new Map<string, { importo: number; numeroFatture: number }>();
  for (const f of righe) {
    const chiave = f.codice_fiscale || f.partita_iva;
    if (!chiave) continue;
    const cur = mappa.get(chiave) ?? { importo: 0, numeroFatture: 0 };
    cur.importo += Number(f.importo) || 0;
    cur.numeroFatture++;
    mappa.set(chiave, cur);
  }

  const chiavi = Array.from(mappa.keys());
  const [{ data: perCf }, { data: perPiva }] = chiavi.length
    ? await Promise.all([
        supabase.from("clienti_esterni").select("id, nome, cognome, ragionesociale, codice_fiscale, partita_iva").in("codice_fiscale", chiavi),
        supabase.from("clienti_esterni").select("id, nome, cognome, ragionesociale, codice_fiscale, partita_iva").in("partita_iva", chiavi),
      ])
    : [{ data: [] }, { data: [] }];
  const mappaClienti = new Map<string, { id: number; nome: string }>();
  for (const c of [...(perCf ?? []), ...(perPiva ?? [])]) {
    const nome = c.ragionesociale || [c.cognome, c.nome].filter(Boolean).join(" ") || "—";
    if (c.codice_fiscale) mappaClienti.set(c.codice_fiscale, { id: c.id, nome });
    if (c.partita_iva) mappaClienti.set(c.partita_iva, { id: c.id, nome });
  }

  const clienti: ClienteInsoluto[] = Array.from(mappa.entries())
    .map(([chiave, v]) => ({
      clienteId: mappaClienti.get(chiave)?.id ?? null,
      nome: mappaClienti.get(chiave)?.nome ?? chiave,
      importo: v.importo,
      numeroFatture: v.numeroFatture,
    }))
    .sort((a, b) => b.importo - a.importo);

  return {
    totale: clienti.reduce((s, c) => s + c.importo, 0),
    numeroFatture: righe.length,
    clienti,
  };
}
