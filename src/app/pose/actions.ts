"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getTecnicoEsternoCorrente, impostaCookieTecnicoEsterno, rimuoviCookieTecnicoEsterno } from "@/lib/tecnico-esterno";
import type { Operatore } from "@/lib/operatore";
import { getPersonaCorrente, impostaCookiePersona } from "@/lib/persona";
import { urlFirmataDocumento } from "@/lib/documenti";
import { inviaEmail, emailChiusuraTicket } from "@/lib/email";
import { aggiornaEventoCalendario } from "@/lib/google-calendar";
import { generaTestoRapportino, generaTestoScheda } from "@/lib/testo-rapporto";
import { schedaRiguardaGestionaleAntenne, notificaGestionaleAntenne } from "@/lib/notifiche-antenne";
import { scaricaGiacenzaMateriali, riconciliaAntennaInstallata } from "@/app/(app)/materiali/actions";
import { revalidatePath } from "next/cache";
import type { DatiSchedaLavoro, ContestoClienteTicket } from "@/app/(app)/calendario/actions";
import type { Appuntamento, MaterialeMagazzino, StatoTicket, Ticket, TipoServizioAppuntamento } from "@/lib/types";

// ============================================================
// pose.donewifi.it — sistema per i tecnici esterni, ORA anche per lo
// staff interno (2026-08-26: "semplificare la procedura per i tecnici
// esterni"; esteso 2026-08-28, richiesta esplicita: "poter usare su
// pose.donewifi.it anche la possibilità di entrare con le credenziali di
// chi usa gestione.donewifi" — uso completo, non solo consultazione).
//
// Chi è collegato è sempre un `Operatore` (lib/operatore.ts, già esisteva
// per unificare "chi ha firmato" nella conferma cliente): `{tipo:"tecnico_esterno"}`
// via il cookie firmato di tecnico-esterno.ts, oppure `{tipo:"persona"}` via
// una vera sessione Supabase Auth (stesse credenziali di gestione.donewifi)
// più il cookie persona_id impostato subito dopo, esattamente come fa
// selezionaPersonaDopoLogin() sul login interno. Da qui in poi ogni
// funzione che prima leggeva solo tecnico_esterno_id/creato_da_tecnico_esterno_id
// sceglie la colonna giusta in base a `operatore.tipo`.
// ============================================================

/**
 * ★ Come getOperatoreCorrente() (lib/operatore.ts), ma con una verifica in
 * più necessaria SOLO qui: pose.donewifi.it non passa dal proxy che
 * protegge il resto del gestionale (vedi src/proxy.ts — questo host esce
 * con un return anticipato, prima del controllo `supabase.auth.getUser()`).
 * Per un tecnico esterno non cambia nulla (non usa mai Supabase Auth). Per
 * lo staff interno invece il solo cookie persona_id (valido fino a un
 * anno, per design — vedi persona.ts) non deve MAI bastare da solo:
 * senza questo controllo, una sessione Supabase scaduta o un account
 * disattivato lascerebbero comunque "dentro" pose finché il cookie non
 * scade per conto suo. Qui si richiede sempre una sessione Supabase Auth
 * viva prima di fidarsi del cookie persona.
 */
async function getOperatorePose(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Operatore | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const persona = await getPersonaCorrente(supabase);
    if (persona) return { tipo: "persona", id: persona.id, nome: persona.nome };
  }
  // Nessuna sessione Supabase valida (o valida ma senza persona attiva
  // collegata): può essere comunque un tecnico esterno, che non passa
  // mai da qui.
  const tecnico = await getTecnicoEsternoCorrente();
  if (tecnico) return { tipo: "tecnico_esterno", id: tecnico.id, nome: [tecnico.nome, tecnico.cognome].filter(Boolean).join(" ") };
  return null;
}

/**
 * ★ Versione pubblica di getOperatorePose(), da chiamare direttamente dalle
 * pagine di pose (interventi/[id], appuntamenti/[id], calendario) al posto
 * del solo `getTecnicoEsternoCorrente()`: senza questo, lo staff interno
 * collegato con le proprie credenziali passerebbe la home /pose ma
 * verrebbe rimandato al login su ogni pagina di dettaglio.
 */
export async function chiUsaPose(): Promise<Operatore | null> {
  const supabase = await createClient();
  return getOperatorePose(supabase);
}

export async function loginTecnicoEsterno(username: string, password: string): Promise<{ errore: string | null }> {
  const usernamePulito = username.trim();
  if (!usernamePulito || !password) return { errore: "Inserisci nome utente e password." };

  const service = createServiceClient();
  const { data: id, error } = await service.rpc("verifica_login_tecnico_esterno", {
    p_username: usernamePulito,
    p_password: password,
  });
  if (error) {
    // ★ FIX (2026-08-31, controllo d'oro usabilità) — il messaggio Postgres
    // grezzo arrivava al tecnico esterno sul campo, da smartphone, invece di
    // un errore comprensibile; resta ora nei log server.
    console.error("loginTecnicoEsterno — RPC verifica_login_tecnico_esterno:", error.message);
    return { errore: "Errore di accesso — riprova." };
  }
  if (!id) return { errore: "Nome utente o password errati." };

  await impostaCookieTecnicoEsterno(id);
  return { errore: null };
}

/**
 * ★ NUOVA (2026-08-28) — login su pose.donewifi.it con le stesse
 * credenziali (email + password) di gestione.donewifi: vera sessione
 * Supabase Auth, poi ci si comporta come selezionaPersonaDopoLogin() sul
 * login interno (persone.auth_user_id → cookie persona_id). Se l'account
 * esiste ma non è collegato a nessuna Persona attiva, la sessione Auth
 * viene subito chiusa: su pose non ha senso restare autenticati senza
 * poter risolvere "di chi sono gli interventi".
 */
export async function loginStaffPose(email: string, password: string): Promise<{ errore: string | null }> {
  const emailPulita = email.trim();
  if (!emailPulita || !password) return { errore: "Inserisci email e password." };

  const supabase = await createClient();
  const { error: erroreAuth } = await supabase.auth.signInWithPassword({ email: emailPulita, password });
  if (erroreAuth) return { errore: "Email o password non corrette." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Email o password non corrette." };

  const service = createServiceClient();
  const { data: persona } = await service
    .from("persone")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("attivo", true)
    .maybeSingle();

  if (!persona) {
    await supabase.auth.signOut();
    return { errore: "Questo account non è collegato a nessuna persona attiva del gestionale." };
  }

  await impostaCookiePersona(persona.id);
  return { errore: null };
}

/** Chiude qualunque sessione pose sia attiva — tecnico esterno o staff interno. */
export async function logoutPose() {
  await rimuoviCookieTecnicoEsterno();
  const supabase = await createClient();
  await supabase.auth.signOut();
}

// ★ nome storico mantenuto come alias — logoutPose() copre anche il caso
// staff interno, ma il bottone/pagina di logout esistenti chiamano già
// questo nome.
export const logoutTecnicoEsterno = logoutPose;

export interface InterventiTecnicoEsterno {
  /** `nome` è già il nome completo (nome+cognome uniti per un tecnico
   * esterno, solo nome per una Persona — vedi lib/operatore.ts). */
  tecnico: { id: string; nome: string; tipo: Operatore["tipo"] };
  tickets: Ticket[];
  appuntamenti: Appuntamento[];
  /** ★ NUOVA (2026-08-28, "mancano un po' di pose da fare") — appuntamenti
   * "Programmato" senza NESSUN tecnico assegnato (né interno né esterno):
   * prima erano invisibili ovunque, anche a chi era pronto a farli, perché
   * ogni vista pose/Vista Tecnico filtra per un tecnico_id/tecnico_esterno_id
   * preciso. Chiunque collegato a pose li vede tutti e può "prenderli in
   * carico" — vedi prendiInCaricoAppuntamentoPose() più sotto. */
  appuntamentiNonAssegnati: Appuntamento[];
}

/** Colonna di assegnazione giusta per questo operatore, sulla tabella indicata. */
function colonnaAssegnazione(op: Operatore, tabella: "tickets" | "appuntamenti"): string {
  if (op.tipo === "tecnico_esterno") return "tecnico_esterno_id";
  return tabella === "tickets" ? "tecnico_assegnato" : "tecnico_id";
}

/**
 * Tutto ciò che è assegnato all'operatore collegato a pose — tecnico
 * esterno o, dal 2026-08-28, staff interno via le sue stesse credenziali
 * di gestione.donewifi — o `null` se nessuna sessione valida (la pagina
 * reindirizza al login in quel caso).
 *
 * ★ FIX (2026-08-28, richiesta esplicita: "bisogna avere anche una
 * sezione in cui ci sono le installazioni da fare rapporto di lavoro
 * quando non completate") — prima gli appuntamenti si filtravano con
 * `.gte("data_ora", oggi)`: un appuntamento "Programmato" con una data
 * ormai passata (intervento saltato, rimandato, o semplicemente mai
 * chiuso perché quel giorno non si è riusciti a compilare la Scheda)
 * SPARIVA del tutto dalla dashboard del tecnico esterno, senza che lui
 * (né nessun altro, guardando solo pose) se ne accorgesse più — l'unico
 * modo per notarlo era controllare dal gestionale interno. Ora si
 * prendono TUTTI gli appuntamenti "Programmato" del tecnico, passati e
 * futuri: la pagina (vedi pose/page.tsx) li divide in "In ritardo" e
 * "In programma" invece di lasciarli mescolati per data.
 */
export async function getInterventiTecnicoEsterno(): Promise<InterventiTecnicoEsterno | null> {
  const supabase = await createClient();
  const operatore = await getOperatorePose(supabase);
  if (!operatore) return null;

  const service = createServiceClient();
  const colonnaTickets = colonnaAssegnazione(operatore, "tickets");
  const colonnaAppuntamenti = colonnaAssegnazione(operatore, "appuntamenti");

  const [{ data: tickets }, { data: appuntamenti }, { data: appuntamentiNonAssegnati }] = await Promise.all([
    service
      .from("tickets")
      .select("*")
      .eq(colonnaTickets, operatore.id)
      .not("stato", "in", "(Completato,Annullato)")
      .order("data_creazione", { ascending: false }),
    service
      .from("appuntamenti")
      .select("*")
      .eq(colonnaAppuntamenti, operatore.id)
      .eq("stato", "Programmato")
      .order("data_ora", { ascending: true }),
    service
      .from("appuntamenti")
      .select("*")
      .is("tecnico_id", null)
      .is("tecnico_esterno_id", null)
      .eq("stato", "Programmato")
      .order("data_ora", { ascending: true }),
  ]);

  return {
    tecnico: { id: operatore.id, nome: operatore.nome, tipo: operatore.tipo },
    tickets: (tickets as Ticket[]) ?? [],
    appuntamenti: (appuntamenti as Appuntamento[]) ?? [],
    appuntamentiNonAssegnati: (appuntamentiNonAssegnati as Appuntamento[]) ?? [],
  };
}

/**
 * ★ NUOVA (2026-08-28) — un operatore di pose (interno o esterno) prende in
 * carico un appuntamento finora senza nessuno assegnato. Ricontrolla
 * `tecnico_id`/`tecnico_esterno_id` ancora entrambi null proprio prima di
 * scrivere (non solo lato client): due persone potrebbero aprire pose nello
 * stesso momento e provare a prendere lo stesso appuntamento, va assegnato
 * a chi arriva prima, non a chi clicca per ultimo sovrascrivendo il primo.
 */
export async function prendiInCaricoAppuntamentoPose(appuntamentoId: string): Promise<{ errore: string | null }> {
  const supabase = await createClient();
  const operatore = await getOperatorePose(supabase);
  if (!operatore) return { errore: "Sessione scaduta — accedi di nuovo." };

  const service = createServiceClient();
  const colonna = colonnaAssegnazione(operatore, "appuntamenti");

  const { data, error } = await service
    .from("appuntamenti")
    .update({ [colonna]: operatore.id })
    .eq("id", appuntamentoId)
    .eq("stato", "Programmato")
    .is("tecnico_id", null)
    .is("tecnico_esterno_id", null)
    .select("id")
    .maybeSingle();

  if (error) return { errore: error.message };
  if (!data) return { errore: "Questo appuntamento è già stato preso in carico da qualcun altro." };

  revalidatePath("/pose");
  return { errore: null };
}

/** Il Ticket, solo se assegnato all'operatore collegato — mai un altro. */
export async function getTicketTecnicoEsterno(ticketId: string): Promise<Ticket | null> {
  const supabase = await createClient();
  const operatore = await getOperatorePose(supabase);
  if (!operatore) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("tickets")
    .select("*")
    .eq("id", ticketId)
    .eq(colonnaAssegnazione(operatore, "tickets"), operatore.id)
    .maybeSingle();
  return (data as Ticket | null) ?? null;
}

export async function urlDocumentoRapportinoEsterno(percorso: string): Promise<{ errore: string | null; url: string | null }> {
  const supabase = await createClient();
  const operatore = await getOperatorePose(supabase);
  if (!operatore) return { errore: "Sessione scaduta — accedi di nuovo.", url: null };
  return urlFirmataDocumento(percorso);
}

/**
 * ★ Equivalente di `completaTicketConRapportino()` (tickets/actions.ts) ma
 * per pose: stessa logica di business (rapportino + chiusura Ticket +
 * storico + email cliente), gate e scrittura diversi — solo service role
 * (RLS bypassata), e per un tecnico esterno `creato_da_tecnico_esterno_id`
 * al posto di `creato_da` (FK diverse, vedi migrazione 0061). Tenuta
 * volutamente separata invece di generalizzare l'originale: i due percorsi
 * di autenticazione sono troppo diversi per un parametro opzionale senza
 * confondere chi legge quale delle due può scrivere cosa.
 *
 * ★ ESTESA (2026-08-28) — l'operatore può ora essere anche una Persona
 * (staff interno collegato con le credenziali di gestione.donewifi): in
 * quel caso, a differenza di un tecnico esterno, `storico.operatore_id`
 * PUÒ essere valorizzato correttamente (la FK verso persone esiste
 * davvero) invece di restare null con solo il nome nel testo.
 */
export async function completaTicketConRapportinoEsterno(
  ticketId: string,
  statoVecchio: StatoTicket,
  dati: { esito: string; lavoriSvolti: string; materiali: string; importoFatturato: string },
  foto: File[]
): Promise<{ errore: string | null }> {
  const supabase = await createClient();
  const operatore = await getOperatorePose(supabase);
  if (!operatore) return { errore: "Sessione scaduta — accedi di nuovo." };
  if (!dati.esito.trim()) return { errore: "L'esito dell'intervento è obbligatorio." };
  // ★ SEMPLIFICATA (2026-08-27, richiesta esplicita — revisione Ticket via
  // artifact: "deve solo inviare il rapportino al cliente") — stessa
  // semplificazione della versione staff interno (tickets/actions.ts),
  // vedi lì per il commento completo. Il riepilogo arriva comunque via
  // email più sotto, solo non più come requisito per chiudere.

  const service = createServiceClient();

  // ★ select statico con entrambe le colonne di assegnazione possibili
  // (invece di una stringa dinamica): un template letterale nel `.select()`
  // rompe l'inferenza dei tipi generata da Supabase (vedi il tipo `ticketRiga`
  // qui sotto), oltre a essere meno leggibile.
  const { data: ticketRiga } = await service
    .from("tickets")
    .select("cliente, numero, email, reparto, tecnico_assegnato, tecnico_esterno_id")
    .eq("id", ticketId)
    .single();
  const idAssegnato = operatore.tipo === "tecnico_esterno" ? ticketRiga?.tecnico_esterno_id : ticketRiga?.tecnico_assegnato;
  if (!ticketRiga || idAssegnato !== operatore.id) {
    return { errore: "Questo intervento non risulta assegnato a te." };
  }

  const fotoSalvate: { nome: string; percorso: string }[] = [];
  for (const file of foto) {
    if (file.size === 0) continue;
    const percorso = `rapportini/${ticketId}/${Date.now()}-${file.name}`;
    const { error: erroreFoto } = await service.storage.from("documenti").upload(percorso, file, {
      contentType: file.type || "application/octet-stream",
    });
    if (erroreFoto) return { errore: `Errore caricamento "${file.name}": ${erroreFoto.message}` };
    fotoSalvate.push({ nome: file.name, percorso });
  }

  const { error: erroreRapportino } = await service.from("rapportini_intervento").insert({
    ticket_id: ticketId,
    esito: dati.esito.trim(),
    lavori_svolti: dati.lavoriSvolti.trim() || null,
    materiali: dati.materiali.trim() || null,
    firma_url: null,
    firma_metodo: null,
    firma_email: null,
    firma_verificato_il: null,
    foto: fotoSalvate,
    creato_da: operatore.tipo === "persona" ? operatore.id : null,
    creato_da_tecnico_esterno_id: operatore.tipo === "tecnico_esterno" ? operatore.id : null,
  });
  if (erroreRapportino) return { errore: erroreRapportino.message };

  const importo = dati.importoFatturato.trim() ? Number(dati.importoFatturato) : null;
  const { error: erroreStato } = await service
    .from("tickets")
    .update({ stato: "Completato", aggiornato_il: new Date().toISOString(), importo_fatturato: importo })
    .eq("id", ticketId);
  if (erroreStato) return { errore: erroreStato.message };

  // ★ `storico.operatore_id` è `references persone(id)` — un tecnico
  // esterno non può comparire lì (violerebbe la FK): resta null, il nome
  // va nel testo dell'operazione invece che in una colonna che non può
  // ospitarlo. Una Persona invece può essere referenziata correttamente.
  await service.from("storico").insert({
    origine: "ticket",
    riferimento_id: ticketId,
    operazione: "Cambio Stato",
    valore_prima: statoVecchio,
    valore_dopo: `Completato (${operatore.tipo === "tecnico_esterno" ? "tecnico esterno" : "via pose"}: ${operatore.nome})`,
    operatore_id: operatore.tipo === "persona" ? operatore.id : null,
  });

  if (ticketRiga.email) {
    const { oggetto, corpoHtml, corpoTesto } = emailChiusuraTicket(
      ticketRiga.cliente,
      ticketRiga.numero,
      generaTestoRapportino({ esito: dati.esito.trim(), lavori_svolti: dati.lavoriSvolti.trim() || null, materiali: dati.materiali.trim() || null })
    );
    await inviaEmail({ a: ticketRiga.email, oggetto, corpoHtml, corpoTesto, reparto: ticketRiga.reparto });
  }

  revalidatePath("/pose");
  return { errore: null };
}

/** Catalogo materiali attivi — serve al selettore dentro Scheda
 * Installazione/Lavorazione, stessa fonte già usata internamente. */
export async function getCatalogoMaterialiEsterno(): Promise<MaterialeMagazzino[]> {
  const supabase = await createClient();
  const operatore = await getOperatorePose(supabase);
  if (!operatore) return [];
  const service = createServiceClient();
  const { data } = await service.from("materiali_magazzino").select("*").eq("attivo", true).order("ordine", { ascending: true });
  return (data as MaterialeMagazzino[]) ?? [];
}

/** L'appuntamento, solo se assegnato all'operatore collegato. */
export async function getAppuntamentoTecnicoEsterno(appuntamentoId: string): Promise<Appuntamento | null> {
  const supabase = await createClient();
  const operatore = await getOperatorePose(supabase);
  if (!operatore) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("appuntamenti")
    .select("*")
    .eq("id", appuntamentoId)
    .eq(colonnaAssegnazione(operatore, "appuntamenti"), operatore.id)
    .maybeSingle();
  return (data as Appuntamento | null) ?? null;
}

export interface AppuntamentoSquadra extends Appuntamento {
  /** Nome di chi è assegnato — staff interno o tecnico esterno, quale dei
   * due valorizzato dice quale. */
  assegnatoA: string | null;
  assegnatoEsterno: boolean;
  /** true se questo appuntamento è del tecnico collegato (evidenziato in UI). */
  mio: boolean;
}

/**
 * ★ NUOVA (2026-08-26, richiesta esplicita: "poter consultare il
 * calendario generale") — TUTTI gli appuntamenti della squadra (staff
 * interno + tecnici esterni), non solo i propri, nei prossimi `giorni`
 * giorni. Sola lettura: pose non permette di creare/modificare
 * appuntamenti di altri, solo consultarli — coordinamento, non gestione.
 * Due letture in più (persone, tecnici_esterni) per risolvere i nomi:
 * `tecnico_id`/`tecnico_esterno_id` sono id, non nomi già pronti.
 */
export async function getCalendarioSquadra(giorni: number = 14): Promise<AppuntamentoSquadra[]> {
  const supabase = await createClient();
  const operatore = await getOperatorePose(supabase);
  if (!operatore) return [];

  const service = createServiceClient();
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const fine = new Date(oggi);
  fine.setDate(fine.getDate() + giorni);

  const { data: appuntamenti } = await service
    .from("appuntamenti")
    .select("*")
    .eq("stato", "Programmato")
    .gte("data_ora", oggi.toISOString())
    .lt("data_ora", fine.toISOString())
    .order("data_ora", { ascending: true });

  const righe = (appuntamenti as Appuntamento[] | null) ?? [];
  if (righe.length === 0) return [];

  const idPersone = Array.from(new Set(righe.map((a) => a.tecnico_id).filter((v): v is string => !!v)));
  const idEsterni = Array.from(new Set(righe.map((a) => a.tecnico_esterno_id).filter((v): v is string => !!v)));

  const [{ data: persone }, { data: esterni }] = await Promise.all([
    idPersone.length ? service.from("persone").select("id, nome").in("id", idPersone) : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    idEsterni.length
      ? service.from("tecnici_esterni").select("id, nome, cognome").in("id", idEsterni)
      : Promise.resolve({ data: [] as { id: string; nome: string; cognome: string | null }[] }),
  ]);
  const mappaPersone = new Map((persone ?? []).map((p) => [p.id, p.nome]));
  const mappaEsterni = new Map((esterni ?? []).map((t) => [t.id, [t.nome, t.cognome].filter(Boolean).join(" ")]));

  return righe.map((a) => ({
    ...a,
    assegnatoA: a.tecnico_id ? (mappaPersone.get(a.tecnico_id) ?? "Staff interno") : a.tecnico_esterno_id ? (mappaEsterni.get(a.tecnico_esterno_id) ?? "Tecnico esterno") : null,
    assegnatoEsterno: !!a.tecnico_esterno_id,
    mio: operatore.tipo === "tecnico_esterno" ? a.tecnico_esterno_id === operatore.id : a.tecnico_id === operatore.id,
  }));
}

/**
 * ★ Equivalente di getTipologiaClientePerAppuntamento() (calendario/actions.ts)
 * — stessa firma (porta anche `sottocategoria`, vedi il commento lì per il
 * perché — richiesta esplicita: "il trasferimento... il costo è di 60€ e
 * non il costo di privato o business"), per essere intercambiabile come
 * prop di SchedaInstallazioneForm/SchedaLavorazioneForm. Service role
 * invece del client legato ai cookie: nessuna sessione Supabase Auth.
 */
export async function getTipologiaClientePerAppuntamentoEsterno(appuntamentoId: string): Promise<ContestoClienteTicket> {
  const supabase = await createClient();
  const operatore = await getOperatorePose(supabase);
  if (!operatore) return { tipoCliente: "Privato", sottocategoria: null };
  const service = createServiceClient();
  const { data } = await service
    .from("appuntamenti")
    .select("tickets(tipologia_cliente, sottocategoria)")
    .eq("id", appuntamentoId)
    .maybeSingle();
  const righe = (data?.tickets ?? []) as unknown as { tipologia_cliente: string | null; sottocategoria: string | null }[];
  const tipologia = righe[0]?.tipologia_cliente;
  return {
    tipoCliente: tipologia === "Azienda" || tipologia === "Business" ? "Business" : "Privato",
    sottocategoria: righe[0]?.sottocategoria ?? null,
  };
}

/**
 * ★ Equivalente di salvaSchedaLavoro() (calendario/actions.ts) per un
 * tecnico esterno — stessa logica di business (Scheda Installazione/
 * Lavorazione + completa appuntamento/Ticket + storico + email cliente),
 * gate e scrittura diversi, stesso principio di
 * completaTicketConRapportinoEsterno() sopra: azione a sé invece di
 * generalizzare l'originale, con `creato_da_tecnico_esterno_id` al posto
 * di `creato_da` (FK diverse, vedi migrazione 0062).
 */
export async function salvaSchedaLavoroEsterno(
  appuntamentoId: string,
  tipo: TipoServizioAppuntamento,
  dati: DatiSchedaLavoro,
  foto: File[]
): Promise<{ errore: string | null }> {
  const supabase = await createClient();
  const operatore = await getOperatorePose(supabase);
  if (!operatore) return { errore: "Sessione scaduta — accedi di nuovo." };

  const service = createServiceClient();

  // ★ stesso motivo del select statico in completaTicketConRapportinoEsterno()
  // sopra: entrambe le colonne di assegnazione, invece di una stringa
  // dinamica che romperebbe l'inferenza dei tipi di Supabase.
  const { data: appuntamento } = await service
    .from("appuntamenti")
    .select("id, ticket_id, titolo, google_event_id, tecnico_id, tecnico_esterno_id")
    .eq("id", appuntamentoId)
    .single();
  if (!appuntamento) return { errore: "Appuntamento non trovato." };
  const idAssegnatoAppuntamento = operatore.tipo === "tecnico_esterno" ? appuntamento.tecnico_esterno_id : appuntamento.tecnico_id;
  if (idAssegnatoAppuntamento !== operatore.id) {
    return { errore: "Questo appuntamento non risulta assegnato a te." };
  }

  // ★ ESTESO (2026-08-28, "bypassare... con otp agli amministratori") —
  // stessa estensione di salvaSchedaLavoro() (calendario/actions.ts), vedi
  // lì per il commento completo: "otp_admin" non ha un'email cliente da
  // controllare, serve invece adminId.
  if (!dati.firmaCliente?.metodo) {
    return { errore: "Manca la conferma del cliente (codice email, link di approvazione, o autorizzazione admin)." };
  }
  if (dati.firmaCliente.metodo !== "otp_admin" && !dati.firmaCliente.email) {
    return { errore: "Manca la conferma del cliente (codice email o link di approvazione)." };
  }
  if (dati.firmaCliente.metodo === "otp_admin" && !dati.firmaCliente.adminId) {
    return { errore: "Manca l'amministratore che ha autorizzato." };
  }
  if ((dati.firmaCliente.metodo === "otp_email" || dati.firmaCliente.metodo === "otp_admin") && !dati.firmaCliente.verificatoIl) {
    return { errore: "Il codice non risulta verificato." };
  }

  const fotoSalvate: { nome: string; percorso: string }[] = [];
  for (const file of foto) {
    if (file.size === 0) continue;
    const percorso = `schede/${appuntamentoId}/${Date.now()}-${file.name}`;
    const { error } = await service.storage.from("documenti").upload(percorso, file, { contentType: file.type || "application/octet-stream" });
    if (error) return { errore: `Errore caricamento "${file.name}": ${error.message}` };
    fotoSalvate.push({ nome: file.name, percorso });
  }

  // ★ FIX (2026-08-26, "controllo d'oro") — la firma del tecnico non viene
  // più raccolta dal flusso "una domanda alla volta" di pose (rimossa nella
  // revisione domande): `dati.firmaTecnicoDataUrl` qui è sempre undefined,
  // quindi il salvataggio era codice morto. Rimosso invece di lasciarlo:
  // `firma_tecnico_url` resta sempre null per le schede create da pose.

  const importo = dati.materiali.reduce((s, m) => s + m.prezzo_unitario * m.quantita, 0);

  const { data: schedaCreata, error: erroreScheda } = await service
    .from("schede_lavoro")
    .insert({
      appuntamento_id: appuntamentoId,
      ticket_id: appuntamento.ticket_id,
      tipo,
      esito: dati.esito.trim() || null,
      note: dati.note.trim() || null,
      importo_fatturato: importo,
      metodo_pagamento_posa: dati.metodoPagamentoPosa,
      materiali: dati.materiali,
      foto: fotoSalvate,
      firma_cliente_url: null,
      firma_cliente_metodo: dati.firmaCliente.metodo,
      firma_cliente_email: dati.firmaCliente.email || null,
      firma_cliente_verificato_il: dati.firmaCliente.verificatoIl,
      firma_cliente_admin_id: dati.firmaCliente.adminId ?? null,
      firma_tecnico_url: null,
      supporto: dati.supporto || null,
      posizione: dati.posizione || null,
      gps_lat: dati.gpsLat ?? null,
      gps_lng: dati.gpsLng ?? null,
      tipo_cavo: dati.tipoCavo || null,
      metri_cavo: dati.metriCavo ? Number(dati.metriCavo) : null,
      bts: dati.bts || null,
      modello_cpe: dati.modelloCpe || null,
      mac: dati.mac || null,
      vlan: dati.vlan || null,
      rssi: dati.rssi ? Number(dati.rssi) : null,
      snr: dati.snr ? Number(dati.snr) : null,
      router: dati.router || null,
      ping_ms: dati.pingMs ? Number(dati.pingMs) : null,
      download_mbps: dati.downloadMbps ? Number(dati.downloadMbps) : null,
      upload_mbps: dati.uploadMbps ? Number(dati.uploadMbps) : null,
      interventi_eseguiti: dati.interventiEseguiti ?? [],
      creato_da: operatore.tipo === "persona" ? operatore.id : null,
      creato_da_tecnico_esterno_id: operatore.tipo === "tecnico_esterno" ? operatore.id : null,
    })
    .select("id")
    .single();
  if (erroreScheda) return { errore: erroreScheda.message };

  await scaricaGiacenzaMateriali(dati.materiali.map((m) => ({ materiale_id: m.materiale_id, quantita: m.quantita })));
  if (dati.mac?.trim()) {
    await riconciliaAntennaInstallata(dati.mac.trim().toUpperCase(), appuntamento.ticket_id, schedaCreata?.id ?? null);
  }

  // ★ NUOVA (2026-08-27, richiesta esplicita: "il rapporto di lavoro deve
  // andare sul gestionale principale... in modo che poi venga inserito
  // dall'operatore nel gestionale esterno delle antenne") — stessa logica
  // della versione staff interno in calendario/actions.ts, vedi lì per il
  // commento completo.
  if (schedaRiguardaGestionaleAntenne(tipo, dati.mac)) {
    let clienteAntenna = appuntamento.titolo;
    let numeroAntenna: number | null = null;
    if (appuntamento.ticket_id) {
      const { data: ticketAntenna } = await service.from("tickets").select("cliente, numero").eq("id", appuntamento.ticket_id).maybeSingle();
      if (ticketAntenna) {
        clienteAntenna = ticketAntenna.cliente;
        numeroAntenna = ticketAntenna.numero;
      }
    }
    await notificaGestionaleAntenne({
      cliente: clienteAntenna,
      ticketNumero: numeroAntenna,
      tipo,
      mac: dati.mac || null,
      bts: dati.bts || null,
      modelloCpe: dati.modelloCpe || null,
      gpsLat: dati.gpsLat ?? null,
      gpsLng: dati.gpsLng ?? null,
    });
  }

  const { error: erroreApp } = await service.from("appuntamenti").update({ stato: "Completato" }).eq("id", appuntamentoId);
  if (erroreApp) return { errore: erroreApp.message };
  if (appuntamento.google_event_id) {
    await aggiornaEventoCalendario(appuntamento.google_event_id, { summary: `✅ ${appuntamento.titolo}` });
  }

  if (appuntamento.ticket_id) {
    const { data: ticket } = await service
      .from("tickets")
      .select("cliente, numero, email, reparto, stato")
      .eq("id", appuntamento.ticket_id)
      .single();
    if (ticket) {
      const { error: erroreTicket } = await service
        .from("tickets")
        .update({ stato: "Completato", aggiornato_il: new Date().toISOString(), importo_fatturato: importo })
        .eq("id", appuntamento.ticket_id);
      if (erroreTicket) return { errore: erroreTicket.message };
      await service.from("storico").insert({
        origine: "ticket",
        riferimento_id: appuntamento.ticket_id,
        operazione: tipo === "Nuova installazione" ? "Certificato Installazione" : "Rapporto Intervento in Loco",
        valore_prima: ticket.stato,
        valore_dopo: `Completato (${operatore.tipo === "tecnico_esterno" ? "tecnico esterno" : "via pose"}: ${operatore.nome})`,
        operatore_id: operatore.tipo === "persona" ? operatore.id : null,
      });
      if (ticket.email) {
        const { oggetto, corpoHtml, corpoTesto } = emailChiusuraTicket(
          ticket.cliente,
          ticket.numero,
          generaTestoScheda({
            tipo,
            esito: dati.esito.trim() || null,
            note: dati.note.trim() || null,
            supporto: dati.supporto || null,
            posizione: dati.posizione || null,
            tipo_cavo: dati.tipoCavo || null,
            metri_cavo: dati.metriCavo ? Number(dati.metriCavo) : null,
            bts: dati.bts || null,
            modello_cpe: dati.modelloCpe || null,
            mac: dati.mac || null,
            vlan: dati.vlan || null,
            rssi: dati.rssi ? Number(dati.rssi) : null,
            snr: dati.snr ? Number(dati.snr) : null,
            router: dati.router || null,
            ping_ms: dati.pingMs ? Number(dati.pingMs) : null,
            download_mbps: dati.downloadMbps ? Number(dati.downloadMbps) : null,
            upload_mbps: dati.uploadMbps ? Number(dati.uploadMbps) : null,
            materiali: dati.materiali,
            metodo_pagamento_posa: dati.metodoPagamentoPosa,
            interventi_eseguiti: dati.interventiEseguiti ?? [],
          })
        );
        await inviaEmail({ a: ticket.email, oggetto, corpoHtml, corpoTesto, reparto: ticket.reparto });
      }
    }
  }

  revalidatePath("/pose");
  return { errore: null };
}
