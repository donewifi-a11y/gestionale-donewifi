-- ============================================================
-- Segnalazioni — clienti "dubbiosi" (Opzione C della proposta con
-- artifact, 2026-08): un parcheggio per chi è già stato contattato ma non
-- ha ancora deciso, senza inventare un nuovo stato nel percorso lineare
-- Da Contattare → In Contatto → Gestione Cliente → Trasmessa. Un'etichetta
-- trasversale (motivo + data di richiamo), non un valore nuovo di `stato`.
-- ============================================================

alter table segnalazioni add column if not exists dubbioso_dal timestamptz;
alter table segnalazioni add column if not exists motivo_dubbio text;
alter table segnalazioni add column if not exists richiamare_il date;
