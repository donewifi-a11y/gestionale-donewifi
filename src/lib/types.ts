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
  Commerciale: ["Trasferimento impianto", "Nuovo contratto", "Subentro", "Upgrade/Downgrade"],
  Amministrativa: ["Cambio anagrafico", "Disdetta", "Cambio IBAN", "Fatture non saldate"],
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
}

export type StatoAppuntamento = "Programmato" | "Completato" | "Annullato";

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
  ordine: number;
}

export const ALIQUOTA_IVA = 0.22;

/** Dato un prezzo e se è già IVA inclusa, restituisce { netto, lordo } per mostrare sempre entrambi. */
export function prezziNettoLordo(prezzo: number, ivaInclusa: boolean): { netto: number; lordo: number } {
  return ivaInclusa
    ? { netto: prezzo / (1 + ALIQUOTA_IVA), lordo: prezzo }
    : { netto: prezzo, lordo: prezzo * (1 + ALIQUOTA_IVA) };
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
  firma_url: string | null;
  foto: { nome: string; percorso: string }[];
  creato_da: string | null;
  creato_il: string;
}

export const TIPI_RICHIESTA_CLIENTE = ["Cambio IBAN", "Cambio Anagrafica", "Trasferimento", "Subentro"] as const;
export type TipoRichiestaCliente = (typeof TIPI_RICHIESTA_CLIENTE)[number];

export const REPARTO_PER_TIPO_RICHIESTA: Record<TipoRichiestaCliente, AreaAccesso> = {
  "Cambio IBAN": "Fatturazione",
  "Cambio Anagrafica": "Fatturazione",
  Trasferimento: "Commerciale",
  Subentro: "Commerciale",
};