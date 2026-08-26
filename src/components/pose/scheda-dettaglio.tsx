"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";
import { SchedaInstallazioneDomande } from "@/components/pose/scheda-installazione-domande";
import { SchedaLavorazioneDomande } from "@/components/pose/scheda-lavorazione-domande";
import type { Appuntamento, MaterialeMagazzino } from "@/lib/types";

// ★ NUOVA (2026-08-26) — sceglie la Scheda giusta (Installazione o
// Lavorazione) in base a `tipo_servizio`.
//
// ★ REDESIGN (2026-08-26, richiesta esplicita: "potrebbe essere utilizzato
// da persone non più giovani") — non più SchedaInstallazioneForm/
// SchedaLavorazioneForm "innestate" con le action di pose (un passo con
// più campi ciascuno, come nel gestionale interno): qui SchedaInstallazioneDomande/
// SchedaLavorazioneDomande, "una domanda alla volta" — Opzione A scelta
// tra 3 proposte con artifact (le altre due: sezioni grandi raggruppate,
// modulo su carta a scorrimento unico).
export function SchedaDettaglioPose({ appuntamento, catalogoMateriali }: { appuntamento: Appuntamento; catalogoMateriali: MaterialeMagazzino[] }) {
  const router = useRouter();
  const [salvato, setSalvato] = useState(false);

  if (salvato) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-success/30 bg-success/10 p-6 text-center">
        <Check className="h-8 w-8 text-success" strokeWidth={2.5} />
        <p className="font-semibold text-success">Scheda salvata, intervento completato.</p>
        <button type="button" onClick={() => router.push("/pose")} className="text-sm font-semibold text-primary hover:underline">
          Torna ai tuoi interventi
        </button>
      </div>
    );
  }

  const props = {
    appuntamentoId: appuntamento.id,
    catalogoMateriali,
    onSalvato: () => setSalvato(true),
    onAnnulla: () => router.push("/pose"),
  };

  return appuntamento.tipo_servizio === "Nuova installazione" ? <SchedaInstallazioneDomande {...props} /> : <SchedaLavorazioneDomande {...props} />;
}
