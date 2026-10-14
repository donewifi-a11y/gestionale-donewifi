-- non cancellare questa riga di commento

-- ============================================================
-- NUOVA — richiesta esplicita: "dobbiamo mettere che per le nuove
-- installazioni e interventi in loco sia possibile inserire, facoltativo,
-- dove si trova l'antenna, se su tetto o su balcone, la casa di quanti
-- piani è e se da un balcone è a vista un nostro ripetitore". Chiarito
-- subito dopo: li inserisce l'OPERATORE quando pianifica l'intervento
-- (pannello "Pianifica appuntamento" nel Ticket, form Nuovo/Modifica
-- appuntamento nel Calendario), non il tecnico da pose — per questo i 3
-- campi stanno sull'Appuntamento, non sulla Scheda di Lavoro (quella resta
-- compilata dal tecnico a lavoro finito, vedi migrazione 0001).
--
-- Tutti e tre facoltativi (nessun default diverso da null, nessun vincolo
-- NOT NULL) — niente obbliga a compilarli per fissare un appuntamento.
-- ============================================================

alter table appuntamenti
  add column posizione_antenna text,
  add column piani_edificio smallint,
  add column ripetitore_visibile_balcone boolean;

alter table appuntamenti
  add constraint appuntamenti_posizione_antenna_valida
    check (posizione_antenna is null or posizione_antenna in ('Tetto', 'Balcone'));

notify pgrst, 'reload schema';
