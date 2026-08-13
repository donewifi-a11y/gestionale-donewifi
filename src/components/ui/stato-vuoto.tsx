import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** ★ NUOVA — richiesta esplicita: le liste vuote mostravano solo una riga
 * di testo grigio in un riquadro tratteggiato ("Nessun preventivo.",
 * "Nessun risultato.") — corretto ma spoglio, soprattutto la primissima
 * cosa che vede un reparto nuovo o un filtro senza risultati. Un'icona dà
 * un punto di appoggio visivo, `azione` (facoltativa) è per i pochi casi
 * dove ha davvero senso proporre un passo successivo — un filtro senza
 * risultati non ne ha uno, un elenco genuinamente vuoto spesso sì. */
export function StatoVuoto({
  icona: Icona,
  titolo,
  azione,
  compatto = false,
}: {
  icona: LucideIcon;
  titolo: string;
  azione?: { testo: string; href: string };
  compatto?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-center text-muted-foreground ${
        compatto ? "p-6" : "p-10"
      }`}
    >
      <Icona className={compatto ? "h-6 w-6 text-muted-foreground/60" : "h-8 w-8 text-muted-foreground/60"} strokeWidth={1.75} />
      <p className="text-sm">{titolo}</p>
      {azione && (
        <Link href={azione.href} className="mt-1">
          <Button size="sm">{azione.testo}</Button>
        </Link>
      )}
    </div>
  );
}
