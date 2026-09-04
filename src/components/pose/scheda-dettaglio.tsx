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
  // ★ ESTESO (2026-09-04, artifact "Proposte UX 2026", proposta ④, primo
  // passo concordato: offline-first per la Scheda) — "offline" è un terzo
  // stato distinto da "ok": la Scheda non è ancora davvero registrata, è
  // solo salvata sul telefono in attesa di rete — dirlo in modo diverso,
  // non lo stesso "intervento completato" di un invio riuscito per
  // davvero, altrimenti il tecnico crede (a torto) che sia già finita.
  const [salvato, setSalvato] = useState<"no" | "ok" | "offline">("no");

  // ★ FIX (2026-08-26, "controllo d'oro") — prima usava i token rossi
  // text-success/text-primary del gestionale interno, incoerenti con
  // l'identità "Segnale" (blu/verde, Sora) del resto di questo flusso.
  if (salvato === "ok") {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center"
        style={{ borderColor: "#1FC77A", background: "#EAFBF3" }}
      >
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full text-white"
          style={{ background: "linear-gradient(135deg, #1FC77A, #2D6CFF)" }}
        >
          <Check className="h-7 w-7" strokeWidth={3} />
        </div>
        <p className="text-base font-extrabold [font-family:var(--font-pose-display)]" style={{ color: "#0F7A4D" }}>
          Scheda salvata, intervento completato.
        </p>
        <button
          type="button"
          onClick={() => router.push("/pose")}
          className="text-sm font-bold hover:underline"
          style={{ color: "#2D6CFF" }}
        >
          Torna ai tuoi interventi
        </button>
      </div>
    );
  }

  if (salvato === "offline") {
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center"
        style={{ borderColor: "#F2A0AC", background: "#3A1416" }}
      >
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full text-white"
          style={{ background: "linear-gradient(135deg, #F2A0AC, #2D6CFF)" }}
        >
          <Check className="h-7 w-7" strokeWidth={3} />
        </div>
        <p className="text-base font-extrabold [font-family:var(--font-pose-display)]" style={{ color: "#F2A0AC" }}>
          Nessuna rete — salvato sul telefono.
        </p>
        <p className="text-xs font-semibold" style={{ color: "#F2A0AC" }}>
          Si invierà da solo appena torna il segnale — non serve rifare nulla.
        </p>
        <button
          type="button"
          onClick={() => router.push("/pose")}
          className="text-sm font-bold hover:underline"
          style={{ color: "#2D6CFF" }}
        >
          Torna ai tuoi interventi
        </button>
      </div>
    );
  }

  const props = {
    appuntamentoId: appuntamento.id,
    catalogoMateriali,
    onSalvato: (offline?: boolean) => setSalvato(offline ? "offline" : "ok"),
    onAnnulla: () => router.push("/pose"),
  };

  return appuntamento.tipo_servizio === "Nuova installazione" ? <SchedaInstallazioneDomande {...props} /> : <SchedaLavorazioneDomande {...props} />;
}
