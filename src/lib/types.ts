export type AreaAccesso = "Tutto" | "Admin" | "Analisi Rete" | "Commerciale" | "Fatturazione";
export type StatoTicket = "Da gestire" | "In lavorazione" | "In attesa" | "Completato" | "Annullato";
export type PrioritaTicket = "Urgente" | "Normale" | "Bassa";
export type StatoSegnalazione = "Da Contattare" | "In Contatto" | "Gestione Cliente" | "Trasmessa";
export type Copertura = "si" | "no" | "daVerificare";

export const STATI_TICKET: StatoTicket[] = [
  "Da gestire",
  "In lavorazione",
  "In attesa",
  "Completato",
  "Annullato",
];

export const REPARTI: AreaAccesso[] = ["Analisi Rete", "Commerciale", "Fatturazione"];

/** ★ NUOVA (2026-08) — richiesta esplicita: colore fisso per reparto sulla
 * bacheca/dettaglio Ticket (proposta con artifact, opzione "C · Badge +
 * fascia" scelta), mai ciclato — vedi i token --reparto-* in globals.css.
 * Separato dai colori di stato (successo/avviso/critico): un reparto non
 * è mai un giudizio di urgenza. */
export const COLORE_REPARTO: Record<"Analisi Rete" | "Commerciale" | "Fatturazione", { testo: string; sfondo: string; fascia: string }> = {
  "Analisi Rete": { testo: "text-reparto-analisi-rete", sfondo: "bg-reparto-analisi-rete-bg", fascia: "bg-reparto-analisi-rete" },
  Commerciale: { testo: "text-reparto-commerciale", sfondo: "bg-reparto-commerciale-bg", fascia: "bg-reparto-commerciale" },
  Fatturazione: { testo: "text-reparto-fatturazione", sfondo: "bg-reparto-fatturazione-bg", fascia: "bg-reparto-fatturazione" },
};

/** `ticket.reparto`/`persona.reparti` sono tipizzati come `AreaAccesso`
 * (include anche "Tutto"/"Admin", mai un vero reparto assegnabile a un
 * Ticket) — questo accessor evita un errore a runtime/tipo per quei due
 * casi, tornando `null` invece di forzare un colore inventato. */
export function coloreReparto(reparto: AreaAccesso): { testo: string; sfondo: string; fascia: string } | null {
  return reparto in COLORE_REPARTO ? COLORE_REPARTO[reparto as keyof typeof COLORE_REPARTO] : null;
}
export const CATEGORIE_TICKET = ["Assistenza", "Commerciale", "Amministrativa"] as const;

// ★ ex 14 categorie puntuali del vecchio gestionale — qui come dettaglio
// facoltativo (tickets.sottocategoria) dipendente dalla categoria
// principale, non come sostituto: filtri e mappatura reparto restano
// sui 3 valori sopra.
export const SOTTOCATEGORIE_TICKET: Record<(typeof CATEGORIE_TICKET)[number], string[]> = {
  Assistenza: [
    "Internet assente",
    "Internet lento",
    "Voip",
    "Intervento in loco",
    "Pianificazione installazione",
    "Ritiro Apparati",
  ],
  Commerciale: ["Trasferimento", "Nuovo contratto", "Subentro", "Upgrade/Downgrade"],
  Amministrativa: ["Cambio Anagrafica", "Disdetta", "Cambio IBAN", "Fatture non saldate"],
};

export interface Ticket {
  id: string;
  numero: number;
  data_creazione: string;
  cliente: string;
  telefono: string | null;
  email: string | null;
  indirizzo: string | null;
  categoria: string;
  sottocategoria: string | null;
  dettagli_extra: Record<string, string>;
  problema: string | null;
  stato: StatoTicket;
  priorita: PrioritaTicket;
  reparto: AreaAccesso;
  tecnico_assegnato: string | null;
  note: string | null;
  contratto_pdf_url: string | null;
  segnalazione_id: string | null;
  importo_fatturato: number | null;
}

export interface Segnalazione {
  id: string;
  numero: number;
  data: string;
  nome: string;
  telefono: string;
  email: string | null;
  via: string;
  civico: string;
  comune: string;
  cap: string;
  copertura: Copertura;
  note: string | null;
  stato: StatoSegnalazione;
  operatore_id: string | null;
  tipologia_cliente: string | null;
  profilo_internet: string | null;
  contratto_pdf_url: string | null;
  documenti_richiesti_at: string | null;
  dati_ricevuti_at: string | null;
  contratto_inviato_approvazione_il: string | null;
  contratto_approvato_cliente_il: string | null;
  ultimo_promemoria_approvazione_il: string | null;
}

export type StatoPreventivo = "Bozza" | "Inviato" | "Approvato" | "Rifiutato";

/** Una voce del preventivo — descrizione libera (spesso il nome di una
 * Tariffa/MaterialeMagazzino al momento della composizione, ma non un
 * riferimento vivo: se il prezzo del catalogo cambia dopo, il preventivo
 * già creato non deve cambiare con lui) con quantità e prezzo unitario. */
export interface RigaPreventivo {
  descrizione: string;
  quantita: number;
  prezzoUnitario: number;
}

export interface Preventivo {
  id: string;
  numero: number;
  cliente_nome: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  tipologia_cliente: "Privato" | "Azienda";
  segnalazione_id: string | null;
  cliente_esterno_id: number | null;
  righe: RigaPreventivo[];
  totale: number;
  note: string | null;
  stato: StatoPreventivo;
  inviato_il: string | null;
  risposto_il: string | null;
  operatore_id: string | null;
  creato_il: string;
  aggiornato_il: string;
}

export type StatoAppuntamento = "Programmato" | "Completato" | "Annullato";

/** Cosa deve fare l'installatore sul posto: prima attivazione di un
 * cliente, o intervento su un impianto già attivo. Scelto quando si
 * pianifica l'appuntamento a Calendario. */
export type TipoServizioAppuntamento = "Nuova installazione" | "Lavorazione tecnica";
export const TIPI_SERVIZIO_APPUNTAMENTO: TipoServizioAppuntamento[] = ["Nuova installazione", "Lavorazione tecnica"];

/** ★ NUOVA (2026-08) — richiesta esplicita: pannello Appuntamento "a prova
 * di scemo" — un colore fisso per tipo di servizio, così la scelta più
 * importante del form (decide quale Scheda si apre dopo) ha un peso
 * visivo pari alla sua importanza invece di essere un `<select>` anonimo
 * identico a "Durata". Separata dalla palette reparto (COLORE_REPARTO
 * sopra): dimensione diversa, stesso principio. */
export const COLORE_SERVIZIO: Record<TipoServizioAppuntamento, { testo: string; sfondo: string; scheda: string }> = {
  "Nuova installazione": { testo: "text-servizio-installazione", sfondo: "bg-servizio-installazione-bg", scheda: "Apre la Scheda di Installazione" },
  "Lavorazione tecnica": { testo: "text-servizio-lavorazione", sfondo: "bg-servizio-lavorazione-bg", scheda: "Apre la Scheda di Lavorazione" },
};

export interface Appuntamento {
  id: string;
  ticket_id: string | null;
  titolo: string;
  indirizzo: string | null;
  data_ora: string;
  durata_minuti: number;
  tecnico_id: string | null;
  note: string | null;
  stato: StatoAppuntamento;
  tipo_servizio: TipoServizioAppuntamento;
  creato_da: string | null;
  google_event_id: string | null;
}

export interface NotaTicket {
  id: string;
  ticket_id: string;
  autore_id: string | null;
  testo: string;
  creato_il: string;
}

export interface StaffMinimo {
  id: string;
  email: string;
  nome: string | null;
}

export interface Persona {
  id: string;
  nome: string;
  email?: string | null;
  attivo: boolean;
  amministratore: boolean;
  reparti: AreaAccesso[];
  richiede_password?: boolean;
  ha_login?: boolean;
}

export interface RichiestaCliente {
  id: string;
  data: string;
  tipo_richiesta: string;
  cliente: string | null;
  segnalazione_id: string | null;
  ticket_id: string | null;
  dettagli: Record<string, string>;
  documenti: { nome: string; percorso: string; tipo?: string }[];
  stato: string;
}

export interface Tariffa {
  id: string;
  nome: string;
  tipologia_cliente: "Privato" | "Azienda" | "Tutti";
  velocita: string | null;
  prezzo_mensile: number | null;
  /** true = prezzo_mensile è già IVA inclusa (22%); false = prezzo_mensile è al netto, l'IVA va aggiunta. */
  iva_inclusa: boolean;
  descrizione: string | null;
  attivo: boolean;
  /** true = compare nella documentazione inviata al cliente (form pubblico
   * "Richiesta Dati"); false = attiva/sottoscrivibile ma solo su
   * trattativa diretta, non in vetrina. Non ha senso se attivo è false. */
  pubblica: boolean;
  /** costo una tantum di attivazione, separato dal canone mensile. */
  prezzo_attivazione: number | null;
  ordine: number;
}

export const ALIQUOTA_IVA = 0.22;

/** Dato un prezzo e se è già IVA inclusa, restituisce { netto, lordo } per mostrare sempre entrambi. */
export function prezziNettoLordo(prezzo: number, ivaInclusa: boolean): { netto: number; lordo: number } {
  return ivaInclusa
    ? { netto: prezzo / (1 + ALIQUOTA_IVA), lordo: prezzo }
    : { netto: prezzo, lordo: prezzo * (1 + ALIQUOTA_IVA) };
}

// ★ formattazione valuta standard per tutto il gestionale — un unico
// Intl.NumberFormat invece di "€ " + toLocaleString() ripetuto (e a volte
// disallineato: valori diversi arrotondavano/spaziavano in modo diverso)
// in ogni componente che mostra un importo.
const FORMATO_VALUTA = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export function formattaValuta(valore: number | null | undefined): string {
  return FORMATO_VALUTA.format(Number(valore) || 0);
}

export type TipoPromozione = "Sconto % / mese" | "Sconto fisso / mese" | "Mesi omaggio" | "Attivazione gratuita";

export interface Promozione {
  id: string;
  nome: string;
  tipo: TipoPromozione;
  valore: number | null;
  tariffe_ids: string[];
  da: string;
  a: string;
  codice: string | null;
}

export interface ClienteEsterno {
  id: number;
  nome: string | null;
  cognome: string | null;
  ragionesociale: string | null;
  codice_fiscale: string | null;
  partita_iva: string | null;
  email: string | null;
  telefono: string | null;
  indirizzo: string | null;
  numero_civico: string | null;
  cap: string | null;
  comune: string | null;
  provincia: string | null;
  codice_gestionale: string | null;
  id_contratto: string | null;
  /** ★ campo grezzo Aruba (contrattoattivo='S'/'N') — inaffidabile, tenuto solo per riferimento. Per lo stato reale usare `attivo`. */
  contratto_attivo: boolean | null;
  /** Fatturato negli ultimi 90 giorni — è questo il segnale usato ovunque nell'app per "cliente attivo". */
  attivo: boolean;
  profilo_internet: string | null;
  aggiornato_il: string;
}

export interface FatturaEsterna {
  id: number;
  codice: string;
  numero: string;
  emissione: string | null;
  scadenza: string | null;
  importo: number | null;
  pagata: boolean | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  nominativo: string | null;
  tipo_pagamento: string | null;
}

export interface StoricoProfiloClienteEsterno {
  id: string;
  cliente_esterno_id: number;
  profilo_precedente: string | null;
  profilo_nuovo: string | null;
  rilevato_il: string;
}

export interface Conversazione {
  id: string;
  tipo: "diretta" | "gruppo";
  persona_a_id: string | null;
  persona_b_id: string | null;
  reparto: AreaAccesso | null;
}

export interface MessaggioChat {
  id: string;
  conversazione_id: string;
  mittente_id: string;
  testo: string | null;
  allegato_url: string | null;
  allegato_nome: string | null;
  creato_il: string;
}

export interface TodoPersonale {
  id: string;
  persona_id: string;
  testo: string;
  fatto: boolean;
  creato_il: string;
  completato_il: string | null;
}

export type CategoriaLavorazione = "Rete" | "Ufficio";
export type StatoLavorazione = "Da fare" | "In corso" | "Fatta";
export const CATEGORIE_LAVORAZIONE: CategoriaLavorazione[] = ["Rete", "Ufficio"];
export const STATI_LAVORAZIONE: StatoLavorazione[] = ["Da fare", "In corso", "Fatta"];

/** ★ NUOVA — lavorazioni interne (non pratiche cliente) assegnabili da un
 * amministratore, divise Rete/Ufficio — a differenza di TodoPersonale
 * (appunti privati leggeri) queste sono lavoro formale del team, con
 * responsabile e chi l'ha assegnata, e un promemoria automatico se
 * restano ferme (vedi ultimo_promemoria_il). Niente scadenza per scelta
 * esplicita — il promemoria si basa su quanto tempo è ferma, non su una
 * data limite. */
export interface LavorazioneInterna {
  id: string;
  categoria: CategoriaLavorazione;
  titolo: string;
  descrizione: string | null;
  assegnato_a: string;
  assegnato_da: string;
  stato: StatoLavorazione;
  creato_il: string;
  completato_il: string | null;
  ultimo_promemoria_il: string | null;
}

export interface NotaCalendario {
  id: string;
  testo: string;
  data_promemoria: string;
  ticket_id: string | null;
  completata: boolean;
  creato_da: string | null;
}

export interface ClienteAttivo {
  id: string;
  nome: string;
  telefono: string | null;
  email: string | null;
  indirizzo: string | null;
  tariffa_id: string | null;
  canone_mensile: number | null;
  scadenza_contratto: string | null;
  note: string | null;
}

export interface RapportinoIntervento {
  id: string;
  ticket_id: string;
  esito: string;
  lavori_svolti: string | null;
  materiali: string | null;
  /** ★ solo rapportini storici (pre-firma via email): disegno del cliente
   * caricato come immagine — vedi firma_metodo/email/verificato_il sotto
   * per i rapportini nuovi, stesso schema di SchedaLavoro. */
  firma_url: string | null;
  firma_metodo: "otp_email" | "link_email" | null;
  firma_email: string | null;
  firma_verificato_il: string | null;
  foto: { nome: string; percorso: string }[];
  creato_da: string | null;
  creato_il: string;
}

export interface MaterialeMagazzino {
  id: string;
  nome: string;
  categoria: string | null;
  descrizione: string | null;
  /** Prezzo per cliente Privato, IVA inclusa — vedi prezzoPerTipoCliente(). */
  prezzo_unitario: number;
  unita_misura: string;
  /** ★ derivato da `tipo_riga` lato server (creaMateriale/aggiornaMateriale)
   * — mai scritto a mano, per non poter più disallinearsi. Resta un campo
   * a sé (invece di sostituirlo del tutto con `tipo_riga === "Comodato"`)
   * perché letto da molto codice già esistente (prezzo forzato a zero,
   * badge "COMODATO"...). */
  comodato_uso: boolean;
  attivo: boolean;
  ordine: number;
  /** Compare nel selettore materiali delle Schede di Installazione/
   * Lavorazione Tecnica — indipendente da `attivo` (che resta il permesso
   * generale "esiste nel listino", usato anche da Preventivi). */
  mostra_in_schede_lavoro: boolean;
  /** ★ NUOVA — come questa riga va raggruppata nel passo "Materiali" della
   * Scheda di lavoro: Comodato (installato, non fatturato) / Prodotto /
   * Servizio. Unico campo che l'amministratore edita in Materiali — vedi
   * comment sulla colonna, migrazione 0055. */
  tipo_riga: "Comodato" | "Prodotto" | "Servizio";
  /** ★ NUOVA — se valorizzata, questa riga si aggiunge da sola nella
   * Scheda per il tipo cliente indicato (tipicamente il costo di
   * attivazione), con `prezzo_unitario` preso così com'è — mai passato
   * per prezzoPerTipoCliente(). Al più una riga per valore, ma non è
   * imposto a livello di database: un doppione va solo evitato in
   * Materiali. */
  attivazione_predefinita: "Privato" | "Business" | null;
  /** ★ NUOVA — quantità a magazzino. NULL = materiale non tracciato (resta
   * solo voce di listino, come prima di questa funzione). Si scarica da
   * solo quando il materiale è usato in una Scheda di Installazione/
   * Lavorazione Tecnica salvata (non da Preventivi, solo un'ipotesi, né
   * dal Rapportino di chiusura Ticket, i cui materiali sono testo libero
   * non strutturato). */
  giacenza: number | null;
  /** Sotto questa quantità scatta un avviso in Chat interna al reparto
   * Analisi Rete. NULL = nessun avviso impostato per questo materiale. */
  soglia_minima: number | null;
  /** Evita di ripetere l'avviso ad ogni scheda salvata mentre si resta
   * sotto soglia — non è un timestamp mostrato in UI. */
  ultimo_avviso_il: string | null;
}

/** ★ NUOVA — stato di un pezzo nell'inventario Antenne (per MAC). */
export const STATI_ANTENNA = ["Disponibile", "Prenotata", "Installata"] as const;
export type StatoAntenna = (typeof STATI_ANTENNA)[number];

/** ★ NUOVA — un'antenna/CPE censita per MAC, raggruppata per tipologia
 * (stessa lista di OPZIONI_INSTALLAZIONE.cpe). A differenza degli altri
 * materiali non si conta a quantità: ogni pezzo è un record a sé, che
 * passa da Disponibile a Prenotata (impegnata per un Ticket futuro dal
 * tecnico di Analisi Rete) a Installata (agganciata in automatico quando
 * il MAC compare in una Scheda di Installazione salvata). */
export interface AntennaInventario {
  id: string;
  tipologia: string;
  mac: string;
  stato: StatoAntenna;
  ticket_id: string | null;
  scheda_lavoro_id: string | null;
  note: string | null;
  creato_da: string | null;
  creato_il: string;
  aggiornato_il: string;
}

/** Regola prezzi del listino Materiali/Servizi: il prezzo salvato è
 * sempre quello per un cliente Privato (IVA già inclusa). Un cliente
 * Business paga lo stesso importo trattato come imponibile + IVA 22% —
 * quindi una cifra più alta per lo stesso materiale. */
export function prezzoPerTipoCliente(prezzoPrivato: number, tipo: "Privato" | "Business"): number {
  return tipo === "Business" ? prezzoPrivato * (1 + ALIQUOTA_IVA) : prezzoPrivato;
}

/** Istantanea di un materiale usato in una scheda — nome/prezzo restano
 * quelli di quel momento anche se il catalogo cambia dopo. */
export interface MaterialeUsato {
  materiale_id: string | null;
  nome: string;
  quantita: number;
  unita_misura: string;
  prezzo_unitario: number;
  comodato_uso: boolean;
  /** ★ NUOVA — istantanea della classificazione del catalogo al momento
   * dell'uso (stesso principio di nome/prezzo_unitario: una riclassifica
   * successiva in Materiali non deve alterare una Scheda già salvata).
   * Righe salvate prima di questo campo non lo hanno: trattarle come
   * "Prodotto" se non comodato_uso, "Comodato" altrimenti. */
  tipo_riga?: "Comodato" | "Prodotto" | "Servizio";
  /** ★ NUOVA — true se questa riga è stata aggiunta da sola (costo di
   * attivazione predefinito) invece che scelta dal tecnico. */
  automatico?: boolean;
  dettagli: string | null;
}

/** ★ ex Installazione.html/InterventoLoco.html del vecchio gestionale —
 * quale scheda aprire per completare un appuntamento si decide dal
 * `tipo_servizio` scelto quando l'appuntamento è stato pianificato a
 * Calendario (vedi TipoServizioAppuntamento). Un'unica tabella con
 * colonne "solo Installazione" / "solo Lavorazione" invece di due
 * tabelle, per non duplicare i campi comuni (materiali, foto, firme,
 * importo, note). */
export interface SchedaLavoro {
  id: string;
  appuntamento_id: string;
  ticket_id: string | null;
  tipo: TipoServizioAppuntamento;
  esito: string | null;
  note: string | null;
  /** ★ NUOVA (2026-08) — non più scritto a mano dal tecnico: calcolato lato
   * server come somma di `materiali` (le righe in comodato pesano 0 da
   * sole, non serve escluderle a parte) — unica fonte di verità, vedi
   * salvaSchedaLavoro(). */
  importo_fatturato: number | null;
  /** ★ NUOVA — come il cliente ha pagato la posa. NULL sulle schede
   * salvate prima di questo campo. */
  metodo_pagamento_posa: "Contanti" | "POS" | "Non riscosso" | null;
  materiali: MaterialeUsato[];
  foto: { nome: string; percorso: string }[];
  /** ★ solo schede storiche (pre-firma via email): disegno del cliente
   * caricato come immagine. Le schede nuove hanno questo a null e usano
   * invece firma_cliente_metodo/email/verificato_il — vedi sotto. */
  firma_cliente_url: string | null;
  firma_tecnico_url: string | null;
  /** null = scheda storica con firma disegnata (firma_cliente_url) —
   * altrimenti il metodo usato per l'approvazione via email del cliente. */
  firma_cliente_metodo: "otp_email" | "link_email" | null;
  firma_cliente_email: string | null;
  /** Valorizzato solo quando il cliente ha davvero confermato — con
   * "link_email" può restare null per un po' se il tecnico ha già chiuso
   * la scheda ma il cliente non ha ancora cliccato il link. */
  firma_cliente_verificato_il: string | null;
  // solo "Nuova installazione"
  supporto: string | null;
  posizione: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  tipo_cavo: string | null;
  metri_cavo: number | null;
  bts: string | null;
  modello_cpe: string | null;
  mac: string | null;
  vlan: string | null;
  rssi: number | null;
  snr: number | null;
  router: string | null;
  ping_ms: number | null;
  download_mbps: number | null;
  upload_mbps: number | null;
  // solo "Lavorazione tecnica"
  interventi_eseguiti: string[];
  creato_da: string | null;
  creato_il: string;
}

/** Opzioni delle select della Scheda Installazione — ex foglio
 * "MenuInstallazione" del vecchio gestionale. Elenco fisso qui invece di
 * una pagina di amministrazione dedicata: si può sempre scegliere "Altro"
 * e specificare in nota, e sono valori che cambiano raramente. */
export const OPZIONI_INSTALLAZIONE = {
  supporto: ["Palo Esistente", "Nuovo Palo", "Staffa a L a Muro", "Zanca da Camino", "Altro"],
  cavo: ["Cat5e FTP Outdoor", "Cat6 FTP Outdoor", "Fibra Ottica Drop", "Cat6 UTP Indoor", "Altro"],
  cpe: ["Cambium", "Albentia 150-Rs", "Albentia 150-15", "Albentia 250-Rs", "Albentia 250-15", "Albentia 350-Rs", "Albentia 350-15", "Altro"],
  router: ["TP-Link EX230V", "TP-Link Deco Mesh", "MikroTik hAP", "Router Cliente", "Altro"],
} as const;

/** Interventi rapidi selezionabili nella Scheda Lavorazione Tecnica — ex
 * chip di InterventoLoco.html. */
export const INTERVENTI_RAPIDI = [
  "Riallineamento Antenna",
  "Sostituzione Cavo",
  "Configurazione Router",
  "Riavvio Apparati",
  "Problema Alimentazione",
  "Installazione Nuova",
] as const;

export const ESITI_INTERVENTO = ["Risolto", "Parziale", "In Attesa", "Non Risolto"] as const;

export const TIPI_RICHIESTA_CLIENTE = ["Cambio IBAN", "Cambio Anagrafica", "Trasferimento", "Subentro"] as const;
export type TipoRichiestaCliente = (typeof TIPI_RICHIESTA_CLIENTE)[number];

export const REPARTO_PER_TIPO_RICHIESTA: Record<TipoRichiestaCliente, AreaAccesso> = {
  "Cambio IBAN": "Fatturazione",
  "Cambio Anagrafica": "Fatturazione",
  Trasferimento: "Commerciale",
  Subentro: "Commerciale",
};