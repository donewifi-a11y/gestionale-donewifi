import type { createClient } from "@/lib/supabase/server";
import type { AreaAccesso } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function inizioMese() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

const REPARTI_ELENCO: AreaAccesso[] = ["Analisi Rete", "Commerciale", "Fatturazione"];

/** ★ ex getDatiAnalyticsAmministrazione() del vecchio gestionale, semplificato:
 * niente più foglio "Clienti Attivi" separato — le acquisizioni si leggono
 * da segnalazioni (tipologia_cliente/profilo_internet, già esistenti), i
 * ricavi da tickets.importo_fatturato (nuovo campo). */
export async function getDatiAmministrazione(supabase: Supabase) {
  const inizio = inizioMese();
  const oggi = new Date();
  const giorniNelMese = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0).getDate();

  const [{ data: segnalazioniMese }, { data: ticketCompletatiMese }] = await Promise.all([
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

  const ricaviTotali = Object.values(ricaviPerReparto).reduce((a, b) => a + b, 0);

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

export { REPARTI_ELENCO };
