-- Posizione GPS precisa dell'installazione (rilevata dal telefono
-- dell'installatore al momento della compilazione della Scheda
-- Installazione) — utile per interventi futuri sullo stesso impianto o
-- per pianificare zone di copertura, cosa che il campo testo libero
-- "posizione" (es. "Balcone, tetto") non permette.
alter table schede_lavoro add column if not exists gps_lat numeric;
alter table schede_lavoro add column if not exists gps_lng numeric;
