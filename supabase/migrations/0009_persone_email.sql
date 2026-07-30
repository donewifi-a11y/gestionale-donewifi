-- ============================================================
-- Persone — campo email di contatto, indipendente dal login
-- condiviso (staff.email): permette di sapere a chi scrivere/
-- chiamare per una persona reale, anche se il suo accesso al
-- gestionale passa da una Gmail condivisa diversa.
-- ============================================================
alter table persone add column if not exists email text;
