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

export interface Ticket {
  id: string;
  numero: number;
  data_creazione: string;
  cliente: string;
  telefono: string | null;
  email: string | null;
  indirizzo: string | null;
  categoria: string;
  problema: string | null;
  stato: StatoTicket;
  priorita: PrioritaTicket;
  reparto: AreaAccesso;
  tecnico_assegnato: string | null;
  note: string | null;
  contratto_pdf_url: string | null;
  segnalazione_id: string | null;
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

export interface RichiestaCliente {
  id: string;
  data: string;
  tipo_richiesta: string;
  cliente: string | null;
  segnalazione_id: string | null;
  dettagli: Record<string, string>;
  documenti: { nome: string; percorso: string }[];
  stato: string;
}