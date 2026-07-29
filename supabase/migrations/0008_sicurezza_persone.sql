-- ============================================================
-- Fix di sicurezza — chiusura di scritture dirette e di un possibile
-- doppione, trovati con una revisione dedicata del gestionale.
-- ============================================================

-- ★ FIX — le policy precedenti su "persone" permettevano a QUALSIASI
-- account condiviso attivo di scrivere/modificare qualunque riga (quindi
-- anche assegnarsi da soli area_accesso = 'Tutto'), perché controllavano
-- solo is_active_staff() e non "la persona corrente è admin" — cosa che
-- il database non può sapere (vive in un cookie, non nella sessione
-- Postgres). Da qui in poi le scritture passano SOLO dalle Server Action
-- (che usano la service role e verificano il livello della persona
-- corrente in codice), esattamente come già succede per "staff": nessuna
-- policy INSERT/UPDATE per il ruolo "authenticated" = nessuna scrittura
-- diretta possibile via API REST, nemmeno con la chiave anon + una
-- sessione valida.
drop policy if exists "staff attivo scrive persone" on persone;
drop policy if exists "staff attivo aggiorna persone" on persone;

-- ★ FIX — evita due Ticket dalla stessa Segnalazione se "Trasmetti" viene
-- inviato due volte molto ravvicinate (rete lenta, doppio tap). I NULL
-- restano permessi (i Ticket creati direttamente da Nuovo Ticket non
-- hanno una Segnalazione d'origine).
alter table tickets add constraint tickets_segnalazione_id_unique unique (segnalazione_id);
