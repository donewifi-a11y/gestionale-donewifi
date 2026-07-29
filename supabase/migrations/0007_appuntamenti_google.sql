-- ============================================================
-- Collega ogni Appuntamento all'evento corrispondente sul calendario
-- Google condiviso, per poterlo aggiornare/annullare in seguito.
-- ============================================================
alter table appuntamenti add column if not exists google_event_id text;
