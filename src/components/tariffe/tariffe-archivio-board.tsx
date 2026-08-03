"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent } from "@/components/ui/sheet";
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
      <div className="overflow-hidden rounded-2xl border bg-card opacity-90 shadow-sm">
        {tariffe.length === 0 && (
          <p className="p-5 text-center text-sm text-muted-foreground">Nessuna tariffa non sottoscrivibile al momento.</p>
        )}
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

      <Sheet open={!!modifica} onOpenChange={(v) => !v && setModifica(null)}>
        <SheetContent>
          {modifica && <FormTariffa tariffa={modifica} isAdmin={isAdmin} onFatto={() => setModifica(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
