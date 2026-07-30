// ★ Configurazione condivisa (pagina pubblica + route API + bottone di
// invio dal Ticket) per le 4 pratiche cliente ex form dedicati del
// vecchio gestionale (RichiestaDati... varianti) — qui semplificate in
// un unico form generico guidato da questa tabella.
export const RICHIESTE_CLIENTE_CONFIG = {
  "cambio-iban": {
    tipo: "Cambio IBAN" as const,
    titolo: "Cambio IBAN",
    intro: "Comunicaci il nuovo IBAN da usare per l'addebito delle fatture.",
    campoLabel: "Nuovo IBAN",
    campoPlaceholder: "IT00 A000 0000 0000 0000 0000 000",
    campoNome: "iban",
    validaIban: true,
  },
  "cambio-anagrafica": {
    tipo: "Cambio Anagrafica" as const,
    titolo: "Cambio Anagrafica",
    intro: "Comunicaci il nuovo recapito (telefono e/o email) da aggiornare sul contratto.",
    campoLabel: "Nuovo telefono e/o email",
    campoPlaceholder: "Es. nuovo telefono: 333... — nuova email: nome@...",
    campoNome: "nuovoRecapito",
    validaIban: false,
  },
  trasferimento: {
    tipo: "Trasferimento" as const,
    titolo: "Trasferimento",
    intro: "Comunicaci il nuovo indirizzo dove trasferire la tua linea.",
    campoLabel: "Nuovo indirizzo completo",
    campoPlaceholder: "Via, civico, comune, CAP",
    campoNome: "nuovoIndirizzo",
    validaIban: false,
  },
  subentro: {
    tipo: "Subentro" as const,
    titolo: "Subentro",
    intro: "Comunicaci i dati di chi subentra nel contratto.",
    campoLabel: "Nome e Codice Fiscale del nuovo intestatario",
    campoPlaceholder: "Nome Cognome, Codice Fiscale",
    campoNome: "nuovoIntestatario",
    validaIban: false,
  },
} as const;

export type SlugRichiestaCliente = keyof typeof RICHIESTE_CLIENTE_CONFIG;
export const SLUG_RICHIESTE_CLIENTE = Object.keys(RICHIESTE_CLIENTE_CONFIG) as SlugRichiestaCliente[];
