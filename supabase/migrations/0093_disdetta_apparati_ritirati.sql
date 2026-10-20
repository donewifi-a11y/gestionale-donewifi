-- non cancellare questa riga di commento

-- ============================================================
-- NUOVA — richiesta esplicita: "fatturazione deve vedere sempre il ticket
-- fino alla fine e riceve una notifica quando apparati ritirati e che può
-- chiudere la pratica". Un solo campo: quando gli apparati sono stati
-- davvero recuperati (ritiro in loco o consegna in ufficio) su un Ticket di
-- Disdetta. Lo scrive in automatico il salvataggio di una Scheda con
-- "Recupero Apparati", oppure il pulsante "Apparati ritirati" di Analisi
-- Rete; in entrambi i casi Fatturazione viene avvisata e può chiudere.
-- ============================================================

alter table tickets add column if not exists disdetta_apparati_ritirati_il timestamptz;

comment on column tickets.disdetta_apparati_ritirati_il is
  'Quando gli apparati sono stati recuperati su un Ticket di Disdetta. Scatta la notifica a Fatturazione, che può chiudere la pratica.';

notify pgrst, 'reload schema';
