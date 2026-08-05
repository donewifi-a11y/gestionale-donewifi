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
  indirizzo,
}: {
  segnalazioneId: string;
  giaInviato: boolean;
  tariffe: Tariffa[];
  router: MaterialeMagazzino[];
  extender: MaterialeMagazzino | null;
  indirizzo?: { via: string; civico: string; comune: string; cap: string };
}) {
  const [sceltaPiano, setSceltaPiano] = useState<SceltaPiano | null>(null);

  // ★ FIX — prima i due passi erano rami di un `if` che smontava/rimontava
  // interamente il form: tornare indietro con "Cambia" per correggere il
  // piano svuotava CF/telefono/IBAN/ecc. già scritti dal cliente. Qui
  // RichiestaDatiForm resta sempre montato (solo nascosto via CSS finché
  // non si conferma un piano), così i suoi input non controllati
  // mantengono il valore digitato indipendentemente da quante volte si va
  // avanti e indietro tra i due passi.
  return (
    <>
      <div className={sceltaPiano ? "hidden" : ""}>
        <ConfiguratorePiano tariffe={tariffe} router={router} extender={extender} onConferma={setSceltaPiano} />
      </div>
      <div className={sceltaPiano ? "" : "hidden"}>
        <RichiestaDatiForm
          segnalazioneId={segnalazioneId}
          giaInviato={giaInviato}
          tariffe={tariffe}
          sceltaPiano={sceltaPiano}
          onCambiaPiano={() => setSceltaPiano(null)}
          indirizzo={indirizzo}
        />
      </div>
    </>
  );
}
