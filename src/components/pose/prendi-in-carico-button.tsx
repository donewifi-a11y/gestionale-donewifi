"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { HandHelping, Loader2 } from "lucide-react";
import { prendiInCaricoAppuntamentoPose } from "@/app/pose/actions";
import { useToast } from "@/components/ui/toast";

// ★ NUOVA (2026-08-28, "mancano un po' di pose da fare") — bottone per
// prendere in carico un appuntamento oggi senza nessun tecnico assegnato
// (vedi il commento su appuntamentiNonAssegnati in pose/actions.ts). Su
// conflitto (qualcun altro l'ha già preso) il server lo segnala con un
// errore chiaro invece di sovrascrivere in silenzio.
//
// ★ FIX (2026-08-28, "migliorare, non si capisce nulla") — blu invece del
// rosso di brand (`bg-primary`): questa card sta appena sotto la sezione
// "In ritardo", già rossa perché è un avviso critico. Un secondo bottone
// rosso, per un'azione neutra come "prendi in carico", leggeva come un
// altro allarme invece che una scelta normale — stesso blu già usato in
// pose per gli elementi "informativi" (calendario squadra, badge "Tu").
export function PrendiInCaricoButton({ appuntamentoId }: { appuntamentoId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [inCorso, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={inCorso}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        startTransition(async () => {
          const risultato = await prendiInCaricoAppuntamentoPose(appuntamentoId);
          if (risultato.errore) {
            toast(risultato.errore);
            router.refresh();
            return;
          }
          toast("Preso in carico.", "successo");
          router.refresh();
        });
      }}
      style={{ background: "linear-gradient(90deg, #2D6CFF, #7C4DFF)" }}
      className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-60"
    >
      {inCorso ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <HandHelping className="h-4 w-4" strokeWidth={2.5} />}
      Prendi in carico
    </button>
  );
}
