"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { fetchTuttiClientiEsterni } from "@/lib/clienti-esterni";
import { inviaEmail, emailPraticaCliente } from "@/lib/email";
import { revalidatePath } from "next/cache";
import type { AreaAccesso, ClienteEsterno, FatturaEsterna, RichiestaCliente } from "@/lib/types";

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
    // ★ FIX (2026-08) — segnalato dall'utente: "Impossibile raggiungere il
    // ponte Aruba" da Vercel, mentre lo stesso URL rispondeva subito
    // (200 OK, <1s) chiamato da fuori — l'hosting condiviso Aruba/cPanel
    // spesso ha una protezione anti-bot (mod_security o simile) che blocca
    // richieste senza uno User-Agent da browser reale, tipico di
    // `fetch()` lato server (Node/undici manda un UA generico o nessuno).
    // Aggiunto uno User-Agent normale per non farla scambiare per uno
    // scraper. Il catch prima scartava l'errore vero: ora resta loggato
    // (visibile nei log di Vercel) invece di sparire silenziosamente —
    // finora impossibile capire SE fosse un timeout, un blocco o altro.
    risposta = await fetch(`${url}?secret=${encodeURIComponent(segreto)}`, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GestionaleDoneWifi/1.0; +https://gestione.donewifi.it)" },
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    console.error("sincronizzaAnagraficaAruba — fetch ponte fallita:", err);
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
    // ★ FIX — segnalare esplicitamente che si tratta di una sincronizzazione
    // PARZIALE: senza transazione (upsert a blocchi), i blocchi già scritti
    // restano tali anche se uno successivo fallisce — prima l'unico segnale
    // era un messaggio d'errore generico, indistinguibile da un fallimento
    // totale, senza dire che i dati sono ora in uno stato misto vecchio/nuovo.
    if (error) return { errore: `Sincronizzazione interrotta dopo ${i} clienti su ${righe.length}: ${error.message}. Anagrafica parzialmente aggiornata — riprova per completarla.`, sincronizzati: i };
  }

  // ★ il flag "attivo" mostrato in tutta l'app non è il campo grezzo
  // Aruba (inaffidabile, tenuto solo per riferimento) ma dedotto da chi
  // ha davvero fatturato negli ultimi 90 giorni — va ricalcolato ogni
  // volta che cambia l'anagrafica o le fatture.
  // ★ FIX — l'errore di questa chiamata veniva scartato: se il ricalcolo
  // falliva (successo davvero, vedi migrazione 0039), l'anagrafica restava
  // sincronizzata ma il flag "attivo" no, senza che nessuno se ne
  // accorgesse. Ora l'errore torna al chiamante come per ogni altro passo.
  const { error: erroreRicalcolo } = await service.rpc("ricalcola_clienti_attivi");
  if (erroreRicalcolo) return { errore: `Anagrafica sincronizzata, ma il ricalcolo clienti attivi è fallito: ${erroreRicalcolo.message}`, sincronizzati: righe.length };

  revalidatePath("/clienti-esterni");
  return { errore: null, sincronizzati: righe.length };
}

export async function getStoricoProfiloCliente(clienteEsternoId: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clienti_esterni_storico_profilo")
    .select("*")
    .eq("cliente_esterno_id", clienteEsternoId)
    .order("rilevato_il", { ascending: false });
  if (error) console.error("getStoricoProfiloCliente:", error.message);
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
      // ★ FIX — stesso principio di sincronizzaAnagraficaAruba() sopra:
      // User-Agent da browser (anti-bot dell'hosting Aruba/cPanel) e
      // l'errore vero loggato invece di sparire nel catch.
      risposta = await fetch(
        `${url}?secret=${encodeURIComponent(segreto)}&tabella=fatture&offset=${offset}&limite=${LIMITE_PAGINA}`,
        {
          cache: "no-store",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; GestionaleDoneWifi/1.0; +https://gestione.donewifi.it)" },
          signal: AbortSignal.timeout(30000),
        }
      );
    } catch (err) {
      console.error(`sincronizzaFattureAruba — fetch ponte fallita (offset ${offset}):`, err);
      return {
        errore: `Impossibile raggiungere il ponte Aruba (offset ${offset}). ${sincronizzati > 0 ? `Fatture parzialmente aggiornate (${sincronizzati} scritte) — riprova per completare.` : ""}`,
        sincronizzati,
      };
    }
    if (!risposta.ok)
      return {
        errore: `Ponte Aruba: HTTP ${risposta.status} (offset ${offset}). ${sincronizzati > 0 ? `Fatture parzialmente aggiornate (${sincronizzati} scritte) — riprova per completare.` : ""}`,
        sincronizzati,
      };

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
      if (error)
        return {
          errore: `Sincronizzazione interrotta dopo ${sincronizzati} fatture: ${error.message}. Dati parzialmente aggiornati — riprova per completare.`,
          sincronizzati,
        };
    }

    sincronizzati += righe.length;
    offset += LIMITE_PAGINA;
  } while (offset < totale);

  // ★ FIX — stesso discorso di sincronizzaAnagraficaAruba(): l'errore non
  // va scartato, altrimenti il flag "attivo" smette di aggiornarsi senza
  // che nessuno se ne accorga (successo davvero, vedi migrazione 0039).
  const { error: erroreRicalcolo } = await service.rpc("ricalcola_clienti_attivi");
  if (erroreRicalcolo) {
    return {
      errore: `Fatture sincronizzate, ma il ricalcolo clienti attivi è fallito: ${erroreRicalcolo.message}`,
      sincronizzati,
      scartate,
    };
  }

  revalidatePath("/clienti-esterni");
  return { errore: null, sincronizzati, scartate };
}

// ★ FIX — nessuna paginazione: un cliente con oltre 1000 fatture (storico
// lungo, fatturazione frequente) avrebbe visto lo storico troncato in
// silenzio, stesso bug già corretto altrove in questo file (vedi il loop
// `.range()` poco sotto per l'import da Aruba).
export async function getFattureCliente(codiceFiscale: string | null, partitaIva: string | null) {
  if (!codiceFiscale && !partitaIva) return [];
  const supabase = await createClient();
  const PAGINA = 1000;
  const tutte: FatturaEsterna[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    let query = supabase.from("fatture_esterne").select("*").order("emissione", { ascending: false });
    query = codiceFiscale ? query.eq("codice_fiscale", codiceFiscale) : query.eq("partita_iva", partitaIva!);
    const { data, error } = await query.range(offset, offset + PAGINA - 1);
    if (error) console.error("getFattureCliente:", error.message);
    const pagina = (data as FatturaEsterna[] | null) ?? [];
    tutte.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  return tutte;
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
  const { data, error } = await supabase
    .from("tickets")
    .select("id, numero, categoria, stato, priorita, data_creazione")
    .ilike("telefono", `%${ultimeCifre}%`)
    .order("data_creazione", { ascending: false })
    .limit(20);
  if (error) console.error("getTicketCollegati:", error.message);
  return data ?? [];
}

export interface InstallazioneCliente {
  schedaId: string;
  ticketId: string;
  ticketNumero: number;
  contrattoUrl: string | null;
  completataIl: string;
}

/** ★ NUOVA — richiesta esplicita: "una volta che i tecnici installano, la
 * scheda cliente deve avere sotto un elenco delle installazioni fatte con
 * sia il contratto che la scheda di lavoro" — stesso confronto per
 * telefono già in uso per getTicketCollegati()/getPreventiviCollegati(),
 * poi filtrato alle sole Schede di tipo "Nuova installazione" (le uniche
 * che chiudono davvero un'installazione — una Lavorazione tecnica non lo
 * è). Il contratto è quello già allegato al Ticket
 * (`tickets.contratto_pdf_url`, ereditato dalla Segnalazione all'origine);
 * la Scheda vera e propria si vede aprendo il Ticket collegato (già
 * mostrata lì da SchedaVista), non duplicata qui. */
export async function getInstallazioniCliente(telefono: string | null): Promise<InstallazioneCliente[]> {
  if (!telefono) return [];
  const ultimeCifre = telefono.replace(/\D/g, "").slice(-9);
  if (ultimeCifre.length < 6) return [];

  const supabase = await createClient();
  const { data: ticketsCliente } = await supabase
    .from("tickets")
    .select("id, numero, contratto_pdf_url")
    .ilike("telefono", `%${ultimeCifre}%`);
  const idTicket = (ticketsCliente ?? []).map((t) => t.id);
  if (idTicket.length === 0) return [];

  const { data: schede, error } = await supabase
    .from("schede_lavoro")
    .select("id, ticket_id, creato_il")
    .eq("tipo", "Nuova installazione")
    .in("ticket_id", idTicket)
    .order("creato_il", { ascending: false });
  if (error) {
    console.error("getInstallazioniCliente:", error.message);
    return [];
  }

  const ticketPerId = new Map((ticketsCliente ?? []).map((t) => [t.id, t]));
  return (schede ?? [])
    .filter((s): s is typeof s & { ticket_id: string } => !!s.ticket_id)
    .map((s) => {
      const ticket = ticketPerId.get(s.ticket_id);
      return {
        schedaId: s.id,
        ticketId: s.ticket_id,
        ticketNumero: ticket?.numero ?? 0,
        contrattoUrl: ticket?.contratto_pdf_url ?? null,
        completataIl: s.creato_il,
      };
    });
}

/** ★ NUOVA — "che gli stessi (i Preventivi) siano presenti nella scheda
 * cliente", richiesta esplicita: stesso principio di getTicketCollegati()
 * sopra, ma con un match più preciso quando disponibile — un Preventivo
 * creato collegando direttamente questo Cliente Esterno (cliente_esterno_id)
 * conta come corrispondenza certa; altrimenti si ricade sullo stesso
 * confronto per telefono (ultime 9 cifre) già in uso per i Ticket, per
 * intercettare anche i preventivi fatti "a mano" senza collegarli. */
export async function getPreventiviCollegati(clienteEsternoId: number, telefono: string | null) {
  const supabase = await createClient();
  const ultimeCifre = telefono ? telefono.replace(/\D/g, "").slice(-9) : "";

  const query = supabase
    .from("preventivi")
    .select("id, numero, cliente_nome, stato, totale, creato_il")
    .order("creato_il", { ascending: false })
    .limit(20);

  const { data, error } =
    ultimeCifre.length >= 6
      ? await query.or(`cliente_esterno_id.eq.${clienteEsternoId},cliente_telefono.ilike.%${ultimeCifre}%`)
      : await query.eq("cliente_esterno_id", clienteEsternoId);

  if (error) console.error("getPreventiviCollegati:", error.message);
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

  // ★ FIX — una `.select()` senza `.range()` è limitata a 1000 righe da
  // Supabase/PostgREST: con le insolute ancora sotto quota il bug è muto,
  // ma appena superano le 1000 il totale insoluti si sottostimerebbe in
  // silenzio (stesso identico bug già trovato e corretto altrove per
  // fatture_esterne/clienti_esterni — vedi sommaImportoFattureDa()).
  const PAGINA = 1000;
  const righe: { importo: number | null; codice_fiscale: string | null; partita_iva: string | null }[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await supabase
      .from("fatture_esterne")
      .select("importo, codice_fiscale, partita_iva")
      .eq("pagata", false)
      .range(offset, offset + PAGINA - 1);
    if (error) console.error("getRiepilogoInsoluti:", error.message);
    const pagina = data ?? [];
    righe.push(...pagina);
    if (pagina.length < PAGINA) break;
  }

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

// ★ NUOVA (2026-08) — "Pratiche cliente senza Ticket": elenco delle
// pratiche (Trasferimento/Cambio IBAN/Cambio Anagrafica/Subentro) collegate
// a questo Cliente Esterno tramite cliente_esterno_id — indipendentemente
// da chi le ha avviate (il cliente stesso dal Portale, o l'operatore da
// qui). Mostrata nella scheda cliente insieme a Preventivi/Ticket/Installazioni.
export async function getPraticheClienteEsterno(clienteEsternoId: number): Promise<RichiestaCliente[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("richieste_clienti")
    .select("*")
    .eq("cliente_esterno_id", clienteEsternoId)
    .order("data", { ascending: false });
  if (error) console.error("getPraticheClienteEsterno:", error.message);
  return (data as RichiestaCliente[] | null) ?? [];
}

// ★ NUOVA (2026-08) — avvia dalla scheda Cliente Esterno (invece che da un
// Ticket) il link pubblico di una delle 3 pratiche self-service: stesso
// modulo di sempre, con cliente_esterno_id già noto (l'operatore è già
// sulla scheda del cliente giusto, nessuna identificazione da rifare).
export async function inviaEmailPraticaClienteEsterno(clienteEsternoId: number, titolo: string, url: string, reparto: AreaAccesso) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const service = createServiceClient();
  const { data: cliente } = await service.from("clienti_esterni").select("nome, cognome, ragionesociale, email").eq("id", clienteEsternoId).maybeSingle();
  if (!cliente) return { errore: "Cliente non trovato." };
  if (!cliente.email) return { errore: "Il cliente non ha un'email registrata in anagrafica." };

  const nome = cliente.ragionesociale || [cliente.nome, cliente.cognome].filter(Boolean).join(" ") || "Cliente";
  const { oggetto, corpoHtml, corpoTesto } = emailPraticaCliente(nome, titolo, url);
  return inviaEmail({ a: cliente.email, oggetto, corpoHtml, corpoTesto, reparto });
}

export interface AttivazioneBuyGo {
  numero: string;
  emissione: string | null;
  scadenza: string | null;
  importo: number | null;
  pagata: boolean | null;
  tipo_pagamento: string | null;
}

export interface ClienteBuyGo {
  chiave: string;
  nome: string;
  telefono: string | null;
  comune: string | null;
  profilo: string;
  attivazioni: AttivazioneBuyGo[];
  numeroAttivazioni: number;
  totalePagato: number;
  totaleNonPagato: number;
  ultimaAttivazione: string | null;
}

/** ★ NUOVA (2026-08) — richiesta esplicita: i clienti Buy&Go/Buy Pro non
 * hanno un canone fisso come gli altri, pagano "a consumo" per periodi che
 * attivano quando vogliono (verificato sui dati reali: stessi clienti con
 * importi diversi — 6,50€/9,50€/13€/16€/19€/39,50€... — a cadenza
 * irregolare, non un abbonamento mensile). Non serve una sincronizzazione
 * nuova: il profilo "Buy & Go"/"Buy Pro" è già dentro clienti_esterni
 * (profilo_internet, sincronizzato da sincronizzaAnagraficaAruba) e lo
 * storico delle attivazioni/pagamenti è già dentro fatture_esterne
 * (sincronizzato da sincronizzaFattureAruba) — qui si incrociano i due per
 * la prima volta.
 */
export async function getClientiBuyGo(): Promise<ClienteBuyGo[]> {
  const supabase = await createClient();

  const tuttiClienti = await fetchTuttiClientiEsterni<ClienteEsterno>(supabase, "*");
  const buygo = tuttiClienti.filter((c) => c.profilo_internet && /buy/i.test(c.profilo_internet));
  if (buygo.length === 0) return [];

  // ★ una stessa persona/azienda può avere più righe anagrafiche (più
  // contratti importati con lo stesso CF/PIVA — stesso principio già noto
  // altrove in questo file, vedi chiaviClientiAttivi in page.tsx): si
  // raggruppa per CF/PIVA, non per riga, altrimenti lo stesso cliente
  // comparirebbe due volte con lo storico attivazioni diviso a metà.
  const perChiave = new Map<string, ClienteEsterno[]>();
  for (const c of buygo) {
    const chiave = (c.codice_fiscale || c.partita_iva || `id:${c.id}`).trim();
    if (!perChiave.has(chiave)) perChiave.set(chiave, []);
    perChiave.get(chiave)!.push(c);
  }

  const chiaviCf = Array.from(new Set(buygo.map((c) => c.codice_fiscale).filter((v): v is string => !!v)));
  const chiaviPiva = Array.from(new Set(buygo.map((c) => c.partita_iva).filter((v): v is string => !!v)));

  // ★ .in() diretto sulle chiavi note (poche centinaia) invece di scandire
  // tutte le ~60mila fatture come fa getRiepilogoInsoluti — qui il
  // sottoinsieme di clienti è già piccolo e mirato.
  const [{ data: perCf }, { data: perPiva }] = await Promise.all([
    chiaviCf.length
      ? supabase.from("fatture_esterne").select("*").in("codice_fiscale", chiaviCf)
      : Promise.resolve({ data: [] as FatturaEsterna[] }),
    chiaviPiva.length
      ? supabase.from("fatture_esterne").select("*").in("partita_iva", chiaviPiva)
      : Promise.resolve({ data: [] as FatturaEsterna[] }),
  ]);

  const fattureViste = new Set<number>();
  const fatturePerChiave = new Map<string, FatturaEsterna[]>();
  for (const f of [...((perCf ?? []) as FatturaEsterna[]), ...((perPiva ?? []) as FatturaEsterna[])]) {
    if (fattureViste.has(f.id)) continue; // una fattura con sia CF che PIVA valorizzati comparirebbe in entrambe le query sopra
    fattureViste.add(f.id);
    const chiave = (f.codice_fiscale || f.partita_iva || "").trim();
    if (!chiave) continue;
    if (!fatturePerChiave.has(chiave)) fatturePerChiave.set(chiave, []);
    fatturePerChiave.get(chiave)!.push(f);
  }

  return Array.from(perChiave.entries())
    .map(([chiave, righe]) => {
      const c = righe[0];
      const fatture = (fatturePerChiave.get(chiave) ?? []).sort((a, b) => (b.emissione ?? "").localeCompare(a.emissione ?? ""));
      const attivazioni: AttivazioneBuyGo[] = fatture.map((f) => ({
        numero: f.numero,
        emissione: f.emissione,
        scadenza: f.scadenza,
        importo: f.importo,
        pagata: f.pagata,
        tipo_pagamento: f.tipo_pagamento,
      }));
      const nome = c.ragionesociale || [c.cognome, c.nome].filter(Boolean).join(" ") || "—";
      const profili = Array.from(new Set(righe.map((r) => r.profilo_internet?.trim()).filter((v): v is string => !!v)));
      return {
        chiave,
        nome,
        telefono: c.telefono,
        comune: c.comune,
        profilo: profili.join(" / "),
        attivazioni,
        numeroAttivazioni: attivazioni.length,
        totalePagato: attivazioni.filter((a) => a.pagata).reduce((s, a) => s + (a.importo ?? 0), 0),
        totaleNonPagato: attivazioni.filter((a) => !a.pagata).reduce((s, a) => s + (a.importo ?? 0), 0),
        ultimaAttivazione: attivazioni[0]?.emissione ?? null,
      };
    })
    .sort((a, b) => (b.ultimaAttivazione ?? "").localeCompare(a.ultimaAttivazione ?? ""));
}
