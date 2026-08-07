// ★ le route pubbliche (richiesta-dati, richiesta-cliente) salvano i campi
// del modulo con il loro nome tecnico (es. "codiceFiscale") in dettagli
// jsonb — qui solo per mostrarli con un'etichetta leggibile allo staff.
export const ETICHETTE_DETTAGLI: Record<string, string> = {
  nome: "Nome",
  cognome: "Cognome",
  cf: "Codice Fiscale",
  codiceFiscale: "Codice Fiscale",
  codiceFiscaleAzienda: "Codice Fiscale Azienda",
  ragioneSociale: "Ragione Sociale",
  piva: "Partita IVA",
  partitaIva: "Partita IVA",
  pec: "PEC",
  sdi: "Codice SDI",
  legaleRappresentanteNome: "Legale Rappresentante",
  legaleRappresentanteCf: "CF Legale Rappresentante",
  telefono: "Telefono",
  email: "Email",
  iban: "IBAN",
  ibanIntestatarioNome: "Intestatario conto",
  ibanIntestatarioCf: "CF Intestatario conto",
  mandatoSepa: "Mandato SEPA",
  metodoPagamento: "Metodo di pagamento",
  tipoDocumento: "Tipo documento",
  via: "Via",
  civico: "Civico",
  comune: "Comune",
  cap: "CAP",
  piano: "Piano/Interno",
  dataPreferita: "Data preferita",
  nuovoTelefono: "Nuovo telefono",
  nuovaEmail: "Nuova email",
  note: "Note",
  tipologiaCliente: "Tipologia Cliente",
  profiloInternet: "Profilo Internet",
  router: "Router",
  extenderMesh: "Extender mesh",
  costoMensile: "Canone mensile",
  costoUnaTantum: "Costo una tantum",
};

export function etichettaDettaglio(chiave: string): string {
  return ETICHETTE_DETTAGLI[chiave] ?? chiave;
}
