"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { StatoVuoto } from "@/components/ui/stato-vuoto";
import { impostaSottoscrivibileTariffa, impostaPubblicaTariffa, duplicaTariffa } from "@/app/(app)/tariffe/actions";
import { RigaTariffa, FormTariffa } from "@/components/tariffe/tariffe-board";
import type { Tariffa } from "@/lib/types";

export function TariffeArchivioBoard({ tariffe, isAdmin }: { tariffe: Tariffa[]; isAdmin: boolean }) {
  const router = useRouter();
  const [modifica, setModifica] = useState<Tariffa | null>(null);

  async function toggleSottoscrivibile(t: Tariffa) {
    const risultato = await impostaSottoscrivibileTariffa(t.id, !t.attivo);
    if (!risultato.errore) router.refresh();
  }

  async function togglePubblica(t: Tariffa) {
    const risultato = await impostaPubblicaTariffa(t.id, !t.pubblica);
    if (!risultato.errore) router.refresh();
  }

  async function duplica(t: Tariffa) {
    const risultato = await duplicaTariffa(t.id);
    if (!risultato.errore) router.refresh();
  }

  return (
    <div>
      {tariffe.length === 0 ? (
        <StatoVuoto icona={Archive} titolo="Nessuna tariffa non sottoscrivibile al momento." compatto />
      ) : (
        <div className="flex flex-col gap-2 opacity-90">
          {tariffe.map((t) => (
            <RigaTariffa
              key={t.id}
              t={t}
              onApri={() => setModifica(t)}
              onDuplica={() => duplica(t)}
              onToggle={() => toggleSottoscrivibile(t)}
              onTogglePubblica={() => togglePubblica(t)}
            />
          ))}
        </div>
      )}

      <Dialog open={!!modifica} onOpenChange={(v) => !v && setModifica(null)}>
        <DialogContent>
          {modifica && <FormTariffa tariffa={modifica} isAdmin={isAdmin} onFatto={() => setModifica(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
