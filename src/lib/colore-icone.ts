// ★ NUOVA (2026-09-01, richiesta esplicita: "integrerei le icone e anche
// quelle colorate in tutto il gestionale per migliorare l'usabilità" —
// proposta con artifact "Icone Colorate: Proposte", scelta la "A · Colore
// per significato del dato") — un solo posto da cui derivano i colori delle
// icone di contenuto in tutto il gestionale: lo stesso TIPO di dato ha
// sempre lo stesso colore ovunque compaia (un telefono è sempre blu, un
// documento sempre viola...), indipendentemente dalla pagina o dal "mondo"
// a cui appartiene — diverso, deliberatamente, dal colore per-mondo già in
// uso in app-sidebar.tsx (`Mondo.accento`), che risponde invece a "dove sei
// nel menu", non a "che tipo di informazione stai guardando".
//
// Ogni categoria porta due classi Tailwind: `ic` per il colore dell'icona
// (testo/stroke) e `bg` per lo sfondo tenue del "chip" quadrato che la
// contiene nelle intestazioni di scheda/card — stesso trattamento del
// riquadro icona già introdotto nella sidebar (vedi app-sidebar.tsx).
export type CategoriaIcona = "contatto" | "luogo" | "documento" | "denaro" | "tempo" | "persona";

// ★ ESTESA (2026-09-03, "vai con la c" — bordo colorato a sinistra sui
// gruppi dati di Gestione Cliente, artifact "Colorazione Gestione
// Cliente") — `bordo` per un bordo (es. `border-l`) nello stesso colore
// pieno dell'icona, invece del tenue `bg` usato per il chip: derivato qui,
// unica fonte, non ricalcolato a mano dove serve.
export const COLORE_ICONA: Record<CategoriaIcona, { ic: string; bg: string; bordo: string }> = {
  contatto: { ic: "text-[#4F8EF7]", bg: "bg-[#4F8EF7]/15", bordo: "border-[#4F8EF7]" },
  luogo: { ic: "text-[#14B8A6]", bg: "bg-[#14B8A6]/15", bordo: "border-[#14B8A6]" },
  documento: { ic: "text-[#A78BFA]", bg: "bg-[#A78BFA]/15", bordo: "border-[#A78BFA]" },
  denaro: { ic: "text-[#22C55E]", bg: "bg-[#22C55E]/15", bordo: "border-[#22C55E]" },
  tempo: { ic: "text-[#F59E0B]", bg: "bg-[#F59E0B]/15", bordo: "border-[#F59E0B]" },
  persona: { ic: "text-[#F472B6]", bg: "bg-[#F472B6]/15", bordo: "border-[#F472B6]" },
};
