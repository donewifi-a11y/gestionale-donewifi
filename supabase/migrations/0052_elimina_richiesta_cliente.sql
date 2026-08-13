-- ★ NUOVA — richiesta esplicita: un amministratore deve poter eliminare
-- una Richiesta Cliente (dati/documenti inviati dal cliente per Cambio
-- IBAN/Anagrafica/Trasferimento/Subentro/Richiesta Dati) — vedi
-- eliminaRichiestaCliente() in richieste-clienti/actions.ts. La voce di
-- storico che traccia l'eliminazione usa origine='richiesta_cliente',
-- non ancora ammessa dal check constraint (fermo a 'ticket'/'segnalazione'/
-- 'preventivo' dalla migrazione 0047).
alter table storico drop constraint if exists storico_origine_check;
alter table storico add constraint storico_origine_check check (
  origine in ('ticket', 'segnalazione', 'preventivo', 'richiesta_cliente')
);
