// ★ ex CONFIG_CATEGORIE di NuovoTicket.html — campi specifici per
// sottocategoria, mostrati in "Nuovo Ticket" quando se ne sceglie una.
// Salvati in tickets.dettagli_extra (jsonb), un solo campo invece di una
// tabella per tipo: più semplice da mantenere, stesso risultato per chi
// apre il ticket (solo le domande rilevanti per quel caso).

export type TipoCampoExtra = "select" | "text" | "textarea" | "tel" | "date" | "number" | "file";

export interface CampoExtra {
  id: string;
  label: string;
  tipo: TipoCampoExtra;
  obbligatorio: boolean;
  opzioni?: string[];
  placeholder?: string;
  hint?: string;
}

export interface ConfigSottocategoria {
  info?: string;
  campi: CampoExtra[];
}

export const CONFIG_SOTTOCATEGORIE: Record<string, ConfigSottocategoria> = {
  "Internet assente": {
    info: "Hai già provato a riavviare il router e l'alimentatore dell'antenna, staccando la spina per 10 secondi?",
    campi: [
      { id: "da_quanto", label: "Da quanto manca la connessione?", tipo: "select", obbligatorio: true, opzioni: ["Pochi minuti", "Da oggi", "Da più giorni"] },
      { id: "luci_router", label: "Le luci del router sono accese?", tipo: "select", obbligatorio: true, opzioni: ["Tutte accese", "Alcune spente", "Router spento"] },
      { id: "stato_alimentatore", label: "Stato alimentatore CPE", tipo: "select", obbligatorio: true, opzioni: ["Luce verde su alimentatore CPE", "Alimentatore spento", "Luce lampeggia"] },
      { id: "eventi_recenti", label: "Eventi recenti (temporali, sbalzi di tensione)", tipo: "textarea", obbligatorio: false },
    ],
  },
  "Internet lento": {
    info: "Se possibile, effettua uno speedtest collegando un PC con cavo LAN prima di inviare la richiesta.",
    campi: [
      { id: "quando_rallenta", label: "Quando noti il rallentamento?", tipo: "select", obbligatorio: true, opzioni: ["Sempre", "Solo di sera", "Ore di punta"] },
      { id: "dispositivi", label: "Dispositivi interessati (Wi-Fi o cavo)", tipo: "text", obbligatorio: true },
      { id: "utilizzo", label: "Che utilizzo fai della connessione?", tipo: "text", obbligatorio: true },
    ],
  },
  Voip: {
    info: "Assicurati che il cavo telefonico sia inserito direttamente dietro al router e non nella presa a muro.",
    campi: [
      { id: "numero_tel_voip", label: "Numero di telefono interessato", tipo: "tel", obbligatorio: true },
      { id: "tipo_problema_voip", label: "Tipo di problema", tipo: "select", obbligatorio: true, opzioni: ["Non chiama", "Non risponde", "Cade la linea", "Audio disturbato"] },
    ],
  },
  "Intervento in loco": {
    campi: [
      { id: "disponibilita", label: "Disponibilità preferita", tipo: "select", obbligatorio: true, opzioni: ["Mattina", "Pomeriggio", "Indifferente"] },
      { id: "data_preferita", label: "Data preferita", tipo: "date", obbligatorio: true },
      { id: "recapito_alt", label: "Recapito telefonico alternativo", tipo: "tel", obbligatorio: false },
      { id: "foto_apparati", label: "Foto apparati", tipo: "file", obbligatorio: false },
    ],
  },
  "Pianificazione installazione": {
    campi: [
      { id: "indirizzo_install", label: "Indirizzo di installazione (se diverso)", tipo: "text", obbligatorio: true },
      { id: "tipo_immobile", label: "Tipo di immobile", tipo: "select", obbligatorio: true, opzioni: ["Appartamento", "Villa", "Ufficio"] },
      { id: "note_aggiuntive_install", label: "Note aggiuntive (tetti spioventi, alberi, scale)", tipo: "textarea", obbligatorio: true },
    ],
  },
  "Ritiro Apparati": {
    info: "Ritiro fisico di antenna/router presso il cliente (es. dopo una disdetta) — non genera una nuova disdetta.",
    campi: [
      { id: "disponibilita", label: "Disponibilità preferita", tipo: "select", obbligatorio: true, opzioni: ["Mattina", "Pomeriggio", "Indifferente"] },
      { id: "data_preferita", label: "Data preferita", tipo: "date", obbligatorio: true },
      { id: "apparati_da_ritirare", label: "Apparati da ritirare", tipo: "text", obbligatorio: false, placeholder: "Es. Router + antenna esterna" },
      { id: "recapito_alt", label: "Recapito telefonico alternativo", tipo: "tel", obbligatorio: false },
    ],
  },
  "Nuovo contratto": {
    info: "La Tipologia Cliente determina le tariffe mostrate al cliente nel link \"scegli il tuo piano\".",
    campi: [
      { id: "tipologia_cliente", label: "Tipologia Cliente", tipo: "select", obbligatorio: true, opzioni: ["Residenziale", "Business", "BUY&GO"] },
      { id: "indirizzo_attivazione", label: "Indirizzo di attivazione (se diverso)", tipo: "text", obbligatorio: true },
      { id: "ripetitore", label: "Ripetitore raggiungibile (esito verifica copertura)", tipo: "text", obbligatorio: true },
      { id: "velocita_max", label: "Velocità massima di servizio possibile", tipo: "select", obbligatorio: true, opzioni: ["30 Mbps", "50 Mbps", "100 Mbps"] },
      { id: "estensione_wifi", label: "Estensione Wi-Fi", tipo: "select", obbligatorio: false, opzioni: ["Sì", "No"], hint: "Informazioni per un Extender aggiuntivo a 46,99€ per migliorare la copertura in casa?" },
    ],
  },
  "Upgrade/Downgrade": {
    campi: [
      { id: "tipo_upgrade", label: "Tipo di richiesta", tipo: "select", obbligatorio: true, opzioni: ["Upgrade (aumento velocità)", "Downgrade (riduzione velocità)"] },
      { id: "profilo_attuale", label: "Profilo attuale", tipo: "text", obbligatorio: false, placeholder: "Se lo conosci, es. Connect 50" },
      { id: "nuovo_profilo", label: "Nuovo profilo desiderato", tipo: "select", obbligatorio: true, opzioni: ["Connect 30", "Connect 50", "Connect 100", "Business 30", "Business 50", "Business 100"] },
      { id: "motivo_upgrade", label: "Motivo della richiesta", tipo: "textarea", obbligatorio: false },
    ],
  },
  "Cambio anagrafico": {
    campi: [
      { id: "cosa_modificare", label: "Cosa vuoi modificare", tipo: "select", obbligatorio: true, opzioni: ["Indirizzo", "Telefono", "Email", "Dati fatturazione"] },
      { id: "nuovo_valore", label: "Nuovo valore", tipo: "text", obbligatorio: true },
    ],
  },
  Disdetta: {
    info: "Dopo l'invio: Raccomandata A/R a Studio Armonia Srl o PEC a studioarmonia@pec.it. Antenna e router andranno restituiti al nostro personale.",
    campi: [
      { id: "motivo_disdetta", label: "Motivo", tipo: "select", obbligatorio: true, opzioni: ["Trasloco", "Passo ad altro operatore", "Non mi serve più", "Altro"] },
      { id: "data_desiderata", label: "Data desiderata", tipo: "date", obbligatorio: true },
    ],
  },
  "Fatture non saldate": {
    campi: [
      { id: "numero_fattura", label: "Numero fattura o periodo di fatturazione", tipo: "text", obbligatorio: true },
      { id: "metodo_pagamento", label: "Metodo di pagamento", tipo: "select", obbligatorio: true, opzioni: ["Bonifico", "Carta di credito", "SDD", "Altro"] },
      { id: "importo", label: "Importo", tipo: "number", obbligatorio: false },
      { id: "allegato_contabile", label: "Allegato contabile (foto o PDF)", tipo: "file", obbligatorio: false },
    ],
  },
};
