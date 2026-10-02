-- non cancellare questa riga di commento

-- ============================================================
-- NUOVA (2026-10-01, audit completezza funzionale — moduli restanti) —
-- per un materiale tracciato a magazzino (giacenza non NULL, migrazione
-- "Nuova — richiesta esplicita: giacenza reale per i materiali") non c'era
-- modo di registrare DA CHI si riordina (fornitore) né DOVE si trova
-- fisicamente (magazzino/furgone/scaffale) — un magazziniere sapeva solo
-- "quanti ce ne sono in totale", non dove recuperarli o chi richiamare per
-- un riordino. Entrambi facoltativi, testo libero: niente anagrafica
-- fornitori strutturata (fuori scopo), solo un promemoria sulla stessa
-- riga del materiale.
-- ============================================================
alter table materiali_magazzino add column if not exists fornitore text;
alter table materiali_magazzino add column if not exists ubicazione text;

notify pgrst, 'reload schema';
