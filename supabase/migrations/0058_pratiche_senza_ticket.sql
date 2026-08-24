-- ============================================================
-- Pratiche cliente senza Ticket (2026-08, proposta con artifact —
-- Trasferimento/Cambio IBAN/Cambio Anagrafica non passano più
-- necessariamente da un Ticket): richieste_clienti si collega ora anche
-- direttamente a un Cliente Esterno (anagrafica Aruba reale), non più solo
-- a un Ticket/Segnalazione facoltativi — così la pratica compare "nella
-- scheda" del cliente giusto con la data, indipendentemente da chi l'ha
-- avviata (il cliente stesso dal Portale, o l'operatore dalla scheda).
-- ============================================================

alter table richieste_clienti add column if not exists cliente_esterno_id integer references clienti_esterni(id) on delete set null;
create index if not exists richieste_clienti_cliente_esterno_id_idx on richieste_clienti (cliente_esterno_id);
