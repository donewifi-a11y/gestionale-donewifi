"use client";

import { useState } from "react";
import { ConfiguratorePiano, type SceltaPiano } from "@/components/richiesta-dati/configuratore-piano";
import { RichiestaDatiForm } from "@/components/richiesta-dati/richiesta-dati-form";
import type { Tariffa, MaterialeMagazzino } from "@/lib/types";

/** ★ NUOVO — due passi invece di un form unico: "Scegli il tuo piano"
 * (profilo/router/extender con riepilogo costi) seguito dalla Richiesta
 * Dati vera e propria (anagrafica/pagamento/documenti), come richiesto
 * esplicitamente invece del form piatto precedente. */
export function RichiestaDatiFlow({
  segnalazioneId,
  giaInviato,
  tariffe,
  router,
  extender,
}: {
  segnalazioneId: string;
  giaInviato: boolean;
  tariffe: Tariffa[];
  router: MaterialeMagazzino[];
  extender: MaterialeMagazzino | null;
}) {
  const [sceltaPiano, setSceltaPiano] = useState<SceltaPiano | null>(null);

  if (!sceltaPiano) {
    return <ConfiguratorePiano tariffe={tariffe} router={router} extender={extender} onConferma={setSceltaPiano} />;
  }

  return (
    <RichiestaDatiForm
      segnalazioneId={segnalazioneId}
      giaInviato={giaInviato}
      tariffe={tariffe}
      sceltaPiano={sceltaPiano}
      onCambiaPiano={() => setSceltaPiano(null)}
    />
  );
}
