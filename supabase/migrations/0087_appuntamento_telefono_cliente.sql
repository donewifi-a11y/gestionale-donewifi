-- non cancellare questa riga di commento

-- ============================================================
-- NUOVA (2026-10-02, audit completezza funzionale — moduli restanti) —
-- un Appuntamento senza Ticket collegato (campo "Ticket collegato
-- (facoltativo)" in creazione — tipicamente una Nuova installazione
-- pianificata prima che esista un Ticket) non ha ALCUN modo di risalire a
-- un numero da chiamare: Vista Tecnico e il portale tecnici esterni
-- mostrano il telefono cliente leggendolo da `tickets.telefono` tramite
-- `ticket_id`, che qui è NULL. Un tecnico che deve avvisare "sto
-- arrivando" o non trova il citofono resta senza nulla da chiamare.
-- Facoltativo e usato solo come fallback: quando c'è un ticket_id, il
-- telefono del Ticket resta la fonte (più affidabile, sempre aggiornato).
-- ============================================================
alter table appuntamenti add column if not exists telefono_cliente text;

notify pgrst, 'reload schema';
