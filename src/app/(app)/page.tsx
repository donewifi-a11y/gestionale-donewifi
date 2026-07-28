import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/**
 * ★ NUOVA — home minimale del nucleo essenziale: le due sole aree già
 * costruite in questa fase. Diventerà l'hub "Mondi Operativi" quando le
 * fasi successive (Dashboard, Clienti Attivi, ecc.) saranno aggiunte.
 */
export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Centro Operativo</h1>
      <p className="mb-6 text-muted-foreground">Scegli l&apos;area di lavoro</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/tickets">
          <Card className="cursor-pointer transition hover:shadow-md hover:border-primary/40">
            <CardHeader>
              <CardTitle>🎫 Ticket</CardTitle>
              <CardDescription>Crea e gestisci i ticket di assistenza.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/segnalazioni">
          <Card className="cursor-pointer transition hover:shadow-md hover:border-primary/40">
            <CardHeader>
              <CardTitle>📞 Segnalazioni</CardTitle>
              <CardDescription>Nuovi contatti, richiesta dati, contratto.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
