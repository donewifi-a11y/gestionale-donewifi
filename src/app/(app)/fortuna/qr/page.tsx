import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FortunaIntestazione } from "@/components/fortuna/fortuna-intestazione";
import { richiediFortuna } from "@/lib/fortuna/permessi";

/**
 * ★ NUOVA — il QR che chi vuole partecipare inquadra (banner/locandine): punta a fortuna.donewifi.it.
 * È un file statico: l'indirizzo è fisso per tutte le campagne, quindi il QR già stampato resta valido.
 */
export default async function QrFortuna() {
  const { isAdmin } = await richiediFortuna("operatore");
  return (
    <div className="mx-auto max-w-5xl">
      <FortunaIntestazione attiva="qr" isAdmin={isAdmin} />
      <Card className="max-w-md">
        <CardContent className="flex flex-col items-center gap-4 pt-4 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fortuna/qr-fortuna.png" alt="QR code per partecipare: fortuna.donewifi.it" className="h-auto w-72 rounded-xl border bg-white" />
          <p className="font-mono text-sm">https://fortuna.donewifi.it</p>
          <p className="text-sm text-muted-foreground">
            Chi lo inquadra arriva al gioco. L&apos;indirizzo è lo stesso per ogni campagna, quindi i banner già stampati restano validi.
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline"><a href="/fortuna/qr-fortuna.png" download><Download />PNG</a></Button>
            <Button asChild variant="outline"><a href="/fortuna/qr-fortuna.svg" download><Download />SVG (stampa)</a></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
