// ★ FIX — il verde WhatsApp (colore di marchio di terzi, giustamente non
// nel design system dell'app) era scritto come hex letterale in 3 file
// diversi, con leggere differenze di utilizzo. Un solo punto da cui
// derivano tutte e tre le varianti — non un token semantico dell'app
// (resta un colore di marchio esterno), solo non più duplicato a mano.
export const COLORE_WHATSAPP = {
  /** Icona piena (badge), es. invio-link.tsx/segnalazioni-board.tsx. */
  badge: "bg-[#25b063] text-white",
  /** Pulsante tenue, es. vista-tecnico-board.tsx. */
  bottoneSoft: "bg-[#25b063]/10 text-[#1a8046]",
} as const;
