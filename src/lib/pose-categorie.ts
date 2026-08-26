// ★ NUOVA (2026-08-26) — palette "Segnale" per le Schede di Lavoro su
// pose.donewifi.it, scelta tra 3 direzioni proposte con artifact
// ("1 · Segnale", tech vivido: blu/verde/viola, contro "2 · Cantiere" e
// "3 · Wifi Playful"). Deliberatamente SEPARATA dai token del gestionale
// interno (--primary rosso brand, globals.css): pose ha una sua identità
// visiva a colori-per-categoria, il gestionale resta invariato — vedi
// anche `pose/layout.tsx` (font Sora/Manrope/Space Mono, diversi da
// Geist). Ogni categoria di domanda ha un colore fisso, mai ciclato,
// stesso principio di COLORE_REPARTO in lib/types.ts.
export type CategoriaDomanda = "struttura" | "radio" | "materiali" | "pagamento" | "note" | "foto" | "firma" | "gps";

export interface StileCategoria {
  etichetta: string;
  testo: string;
  sfondo: string;
  da: string;
  a: string;
}

export const CATEGORIE_DOMANDA: Record<CategoriaDomanda, StileCategoria> = {
  struttura: { etichetta: "Struttura", testo: "#1848C7", sfondo: "#E4ECFF", da: "#2D6CFF", a: "#5B9BFF" },
  radio: { etichetta: "Radio", testo: "#1848C7", sfondo: "#E4ECFF", da: "#2D6CFF", a: "#00D68F" },
  materiali: { etichetta: "Materiali", testo: "#0E8577", sfondo: "#DFFAF0", da: "#00B98A", a: "#00D68F" },
  pagamento: { etichetta: "Pagamento", testo: "#B4740A", sfondo: "#FFF3DC", da: "#FFB020", a: "#FF8A3D" },
  note: { etichetta: "Note", testo: "#5E2FD1", sfondo: "#F1EBFF", da: "#7C4DFF", a: "#B08CFF" },
  foto: { etichetta: "Foto", testo: "#1848C7", sfondo: "#E4ECFF", da: "#2D6CFF", a: "#5B9BFF" },
  firma: { etichetta: "Firma", testo: "#5E2FD1", sfondo: "#F1EBFF", da: "#7C4DFF", a: "#B08CFF" },
  gps: { etichetta: "Posizione", testo: "#1848C7", sfondo: "#E4ECFF", da: "#2D6CFF", a: "#00D68F" },
};
