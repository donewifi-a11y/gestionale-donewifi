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
      className="flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-bold text-primary-foreground active:scale-[0.97] disabled:opacity-60"
    >
      {inCorso ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <HandHelping className="h-4 w-4" strokeWidth={2.5} />}
      Prendi in carico
    </button>
  );
}
