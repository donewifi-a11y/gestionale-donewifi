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

// ★ NUOVA (2026-08-31, richiesta esplicita dopo la revisione dei testi email:
// "ma questo è il testo della mail?" — l'utente ha notato che il messaggio
// WhatsApp/copia-link ("Ciao Nasso, per la tua pratica di trasferimento con
// Done Wifi apri questo link") era rimasto con la stessa formula generica
// corretta nelle email in src/lib/email.ts) — apertura dedicata per pratica,
// chiave = lo stesso `titolo` già usato da RICHIESTE_CLIENTE_CONFIG e da
// PRATICHE_INVIABILI (tickets-board.tsx), così un solo posto serve sia il
// pannello Cliente Esterno sia il pannello Ticket.
const APERTURA_WHATSAPP_PRATICA: Record<string, string> = {
  "Cambio IBAN": "per aggiornare l'IBAN sul tuo contratto Done Wifi apri il link qui sotto",
  "Cambio Anagrafica": "per aggiornare i tuoi dati sul contratto Done Wifi apri il link qui sotto",
  Trasferimento: "per il trasferimento della tua linea Done Wifi apri il link qui sotto e indicaci il nuovo indirizzo",
  Subentro: "per completare il subentro sul contratto Done Wifi apri il link qui sotto",
  "Disdetta contratto": "per la disdetta del tuo contratto Done Wifi apri il link qui sotto",
};

export function messaggioWhatsappPratica(nome: string, titolo: string, link: string): string {
  const primoNome = nome.trim().split(/\s+/)[0];
  const apertura = APERTURA_WHATSAPP_PRATICA[titolo] ?? `per la tua pratica di ${titolo.toLowerCase()} con Done Wifi apri il link qui sotto`;
  return `Ciao ${primoNome}, ${apertura}: ${link}`;
}
