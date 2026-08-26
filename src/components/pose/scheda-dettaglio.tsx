"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";
import { SchedaInstallazioneForm } from "@/components/schede/scheda-installazione-form";
import { SchedaLavorazioneForm } from "@/components/schede/scheda-lavorazione-form";
import { salvaSchedaLavoroEsterno, getTipologiaClientePerAppuntamentoEsterno } from "@/app/pose/actions";
import type { Appuntamento, MaterialeMagazzino } from "@/lib/types";

// ★ NUOVA (2026-08-26) — sceglie la Scheda giusta (Installazione o
// Lavorazione) in base a `tipo_servizio`, stesso identico form usato
// internamente ma "innestato" con le action di pose.donewifi.it (vedi i
// prop opzionali aggiunti a SchedaInstallazioneForm/SchedaLavorazioneForm).
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
    salvaSchedaLavoro: salvaSchedaLavoroEsterno,
    getTipologiaClientePerAppuntamento: getTipologiaClientePerAppuntamentoEsterno,
  };

  return appuntamento.tipo_servizio === "Nuova installazione" ? <SchedaInstallazioneForm {...props} /> : <SchedaLavorazioneForm {...props} />;
}
