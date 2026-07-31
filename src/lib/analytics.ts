import type { createClient } from "@/lib/supabase/server";
import { fetchTuttiClientiEsterni } from "@/lib/clienti-esterni";
import type { AreaAccesso } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function inizioMese() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

const REPARTI_ELENCO: AreaAccesso[] = ["Analisi Rete", "Commerciale", "Fatturazione"];

/** ★ una risposta Supabase è limitata a 1000 righe di default — con oltre
 * mille fatture in un mese (capita) una sola `.select()` sottostimerebbe
 * il totale in silenzio. Pagina finché non finiscono le righe. */
async function sommaImportoFattureDa(supabase: Supabase, dataIso: string): Promise<number> {
  const PAGINA = 1000;
  let offset = 0;
  let totale = 0;
  for (;;) {
    const { data } = await supabase
      .from("fatture_esterne")
      .select("importo")
      .gte("emissione", dataIso)
      .range(offset, offset + PAGINA - 1);
    const righe = data ?? [];
    totale += righe.reduce((s, f) => s + (Number(f.importo) || 0), 0);
    if (righe.length < PAGINA) break;
    offset += PAGINA;
  }
  return totale;
}

/** ★ ex getDatiAnalyticsAmministrazione() del vecchio gestionale, semplificato:
 * niente più foglio "Clienti Attivi" separato — le acquisizioni si leggono
 * da segnalazioni (tipologia_cliente/profilo_internet, già esistenti). I
 * ricavi totali del mese vengono ora dalle fatture vere importate da
 * Aruba (fatture_esterne) invece che da tickets.importo_fatturato — quel
 * campo si compila solo a chiusura rapportino, quasi sempre vuoto, mai
 * pensato per il fatturato reale dell'azienda. Il dettaglio "per reparto"
 * resta invece dai Ticket: le fatture non hanno un reparto associato. */
export async function getDatiAmministrazione(supabase: Supabase) {
  const inizio = inizioMese();
  const oggi = new Date();
  const giorniNelMese = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0).getDate();

  const [{ data: segnalazioniMese }, { data: ticketCompletatiMese }, ricaviFattureMese] = await Promise.all([
    supabase
      .from("segnalazioni")
      .select("stato, tipologia_cliente, profilo_internet, dati_ricevuti_at")
      .eq("stato", "Trasmessa")
      .gte("aggiornato_il", inizio.toISOString()),
    supabase
      .from("tickets")
      .select("reparto, importo_fatturato, aggiornato_il")
      .eq("stato", "Completato")
      .gte("aggiornato_il", inizio.toISOString()),
    sommaImportoFattureDa(supabase, inizio.toISOString().slice(0, 10)),
  ]);

  const acquisizioni = segnalazioniMese ?? [];
  const completati = ticketCompletatiMese ?? [];

  const perTipologia: Record<string, number> = { Privato: 0, Azienda: 0, "Non specificato": 0 };
  const perProfilo: Record<string, number> = {};
  const andamentoGiornaliero = new Array(giorniNelMese).fill(0);

  for (const s of acquisizioni) {
    const tipologia = s.tipologia_cliente || "Non specificato";
    perTipologia[tipologia] = (perTipologia[tipologia] ?? 0) + 1;
    const profilo = s.profilo_internet || "Non specificato";
    perProfilo[profilo] = (perProfilo[profilo] ?? 0) + 1;
  }

  const ricaviPerReparto: Record<string, number> = { "Analisi Rete": 0, Commerciale: 0, Fatturazione: 0 };
  const completatiPerReparto: Record<string, number> = { "Analisi Rete": 0, Commerciale: 0, Fatturazione: 0 };
  for (const t of completati) {
    if (t.reparto in ricaviPerReparto) {
      ricaviPerReparto[t.reparto] += Number(t.importo_fatturato) || 0;
      completatiPerReparto[t.reparto] += 1;
      const giorno = new Date(t.aggiornato_il).getDate();
      if (giorno >= 1 && giorno <= giorniNelMese) andamentoGiornaliero[giorno - 1] += 1;
    }
  }

  const ricaviTotali = ricaviFattureMese;

  return {
    mese: oggi.toLocaleDateString("it-IT", { month: "long", year: "numeric" }),
    acquisizioniTotali: acquisizioni.length,
    ricaviTotali,
    ticketCompletatiTotali: completati.length,
    perTipologia,
    perProfilo,
    ricaviPerReparto,
    completatiPerReparto,
    andamentoGiornaliero,
    giorniNelMese,
  };
}

/** Vista sintetica per un singolo reparto (operativo + economico del mese). */
export async function getDatiReparto(supabase: Supabase, reparto: AreaAccesso) {
  const inizio = inizioMese();

  const [{ data: ticketsAttivi }, { data: ticketCompletatiMese }, { data: persone }] = await Promise.all([
    supabase.from("tickets").select("id, numero, cliente, priorita, stato, tecnico_assegnato").eq("reparto", reparto).neq("stato", "Completato").neq("stato", "Annullato"),
    supabase.from("tickets").select("importo_fatturato, tecnico_assegnato").eq("reparto", reparto).eq("stato", "Completato").gte("aggiornato_il", inizio.toISOString()),
    supabase.from("persone").select("id, nome").eq("attivo", true),
  ]);

  const attivi = ticketsAttivi ?? [];
  const completatiMese = ticketCompletatiMese ?? [];
  const listaPersone = persone ?? [];

  const ricaviMese = completatiMese.reduce((s, t) => s + (Number(t.importo_fatturato) || 0), 0);
  const urgenti = attivi.filter((t) => t.priorita === "Urgente").length;
  const nonAssegnati = attivi.filter((t) => !t.tecnico_assegnato).length;

  const caricoTecnici = listaPersone
    .map((p) => ({ persona: p, conteggio: attivi.filter((t) => t.tecnico_assegnato === p.id).length }))
    .filter((r) => r.conteggio > 0)
    .sort((a, b) => b.conteggio - a.conteggio);

  return {
    ticketAttivi: attivi.length,
    urgenti,
    nonAssegnati,
    completatiQuestoMese: completatiMese.length,
    ricaviQuestoMese: ricaviMese,
    caricoTecnici,
    listaAttivi: attivi.sort((a, b) => (a.priorita === "Urgente" ? -1 : 1)).slice(0, 12),
  };
}

export interface StatistichePeriodo {
  perReparto: Record<AreaAccesso, { aperti: number; completati: number; urgenti: number; slaOreMedia: number | null; slaCampione: number }>;
  perPriorita: Record<string, { slaOreMedia: number | null; campione: number }>;
}

/** ★ ex getStatistichePeriodo() del vecchio gestionale: SLA medio (ore da
 * creazione a completamento) e conteggi per reparto/priorità su un
 * intervallo scelto — qui basato su tickets.aggiornato_il (che segna
 * l'ultimo cambio, quindi il completamento per i ticket Completato)
 * invece che rileggere lo Storico Modifiche riga per riga. */
export async function getStatistichePeriodo(supabase: Supabase, inizio: Date, fine: Date): Promise<StatistichePeriodo> {
  const { data } = await supabase
    .from("tickets")
    .select("reparto, stato, priorita, data_creazione, aggiornato_il")
    .neq("stato", "Annullato")
    .gte("data_creazione", inizio.toISOString())
    .lte("data_creazione", fine.toISOString());

  const righe = data ?? [];

  const perReparto: StatistichePeriodo["perReparto"] = {} as StatistichePeriodo["perReparto"];
  for (const r of REPARTI_ELENCO) perReparto[r] = { aperti: 0, completati: 0, urgenti: 0, slaOreMedia: null, slaCampione: 0 };
  const sommaSlaReparto: Record<string, number> = {};

  const perPriorita: StatistichePeriodo["perPriorita"] = {
    Urgente: { slaOreMedia: null, campione: 0 },
    Normale: { slaOreMedia: null, campione: 0 },
    Bassa: { slaOreMedia: null, campione: 0 },
  };
  const sommaSlaPriorita: Record<string, number> = {};

  for (const t of righe) {
    const reparto = t.reparto as AreaAccesso;
    if (!perReparto[reparto]) continue;

    if (t.stato === "Completato") {
      perReparto[reparto].completati++;
      const oreSla = (new Date(t.aggiornato_il).getTime() - new Date(t.data_creazione).getTime()) / (1000 * 60 * 60);
      if (oreSla >= 0) {
        sommaSlaReparto[reparto] = (sommaSlaReparto[reparto] ?? 0) + oreSla;
        perReparto[reparto].slaCampione++;
        if (perPriorita[t.priorita]) {
          sommaSlaPriorita[t.priorita] = (sommaSlaPriorita[t.priorita] ?? 0) + oreSla;
          perPriorita[t.priorita].campione++;
        }
      }
    } else {
      perReparto[reparto].aperti++;
    }
    if (t.priorita === "Urgente") perReparto[reparto].urgenti++;
  }

  for (const r of REPARTI_ELENCO) {
    const d = perReparto[r];
    d.slaOreMedia = d.slaCampione > 0 ? Math.round((sommaSlaReparto[r] / d.slaCampione) * 10) / 10 : null;
  }
  for (const p of Object.keys(perPriorita)) {
    const d = perPriorita[p];
    d.slaOreMedia = d.campione > 0 ? Math.round((sommaSlaPriorita[p] / d.campione) * 10) / 10 : null;
  }

  return { perReparto, perPriorita };
}

export interface DatiAnagraficaAruba {
  clientiAttivi: number;
  fattureInsolute: { numero: number; totale: number };
  andamentoFatturato: { chiave: string; etichetta: string; totale: number }[];
  distribuzioneProfili: { nome: string; conteggio: number }[];
}

/** ★ ex fogli "Clienti Attivi"/anagrafica del vecchio gestionale, qui
 * dall'importazione Aruba (clienti_esterni/fatture_esterne) invece che
 * da dati inseriti a mano — tutte le query paginate con `.range()`
 * (righe potenzialmente oltre le 1000 di default). */
export async function getDatiAnagraficaAruba(supabase: Supabase): Promise<DatiAnagraficaAruba> {
  const seiMesiFa = new Date();
  seiMesiFa.setMonth(seiMesiFa.getMonth() - 5);
  seiMesiFa.setDate(1);
  seiMesiFa.setHours(0, 0, 0, 0);

  async function fetchTutteLeFattureDa(dataIso: string): Promise<{ importo: number | null; pagata: boolean; emissione: string | null }[]> {
    const PAGINA = 1000;
    let offset = 0;
    const tutte: { importo: number | null; pagata: boolean; emissione: string | null }[] = [];
    for (;;) {
      const { data } = await supabase
        .from("fatture_esterne")
        .select("importo, pagata, emissione")
        .gte("emissione", dataIso)
        .range(offset, offset + PAGINA - 1);
      const righe = data ?? [];
      tutte.push(...righe);
      if (righe.length < PAGINA) break;
      offset += PAGINA;
    }
    return tutte;
  }

  async function fetchTutteLeInsolute(): Promise<{ importo: number | null }[]> {
    const PAGINA = 1000;
    let offset = 0;
    const tutte: { importo: number | null }[] = [];
    for (;;) {
      const { data } = await supabase.from("fatture_esterne").select("importo").eq("pagata", false).range(offset, offset + PAGINA - 1);
      const righe = data ?? [];
      tutte.push(...righe);
      if (righe.length < PAGINA) break;
      offset += PAGINA;
    }
    return tutte;
  }

  // ★ un solo giro su clienti_esterni (paginato) per ricavare sia il
  // conteggio attivi unici sia la distribuzione profili, invece di due
  // scansioni separate dell'intera tabella.
  const [clientiEsterni, fattureSeiMesi, insolute] = await Promise.all([
    fetchTuttiClientiEsterni<{ id: number; codice_fiscale: string | null; partita_iva: string | null; attivo: boolean; profilo_internet: string | null }>(
      supabase,
      "id, codice_fiscale, partita_iva, attivo, profilo_internet"
    ),
    fetchTutteLeFattureDa(seiMesiFa.toISOString().slice(0, 10)),
    fetchTutteLeInsolute(),
  ]);

  const chiaviAttivi = new Set(
    clientiEsterni.filter((c) => c.attivo).map((c) => c.codice_fiscale || c.partita_iva || `id:${c.id}`)
  );
  const clientiAttivi = chiaviAttivi.size;

  const mesi: { chiave: string; etichetta: string; totale: number }[] = [];
  const oggi = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(oggi.getFullYear(), oggi.getMonth() - i, 1);
    mesi.push({ chiave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, etichetta: d.toLocaleDateString("it-IT", { month: "short" }), totale: 0 });
  }
  const mappaMesi = new Map(mesi.map((m) => [m.chiave, m]));
  for (const f of fattureSeiMesi) {
    if (!f.emissione) continue;
    const m = mappaMesi.get(f.emissione.slice(0, 7));
    if (m) m.totale += Number(f.importo) || 0;
  }

  const fattureInsolute = {
    numero: insolute.length,
    totale: insolute.reduce((s, f) => s + (Number(f.importo) || 0), 0),
  };

  const conteggioProfili: Record<string, number> = {};
  for (const c of clientiEsterni) {
    if (!c.attivo) continue;
    const nome = (c.profilo_internet || "").trim();
    if (!nome) continue;
    conteggioProfili[nome] = (conteggioProfili[nome] ?? 0) + 1;
  }
  const distribuzioneProfili = Object.entries(conteggioProfili)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([nome, conteggio]) => ({ nome, conteggio }));

  return { clientiAttivi, fattureInsolute, andamentoFatturato: mesi, distribuzioneProfili };
}

export interface TotaliGeneraliAruba {
  fatturatoTotale: number;
  numeroFatture: number;
  numeroFattureInsolute: number;
  totaleInsoluto: number;
  clientiTotali: number;
  clientiAttivi: number;
  /** ★ "rendimenti": non solo i totali, ma cosa dicono — percentuale di
   * clienti ancora attivi sul totale mai avuto, percentuale di fatture
   * incassate, valore medio fattura, ricavo medio mensile per cliente
   * attivo (ARPU). */
  tassoClientiAttivi: number;
  tassoPagamento: number;
  valoreMedioFattura: number;
  arpuMensile: number;
}

/** ★ calcolato in un'unica query SQL (statistiche_generali_aruba(),
 * migrazione 0030) invece di scaricare 57mila+ fatture via rete per
 * sommarle — molto più veloce e senza il limite delle 1000 righe. */
export async function getTotaliGeneraliAruba(supabase: Supabase, fatturatoMeseCorrente: number): Promise<TotaliGeneraliAruba | null> {
  const { data, error } = await supabase.rpc("statistiche_generali_aruba").single();
  if (error || !data) return null;

  const riga = data as {
    fatturato_totale: number | string;
    numero_fatture: number;
    numero_fatture_insolute: number;
    totale_insoluto: number | string;
    clienti_totali: number;
    clienti_attivi: number;
  };

  const fatturatoTotale = Number(riga.fatturato_totale) || 0;
  const numeroFatture = riga.numero_fatture ?? 0;
  const clientiTotali = riga.clienti_totali ?? 0;
  const clientiAttivi = riga.clienti_attivi ?? 0;

  return {
    fatturatoTotale,
    numeroFatture,
    numeroFattureInsolute: riga.numero_fatture_insolute ?? 0,
    totaleInsoluto: Number(riga.totale_insoluto) || 0,
    clientiTotali,
    clientiAttivi,
    tassoClientiAttivi: clientiTotali > 0 ? (clientiAttivi / clientiTotali) * 100 : 0,
    tassoPagamento: numeroFatture > 0 ? ((numeroFatture - (riga.numero_fatture_insolute ?? 0)) / numeroFatture) * 100 : 0,
    valoreMedioFattura: numeroFatture > 0 ? fatturatoTotale / numeroFatture : 0,
    arpuMensile: clientiAttivi > 0 ? fatturatoMeseCorrente / clientiAttivi : 0,
  };
}

function ymd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export interface StatistichePeriodoConfronto {
  fatturato: number;
  numeroFatture: number;
  numeroInsolute: number;
  totaleInsoluto: number;
  clientiAttiviPeriodo: number;
}

export interface ConfrontoFatturatoPeriodo {
  corrente: StatistichePeriodoConfronto;
  precedente: StatistichePeriodoConfronto;
  /** variazione percentuale corrente vs precedente — null se il periodo
   * precedente era a zero (percentuale non significativa, es. "+∞%"). */
  crescita: {
    fatturatoPct: number | null;
    numeroFatturePct: number | null;
    clientiAttiviPct: number | null;
  };
  profili: { profilo: string; conteggio: number }[];
}

function rigaVuota(): StatistichePeriodoConfronto {
  return { fatturato: 0, numeroFatture: 0, numeroInsolute: 0, totaleInsoluto: 0, clientiAttiviPeriodo: 0 };
}

function variazionePct(corrente: number, precedente: number): number | null {
  if (precedente === 0) return corrente === 0 ? 0 : null;
  return ((corrente - precedente) / precedente) * 100;
}

/** ★ fatturato/profili/pagamenti filtrabili per un periodo arbitrario (lo
 * stesso già scelto dall'utente nel selettore "Statistiche per periodo"),
 * confrontati con il periodo precedente di uguale durata per calcolare
 * crescita/decrescita — calcolato in SQL (statistiche_fatturato_periodo() e
 * profili_per_periodo(), migrazione 0031) invece di scaricare le fatture
 * del periodo via rete. */
export async function getConfrontoFatturatoPeriodo(
  supabase: Supabase,
  inizio: Date,
  fine: Date
): Promise<ConfrontoFatturatoPeriodo> {
  const durataMs = fine.getTime() - inizio.getTime();
  const finePrecedente = new Date(inizio.getTime() - 24 * 60 * 60 * 1000);
  const inizioPrecedente = new Date(finePrecedente.getTime() - durataMs);

  const [{ data: rigaCorrente }, { data: rigaPrecedente }, { data: profili }] = await Promise.all([
    supabase.rpc("statistiche_fatturato_periodo", { p_inizio: ymd(inizio), p_fine: ymd(fine) }).single(),
    supabase
      .rpc("statistiche_fatturato_periodo", { p_inizio: ymd(inizioPrecedente), p_fine: ymd(finePrecedente) })
      .single(),
    supabase.rpc("profili_per_periodo", { p_inizio: ymd(inizio), p_fine: ymd(fine) }),
  ]);

  const converti = (r: unknown): StatistichePeriodoConfronto => {
    if (!r) return rigaVuota();
    const riga = r as {
      fatturato: number | string;
      numero_fatture: number;
      numero_insolute: number;
      totale_insoluto: number | string;
      clienti_attivi_periodo: number;
    };
    return {
      fatturato: Number(riga.fatturato) || 0,
      numeroFatture: riga.numero_fatture ?? 0,
      numeroInsolute: riga.numero_insolute ?? 0,
      totaleInsoluto: Number(riga.totale_insoluto) || 0,
      clientiAttiviPeriodo: riga.clienti_attivi_periodo ?? 0,
    };
  };

  const corrente = converti(rigaCorrente);
  const precedente = converti(rigaPrecedente);

  return {
    corrente,
    precedente,
    crescita: {
      fatturatoPct: variazionePct(corrente.fatturato, precedente.fatturato),
      numeroFatturePct: variazionePct(corrente.numeroFatture, precedente.numeroFatture),
      clientiAttiviPct: variazionePct(corrente.clientiAttiviPeriodo, precedente.clientiAttiviPeriodo),
    },
    profili: ((profili as { profilo: string; conteggio: number }[] | null) ?? []).map((p) => ({
      profilo: p.profilo,
      conteggio: p.conteggio,
    })),
  };
}

export { REPARTI_ELENCO };
