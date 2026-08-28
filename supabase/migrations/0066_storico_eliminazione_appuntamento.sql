-- ★ NUOVA (2026-08-28, richiesta esplicita: "dammi la possibilità come
-- amministratore di eliminare i lavori" — chiarito con l'utente: gli
-- appuntamenti sul Calendario) — eliminaAppuntamento() (calendario/actions.ts)
-- registra la cancellazione in storico, ma "appuntamento" non era tra i
-- valori ammessi da storico_origine_check (fermo a 'ticket', 'segnalazione',
-- 'preventivo', 'richiesta_cliente' dalla migrazione 0052).
alter table storico drop constraint if exists storico_origine_check;
alter table storico add constraint storico_origine_check check (
  origine in ('ticket', 'segnalazione', 'preventivo', 'richiesta_cliente', 'appuntamento')
);
