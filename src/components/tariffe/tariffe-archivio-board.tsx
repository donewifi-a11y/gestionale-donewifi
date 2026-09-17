"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { StatoVuoto } from "@/components/ui/stato-vuoto";
import { useToast } from "@/components/ui/toast";
import { impostaSottoscrivibileTariffa, impostaPubblicaTariffa, duplicaTariffa } from "@/app/(app)/tariffe/actions";
import { RigaTariffa, FormTariffa } from "@/components/tariffe/tariffe-board";
import type { Tariffa } from "@/lib/types";

export function TariffeArchivioBoard({ tariffe, isAdmin }: { tariffe: Tariffa[]; isAdmin: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [modifica, setModifica] = useState<Tariffa | null>(null);

  // ★ FIX (2026-09-14, controllo "a prova di scemo" punto per punto) — stesso
  // bug già corretto in tariffe-board.tsx il 2026-08-31 ("le 3 funzioni sotto
  // non davano MAI un riscontro"), mai riportato qui nella variante Archivio:
  // un fallimento passava del tutto inosservato (nessun toast, nessun refresh).
  async function toggleSottoscrivibile(t: Tariffa) {
    const risultato = await impostaSottoscrivibileTariffa(t.id, !t.attivo);
    if (risultato.errore) {
      toast(risultato.errore);
      return;
    }
    toast(t.attivo ? "Tariffa resa non sottoscrivibile." : "Tariffa resa sottoscrivibile.", "successo");
    router.refresh();
  }

  async function togglePubblica(t: Tariffa) {
    const risultato = await impostaPubblicaTariffa(t.id, !t.pubblica);
    if (risultato.errore) {
      toast(risultato.errore);
      return;
    }
    toast(t.pubblica ? "Tariffa resa non pubblica." : "Tariffa resa pubblica.", "successo");
    router.refresh();
  }

  async function duplica(t: Tariffa) {
    const risultato = await duplicaTariffa(t.id);
    if (risultato.errore) {
      toast(risultato.errore);
      return;
    }
    toast("Tariffa duplicata.", "successo");
    router.refresh();
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

      {/* ★ REDESIGN (2026-09-17, richiesta esplicita: Drawer laterale
      invece del Dialog centrale per i popup di dettaglio) — da Dialog a
      Drawer. */}
      <Drawer open={!!modifica} onOpenChange={(v) => !v && setModifica(null)}>
        <DrawerContent>
          {modifica && <FormTariffa tariffa={modifica} isAdmin={isAdmin} onFatto={() => setModifica(null)} />}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
