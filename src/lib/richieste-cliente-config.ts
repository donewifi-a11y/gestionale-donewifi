// ★ Configurazione condivisa (pagina pubblica + route API + bottone di
// invio dal Ticket) per le 4 pratiche cliente ex form dedicati del
// vecchio gestionale (RichiestaDati.html, sezioni Subentro/Trasferimento/
// Cambio IBAN/Cambio Anagrafica) — ognuna ha ora il proprio set di campi
// (vedi richiesta-cliente-form.tsx), non più un unico campo generico.
export const RICHIESTE_CLIENTE_CONFIG = {
  "cambio-iban": {
    tipo: "Cambio IBAN" as const,
    titolo: "Cambio IBAN",
    intro: "Comunicaci il nuovo IBAN da usare per l'addebito delle fatture.",
  },
  "cambio-anagrafica": {
    tipo: "Cambio Anagrafica" as const,
    titolo: "Cambio Anagrafica",
    intro: "Comunicaci il nuovo recapito da aggiornare sul contratto.",
  },
  trasferimento: {
    tipo: "Trasferimento" as const,
    titolo: "Trasferimento",
    intro: "Comunicaci il nuovo indirizzo dove trasferire la tua linea.",
  },
  subentro: {
    tipo: "Subentro" as const,
    titolo: "Subentro",
    intro: "Compila i dati richiesti per completare la pratica di subentro sull'impianto.",
  },
} as const;

export type SlugRichiestaCliente = keyof typeof RICHIESTE_CLIENTE_CONFIG;
export const SLUG_RICHIESTE_CLIENTE = Object.keys(RICHIESTE_CLIENTE_CONFIG) as SlugRichiestaCliente[];
