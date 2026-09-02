import type { LucideIcon } from "lucide-react";
import { COLORE_ICONA, type CategoriaIcona } from "@/lib/colore-icone";

/** ★ NUOVA (2026-09-01, richiesta esplicita: "integrerei le icone e anche
 * quelle colorate in tutto il gestionale" — proposta con artifact "Icone
 * Colorate: Proposte", scelta la "A · Colore per significato del dato") —
 * un solo componente per il "chip" quadrato colorato attorno a un'icona,
 * usato sia nelle intestazioni di scheda/card (dimensione "md") sia nelle
 * righe inline come i contatti (dimensione "sm"), così il trattamento resta
 * identico ovunque compaia invece di essere riscritto a mano pagina per
 * pagina. Il colore viene da COLORE_ICONA (lib/colore-icone.ts), mai
 * scelto qui — questo componente sa solo disegnare il chip, non decidere i
 * colori. */
export function IconaCategoria({
  icona: Icona,
  categoria,
  dimensione = "md",
}: {
  icona: LucideIcon;
  categoria: CategoriaIcona;
  dimensione?: "sm" | "md";
}) {
  const colore = COLORE_ICONA[categoria];
  const box = dimensione === "sm" ? "h-5 w-5" : "h-6 w-6";
  const ic = dimensione === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center rounded-md ${colore.bg}`}>
      <Icona className={`${ic} ${colore.ic}`} strokeWidth={2.25} />
    </span>
  );
}
