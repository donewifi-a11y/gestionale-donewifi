"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { PhoneCall, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trasformaInSegnalazione } from "@/app/(app)/fortuna/actions";

/** ★ NUOVA — pulsante «Trasforma in segnalazione» con l'avviso doppioni già usato nelle chiamate in arrivo. */
export function TrasformaSegnalazione({ couponId }: { couponId: string }) {
  const [inCorso, avvia] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);
  const [duplicati, setDuplicati] = useState<string[] | null>(null);
  const [creata, setCreata] = useState<{ numero: number; id: string } | null>(null);

  function vai(forza: boolean) {
    setErrore(null);
    avvia(async () => {
      const r = await trasformaInSegnalazione(couponId, forza);
      if (r.errore) return setErrore(r.errore);
      if (r.duplicati) return setDuplicati(r.duplicati);
      if (r.numero != null && r.id) { setDuplicati(null); setCreata({ numero: r.numero, id: r.id }); }
    });
  }

  if (creata) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-xl bg-emerald-500/10 p-4">
        <p className="font-semibold text-emerald-700 dark:text-emerald-400">✔ Segnalazione #{creata.numero} creata</p>
        <p className="text-sm text-muted-foreground">Nome, telefono, email e coupon sono già dentro. L&apos;indirizzo lo raccogli durante la chiamata.</p>
        <Button asChild size="lg" className="h-11 w-full text-base"><Link href={`/segnalazioni?aperto=${creata.id}`}><PhoneCall />Apri la segnalazione</Link></Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" size="lg" disabled={inCorso} onClick={() => vai(false)} className="h-12 w-full text-base">
        <PhoneCall />{inCorso ? "Creo la segnalazione…" : "Trasforma in segnalazione"}
      </Button>
      <p className="text-sm text-muted-foreground">Nasce in «Nuovi Clienti», da contattare. Il coupon resta collegato.</p>

      {errore && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">{errore}</p>}

      {duplicati && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg bg-amber-500/10 p-3 text-sm">
          <p className="flex items-start gap-2 font-medium text-amber-700 dark:text-amber-400"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />Esiste già una segnalazione con questo telefono o questa email:</p>
          <ul className="list-disc pl-6 text-muted-foreground">{duplicati.map((d) => <li key={d}>{d}</li>)}</ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={inCorso} onClick={() => vai(true)}>È un cliente diverso: crea comunque</Button>
            <Button type="button" variant="ghost" onClick={() => setDuplicati(null)}>Annulla</Button>
          </div>
        </div>
      )}
    </div>
  );
}
