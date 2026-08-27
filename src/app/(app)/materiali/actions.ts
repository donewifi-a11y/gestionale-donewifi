"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin, personaVedeReparto, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import { notificaSuTuttiICanali } from "@/lib/notifiche-interne";
import { schedaRiguardaGestionaleAntenne } from "@/lib/notifiche-antenne";
import { revalidatePath } from "next/cache";
import type { MaterialeMagazzino, SchedaLavoro } from "@/lib/types";

// ★ NUOVA (2026-08) — `comodato_uso` non è più un campo scritto a mano:
// l'amministratore sceglie solo `tipo_riga` (Comodato/Prodotto/Servizio),
// `comodato_uso` viene sempre derivato qui sotto — le due non possono più
// disallinearsi (prima erano due controlli indipendenti nello stesso
// form). Vedi migrazione 0055.
type DatiMateriale = Pick<
  MaterialeMagazzino,
  "nome" | "categoria" | "descrizione" | "prezzo_unitario" | "unita_misura" | "attivo" | "ordine" | "tipo_riga" | "attivazione_predefinita"
>;

// ★ FIX — nessun controllo lato server sul prezzo, solo `min="0"`
// sull'input HTML (aggirabile). Un prezzo negativo si propagherebbe in
// silenzio nei rapportini e nei totali Dashboard.
function erroreValidazioneMateriale(dati: DatiMateriale): string | null {
  if (!Number.isFinite(dati.prezzo_unitario) || dati.prezzo_unitario < 0) return "Il prezzo non può essere negativo.";
  if (dati.attivazione_predefinita && dati.tipo_riga === "Comodato") {
    return "Una riga in comodato d'uso (prezzo zero) non può essere anche l'attivazione predefinita.";
  }
  return null;
}

/** Riga pronta per l'insert/update: comodato_uso derivato da tipo_riga,
 * prezzo forzato a zero quando è comodato (stessa regola già applicata
 * lato client, ripetuta qui come unica fonte di verità). */
function normalizzaRigaMateriale(dati: DatiMateriale) {
  const comodato = dati.tipo_riga === "Comodato";
  return { ...dati, comodato_uso: comodato, prezzo_unitario: comodato ? 0 : dati.prezzo_unitario };
}

export async function creaMateriale(dati: DatiMateriale) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const erroreValidazione = erroreValidazioneMateriale(dati);
  if (erroreValidazione) return { errore: erroreValidazione };

  const { error } = await supabase.from("materiali_magazzino").insert(normalizzaRigaMateriale(dati));
  if (error) return { errore: error.message };

  revalidatePath("/materiali");
  return { errore: null };
}

export async function aggiornaMateriale(id: string, dati: DatiMateriale) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const erroreValidazione = erroreValidazioneMateriale(dati);
  if (erroreValidazione) return { errore: erroreValidazione };

  const { error } = await supabase.from("materiali_magazzino").update(normalizzaRigaMateriale(dati)).eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/materiali");
  return { errore: null };
}

// ★ NUOVA — toggle rapido per la schermata "In Scheda di lavoro"
// (selettore-visibilita-schede.tsx): non tocca prezzo/categoria/altro, solo
// se il materiale compare o meno nel selettore delle Schede di
// Installazione/Lavorazione Tecnica — indipendente da "attivo".
export async function impostaVisibilitaSchedaMateriale(id: string, visibile: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { error } = await supabase.from("materiali_magazzino").update({ mostra_in_schede_lavoro: visibile }).eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/materiali");
  return { errore: null };
}

export async function eliminaMateriale(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { error } = await supabase.from("materiali_magazzino").delete().eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/materiali");
  return { errore: null };
}

// ── MAGAZZINO (giacenza + soglia) ───────────────────────────────────────
// ★ NUOVA — richiesta esplicita: giacenza reale + avviso di mancanza,
// proposta approvata via artifact (tutte le opzioni consigliate: solo
// amministratore corregge a mano giacenza/soglia).
async function verificaAdminMateriali(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return ERRORE_PERSONA_MANCANTE;
  if (!personaHaAccessoAdmin(persona)) return "Solo un amministratore può correggere la giacenza a magazzino.";
  return null;
}

export async function impostaGiacenzaMateriale(id: string, giacenza: number | null, sogliaMinima: number | null) {
  const supabase = await createClient();
  const erroreAccesso = await verificaAdminMateriali(supabase);
  if (erroreAccesso) return { errore: erroreAccesso };
  if (giacenza != null && (!Number.isFinite(giacenza) || giacenza < 0)) return { errore: "La giacenza non può essere negativa." };
  if (sogliaMinima != null && (!Number.isFinite(sogliaMinima) || sogliaMinima < 0)) return { errore: "La soglia non può essere negativa." };

  const { error } = await supabase.from("materiali_magazzino").update({ giacenza, soglia_minima: sogliaMinima }).eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/materiali");
  return { errore: null };
}

const SOGLIA_RIPETI_AVVISO_ORE = 24;

/** ★ NUOVA — chiamata da salvaSchedaLavoro() (calendario/actions.ts) dopo
 * il salvataggio riuscito di una Scheda di Installazione/Lavorazione: per
 * ogni materiale strutturato usato (materiale_id valorizzato) decrementa
 * la giacenza, se tracciata (giacenza non NULL — un materiale mai
 * censito a magazzino resta un semplice voce di listino, nessun errore).
 * Scende sotto soglia_minima → un avviso in Chat al reparto Analisi Rete,
 * al massimo una volta ogni 24h per materiale. Non lancia mai errori
 * verso il chiamante: un mancato scarico non deve bloccare il salvataggio
 * della scheda (stesso principio delle notifiche best-effort del resto
 * del gestionale). Usa la service role: il chiamante (tecnico sul campo)
 * non deve avere accesso di scrittura diretto alla giacenza per aggirare
 * questa funzione. */
export async function scaricaGiacenzaMateriali(materiali: { materiale_id: string | null; quantita: number }[]) {
  try {
    const service = createServiceClient();
    for (const riga of materiali) {
      if (!riga.materiale_id || !riga.quantita) continue;

      const { data: materiale } = await service
        .from("materiali_magazzino")
        .select("id, nome, giacenza, soglia_minima, ultimo_avviso_il")
        .eq("id", riga.materiale_id)
        .maybeSingle();
      if (!materiale || materiale.giacenza == null) continue; // non tracciato a magazzino

      const nuovaGiacenza = Math.max(0, materiale.giacenza - riga.quantita);
      await service.from("materiali_magazzino").update({ giacenza: nuovaGiacenza }).eq("id", materiale.id);

      const sottoSoglia = materiale.soglia_minima != null && nuovaGiacenza <= materiale.soglia_minima;
      const daAvvisare =
        sottoSoglia &&
        (!materiale.ultimo_avviso_il || Date.now() - new Date(materiale.ultimo_avviso_il).getTime() > SOGLIA_RIPETI_AVVISO_ORE * 60 * 60 * 1000);
      if (daAvvisare) {
        // ★ ESTESA (2026-08-27, "fai la A" — Proposta A dell'artifact
        // "Estensione Notifiche") — prima solo Chat interna, ora anche
        // Telegram ed email.
        await notificaSuTuttiICanali({
          reparto: "Analisi Rete",
          telegramHtml: `📦 <b>Scorta bassa</b>\n\n"${materiale.nome}" a ${nuovaGiacenza} ${nuovaGiacenza === 1 ? "pezzo" : "pezzi"} (soglia ${materiale.soglia_minima}).`,
          chatTesto: `📦 Scorta bassa: "${materiale.nome}" a ${nuovaGiacenza} ${nuovaGiacenza === 1 ? "pezzo" : "pezzi"} (soglia ${materiale.soglia_minima}).`,
          emailTitolo: `Scorta bassa — ${materiale.nome}`,
          emailCorpoHtml: `<p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">"<b>${materiale.nome}</b>" è sceso a ${nuovaGiacenza} ${nuovaGiacenza === 1 ? "pezzo" : "pezzi"} (soglia minima: ${materiale.soglia_minima}).</p>`,
          emailCorpoTesto: `"${materiale.nome}" è sceso a ${nuovaGiacenza} ${nuovaGiacenza === 1 ? "pezzo" : "pezzi"} (soglia minima: ${materiale.soglia_minima}).`,
          emailLink: "https://gestione.donewifi.it/materiali",
        });
        await service.from("materiali_magazzino").update({ ultimo_avviso_il: new Date().toISOString() }).eq("id", materiale.id);
      }
    }
  } catch (errore) {
    console.error("scaricaGiacenzaMateriali:", errore);
  }
}

// ── INVENTARIO ANTENNE (per MAC) ────────────────────────────────────────
// ★ NUOVA — stessa richiesta/proposta di cui sopra: censimento e
// correzioni riservati all'amministratore; la prenotazione (impegnare
// un'antenna per un Ticket futuro) è invece un gesto operativo del
// tecnico di Analisi Rete, non solo dell'amministratore.
export async function aggiungiAntenneInventario(tipologia: string, macTesto: string) {
  const supabase = await createClient();
  const erroreAccesso = await verificaAdminMateriali(supabase);
  if (erroreAccesso) return { errore: erroreAccesso };
  const persona = await getPersonaCorrente(supabase);

  const mac = Array.from(
    new Set(
      macTesto
        .split(/[\n,;]+/)
        .map((m) => m.trim().toUpperCase())
        .filter(Boolean)
    )
  );
  if (mac.length === 0) return { errore: "Inserisci almeno un MAC." };

  const service = createServiceClient();
  const { error } = await service.from("antenne_inventario").insert(
    mac.map((m) => ({ tipologia, mac: m, creato_da: persona?.id ?? null }))
  );
  if (error) {
    if (error.code === "23505") return { errore: "Uno o più MAC sono già censiti a inventario." };
    return { errore: error.message };
  }

  revalidatePath("/materiali");
  return { errore: null, aggiunte: mac.length };
}

export async function eliminaAntennaInventario(id: string) {
  const supabase = await createClient();
  const erroreAccesso = await verificaAdminMateriali(supabase);
  if (erroreAccesso) return { errore: erroreAccesso };

  const service = createServiceClient();
  const { error } = await service.from("antenne_inventario").delete().eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/materiali");
  return { errore: null };
}

/** ★ NUOVA — piccola ricerca per numero/cliente, usata dal selettore
 * "Riserva per Ticket" nella tab Antenne (evita di dover andare a
 * memoria/aprire un'altra scheda per trovare l'id del Ticket giusto). */
export async function cercaTicketPerAntenna(query: string) {
  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return [];
  const testo = query.trim();
  if (testo.length < 2) return [];

  // ★ FIX — stesso bug già corretto altrove (ricerca/actions.ts,
  // tickets/actions.ts, cercaClientiPerPreventivo): virgole/parentesi
  // rompono la sintassi filtro di PostgREST se finiscono senza escaping
  // dentro `.or()`.
  const testoSicuro = testo.replace(/[,()]/g, " ").trim();
  if (testoSicuro.length < 2) return [];

  // "numero" è un intero (serial): niente ilike diretto, si prova a
  // interpretarlo come numero e in parallelo si cerca per cliente.
  const numero = Number(testoSicuro);
  const filtro =
    Number.isFinite(numero) && testoSicuro.match(/^\d+$/)
      ? `numero.eq.${numero},cliente.ilike.%${testoSicuro}%`
      : `cliente.ilike.%${testoSicuro}%`;

  const { data } = await supabase
    .from("tickets")
    .select("id, numero, cliente")
    .or(filtro)
    .order("creato_il", { ascending: false })
    .limit(8);
  return data ?? [];
}

async function verificaAnalisiReteOAdmin(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return ERRORE_PERSONA_MANCANTE;
  if (!personaVedeReparto(persona, "Analisi Rete")) return "Solo Analisi Rete può prenotare un'antenna.";
  return null;
}

/** ★ NUOVA — il tecnico di Analisi Rete impegna in anticipo un'antenna
 * Disponibile per un Ticket, così l'ufficio sa già che non è più libera
 * anche prima dell'intervento vero (aggancio definitivo a "Installata"
 * quando il MAC compare in una Scheda di Installazione salvata, vedi
 * salvaSchedaLavoro() in calendario/actions.ts). */
export async function prenotaAntennaInventario(id: string, ticketId: string) {
  const supabase = await createClient();
  const erroreAccesso = await verificaAnalisiReteOAdmin(supabase);
  if (erroreAccesso) return { errore: erroreAccesso };

  // antenne_inventario non ha policy insert/update/delete (vedi
  // migrazione 0054): la scrittura passa dalla service role solo dopo il
  // controllo applicativo appena fatto sopra.
  const service = createServiceClient();
  const { data: antenna } = await service.from("antenne_inventario").select("stato").eq("id", id).maybeSingle();
  if (!antenna) return { errore: "Antenna non trovata." };
  if (antenna.stato !== "Disponibile") return { errore: "Questa antenna non è più disponibile." };

  const { error } = await service
    .from("antenne_inventario")
    .update({ stato: "Prenotata", ticket_id: ticketId, aggiornato_il: new Date().toISOString() })
    .eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/materiali");
  return { errore: null };
}

export async function annullaPrenotazioneAntenna(id: string) {
  const supabase = await createClient();
  const erroreAccesso = await verificaAnalisiReteOAdmin(supabase);
  if (erroreAccesso) return { errore: erroreAccesso };

  const service = createServiceClient();
  const { data: antenna } = await service.from("antenne_inventario").select("stato").eq("id", id).maybeSingle();
  if (!antenna) return { errore: "Antenna non trovata." };
  if (antenna.stato !== "Prenotata") return { errore: "Questa antenna non risulta prenotata." };

  const { error } = await service
    .from("antenne_inventario")
    .update({ stato: "Disponibile", ticket_id: null, aggiornato_il: new Date().toISOString() })
    .eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/materiali");
  return { errore: null };
}

/** ★ NUOVA — chiamata da salvaSchedaLavoro() (calendario/actions.ts) dopo
 * il salvataggio di una Scheda di Installazione con un MAC compilato:
 * aggancia il pezzo scritto dal tecnico all'inventario, se censito.
 * - Disponibile → passa a Installata per questo Ticket/Scheda.
 * - Prenotata per lo stesso Ticket → conferma, passa a Installata.
 * - Prenotata per un Ticket diverso → il tecnico ha usato un pezzo
 *   impegnato altrove: si installa comunque (la realtà fisica vince),
 *   ma un avviso in Chat ad Analisi Rete segnala l'incoerenza invece di
 *   farla quadrare in silenzio (chi aveva quella prenotazione dovrà
 *   sceglierne un'altra).
 * - MAC non censito → nessun errore, il gestionale non obbliga a
 *   censire ogni pezzo installato.
 * Mai bloccante verso il chiamante (stesso principio di
 * scaricaGiacenzaMateriali()). */
export async function riconciliaAntennaInstallata(mac: string, ticketId: string | null, schedaLavoroId: string | null) {
  try {
    const service = createServiceClient();
    const { data: antenna } = await service.from("antenne_inventario").select("id, stato, ticket_id").eq("mac", mac).maybeSingle();
    if (!antenna || antenna.stato === "Installata") return;

    if (antenna.stato === "Prenotata" && antenna.ticket_id && antenna.ticket_id !== ticketId) {
      // ★ ESTESA (2026-08-27, "fai la A" — Proposta A dell'artifact
      // "Estensione Notifiche") — prima solo Chat interna, ora anche
      // Telegram ed email.
      await notificaSuTuttiICanali({
        reparto: "Analisi Rete",
        telegramHtml: `⚠️ <b>Antenna prenotata installata altrove</b>\n\nAntenna ${mac} era prenotata per un altro Ticket ma è stata installata altrove — controllare la prenotazione.`,
        chatTesto: `⚠️ Antenna ${mac} era prenotata per un altro Ticket ma è stata installata altrove — controllare la prenotazione.`,
        emailTitolo: `Antenna prenotata installata altrove — ${mac}`,
        emailCorpoHtml: `<p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">L'antenna <b>${mac}</b> era prenotata per un altro Ticket ma è stata installata altrove — controllare la prenotazione.</p>`,
        emailCorpoTesto: `L'antenna ${mac} era prenotata per un altro Ticket ma è stata installata altrove — controllare la prenotazione.`,
        emailLink: "https://gestione.donewifi.it/materiali",
      });
    }

    await service
      .from("antenne_inventario")
      .update({ stato: "Installata", ticket_id: ticketId, scheda_lavoro_id: schedaLavoroId, aggiornato_il: new Date().toISOString() })
      .eq("id", antenna.id);
  } catch (errore) {
    console.error("riconciliaAntennaInstallata:", errore);
  }
}

/** ★ NUOVA (2026-08-27, richiesta esplicita: "il rapporto di lavoro deve
 * andare sul gestionale principale... in modo che poi venga inserito
 * dall'operatore nel gestionale esterno delle antenne") — riga pronta per
 * la coda "Da trasferire": solo i campi che servono a trascrivere,
 * cliente/numero risolti dal Ticket collegato (stesso pattern di
 * getInstallazioniCliente() in clienti-esterni/actions.ts). */
export interface SchedaDaTrasferireAntenne {
  schedaId: string;
  tipo: SchedaLavoro["tipo"];
  completataIl: string;
  cliente: string;
  ticketNumero: number | null;
  mac: string | null;
  bts: string | null;
  modelloCpe: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
}

/** Coda di riserva: tutte le schede che riguardano il gestionale esterno
 * delle antenne (vedi schedaRiguardaGestionaleAntenne) e non risultano
 * ancora segnate come trascritte. L'avviso automatico in Chat (vedi
 * notificaGestionaleAntenne) resta il modo principale per accorgersene —
 * questa vista serve a chi se lo è perso, o per un controllo periodico
 * "è rimasto indietro qualcosa?". */
export async function getSchedeDaTrasferireAntenne(): Promise<SchedaDaTrasferireAntenne[]> {
  const supabase = await createClient();
  const { data: schede, error } = await supabase
    .from("schede_lavoro")
    .select("id, ticket_id, appuntamento_id, tipo, mac, bts, modello_cpe, gps_lat, gps_lng, creato_il")
    .is("inserita_gestionale_antenne_il", null)
    .order("creato_il", { ascending: true });
  if (error) {
    console.error("getSchedeDaTrasferireAntenne:", error.message);
    return [];
  }

  const rilevanti = (schede ?? []).filter((s) => schedaRiguardaGestionaleAntenne(s.tipo, s.mac));
  if (rilevanti.length === 0) return [];

  // ★ FIX (trovato in verifica) — filtrare via le schede senza ticket_id
  // (possibile: un appuntamento creato dal Calendario senza passare da un
  // Ticket) le escludeva del tutto dalla coda, l'esatto opposto dello scopo
  // di questa vista ("niente si perde"). Per quei pochi casi si usa il
  // titolo dell'appuntamento al posto del nome cliente del Ticket.
  const idTicket = Array.from(new Set(rilevanti.map((s) => s.ticket_id).filter((v): v is string => !!v)));
  const idAppuntamentoSenzaTicket = Array.from(new Set(rilevanti.filter((s) => !s.ticket_id).map((s) => s.appuntamento_id)));
  const [{ data: tickets }, { data: appuntamenti }] = await Promise.all([
    idTicket.length ? supabase.from("tickets").select("id, numero, cliente").in("id", idTicket) : Promise.resolve({ data: [] as { id: string; numero: number; cliente: string }[] }),
    idAppuntamentoSenzaTicket.length
      ? supabase.from("appuntamenti").select("id, titolo").in("id", idAppuntamentoSenzaTicket)
      : Promise.resolve({ data: [] as { id: string; titolo: string }[] }),
  ]);
  const mappaTicket = new Map((tickets ?? []).map((t) => [t.id, t]));
  const mappaAppuntamento = new Map((appuntamenti ?? []).map((a) => [a.id, a.titolo]));

  return rilevanti.map((s) => {
    const ticket = s.ticket_id ? mappaTicket.get(s.ticket_id) : undefined;
    return {
      schedaId: s.id,
      tipo: s.tipo,
      completataIl: s.creato_il,
      cliente: ticket?.cliente ?? mappaAppuntamento.get(s.appuntamento_id) ?? "—",
      ticketNumero: ticket?.numero ?? null,
      mac: s.mac,
      bts: s.bts,
      modelloCpe: s.modello_cpe,
      gpsLat: s.gps_lat,
      gpsLng: s.gps_lng,
    };
  });
}

/** Segna una scheda come già trascritta nel gestionale esterno delle
 * antenne — sparisce dalla coda di riserva. Chiunque veda la pagina
 * Materiali può farlo (stesso accesso già richiesto per aprirla), non
 * serve restringerlo ad Analisi Rete: è una semplice spunta di "fatto",
 * non una modifica ai dati dell'antenna. */
export async function segnaSchedaInseritaAntenne(schedaId: string): Promise<{ errore: string | null }> {
  const supabase = await createClient();
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: ERRORE_PERSONA_MANCANTE };

  const { error } = await supabase
    .from("schede_lavoro")
    .update({ inserita_gestionale_antenne_il: new Date().toISOString(), inserita_gestionale_antenne_da: persona.id })
    .eq("id", schedaId);
  if (error) return { errore: error.message };

  revalidatePath("/materiali");
  return { errore: null };
}
