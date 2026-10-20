-- non cancellare questa riga di commento

-- ============================================================
-- NUOVA — richiesta esplicita: Fatturazione apre il Ticket di disdetta
-- quando arriva una raccomandata o una PEC (data di ricezione e modalità
-- di invio restano in `dettagli_extra`, nessun campo nuovo), indica quando
-- cessa la fatturazione (colonna già esistente `data_dismissione_disdetta`,
-- migrazione 0074 — da qui in poi significa "cessazione fatturazione e
-- data dalla quale si possono recuperare gli apparati"), fissa le modalità
-- di recupero apparati e il relativo costo, e segna quando il ritiro è
-- stato pagato.
--
-- Tre colonne, tutte NULL finché Fatturazione non decide:
--   disdetta_modalita_ritiro : "Ritiro in loco" oppure "Consegna in ufficio"
--   disdetta_costo_recupero  : 95, 61 (ritiro in loco, a seconda della
--                              durata del contratto) oppure 0 (consegna in
--                              ufficio, gratuita)
--   disdetta_ritiro_pagato_il: quando Fatturazione ha incassato il costo
--                              del ritiro in loco (pulsante "Pagato ritiro")
-- ============================================================

alter table tickets
  add column if not exists disdetta_modalita_ritiro text,
  add column if not exists disdetta_costo_recupero numeric(8,2),
  add column if not exists disdetta_ritiro_pagato_il timestamptz;

alter table tickets
  add constraint tickets_disdetta_modalita_ritiro_valida
    check (disdetta_modalita_ritiro is null or disdetta_modalita_ritiro in ('Ritiro in loco', 'Consegna in ufficio'));

comment on column tickets.disdetta_modalita_ritiro is
  'Modalità di recupero apparati scelta da Fatturazione su un Ticket di Disdetta: "Ritiro in loco" o "Consegna in ufficio".';
comment on column tickets.disdetta_costo_recupero is
  'Costo del recupero apparati su un Ticket di Disdetta: 95 o 61 per il ritiro in loco, 0 per la consegna in ufficio.';
comment on column tickets.disdetta_ritiro_pagato_il is
  'Quando Fatturazione ha segnato incassato il costo del ritiro in loco. Il Ticket passa ad Analisi Rete solo dopo.';

notify pgrst, 'reload schema';
