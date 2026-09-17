-- non cancellare questa riga di commento

-- ============================================================
-- NUOVA — "controllo d'oro" completo del gestionale, priorità 1: il cron
-- promemoria-approvazione-contratto guardava solo `segnalazioni`, non
-- `richieste_clienti` — un contratto di Subentro o Trasferimento inviato
-- per approvazione poteva restare "in attesa" per sempre senza che
-- nessuno se ne accorgesse, stesso rischio che il cron esiste apposta per
-- evitare sulle Segnalazioni. Stessa colonna, stessa tabella, stesso
-- principio (migrazione 0046).
-- ============================================================
alter table richieste_clienti add column if not exists ultimo_promemoria_approvazione_il timestamptz;

notify pgrst, 'reload schema';
