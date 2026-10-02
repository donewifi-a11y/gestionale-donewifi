-- non cancellare questa riga di commento

-- ============================================================
-- NUOVA (2026-10-01, audit completezza funzionale — moduli restanti) —
-- un Preventivo "Inviato" restava aperto a tempo indeterminato: il cliente
-- poteva approvarlo mesi dopo, con prezzi/condizioni nel frattempo cambiati
-- sul catalogo Tariffe/Materiali, senza che il sistema lo segnalasse in
-- alcun modo (le righe restano quelle scelte al momento della creazione,
-- "congelate" — il problema è solo l'assenza di una scadenza dichiarata).
-- Campo facoltativo: chi crea il preventivo può lasciarlo vuoto (nessuna
-- scadenza, comportamento identico a prima) o impostare una data.
-- ============================================================
alter table preventivi add column if not exists valido_fino_il date;

notify pgrst, 'reload schema';
