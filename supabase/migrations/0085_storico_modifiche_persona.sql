-- non cancellare questa riga di commento

-- ============================================================
-- NUOVA (2026-10-02, audit completezza funzionale — moduli restanti) —
-- aggiornaPersona() (persone/actions.ts) cambia reparti/amministratore/
-- attivo di un'altra Persona senza lasciare alcuna traccia di CHI ha fatto
-- la modifica: esiste già un log di "cosa ha fatto questa persona nei
-- Ticket" (getAttivitaPersona), ma nessuno di "chi ha modificato i
-- permessi di questa persona" — un'escalation privilegi silenziosa (o una
-- disattivazione) non lascerebbe traccia. Stesso meccanismo di storico già
-- in uso ovunque nel gestionale, solo esteso con un nuovo valore ammesso.
-- ============================================================
alter table storico drop constraint if exists storico_origine_check;
alter table storico add constraint storico_origine_check check (
  origine in ('ticket', 'segnalazione', 'preventivo', 'richiesta_cliente', 'appuntamento', 'persona')
);
