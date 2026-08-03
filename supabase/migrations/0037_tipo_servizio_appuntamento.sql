-- Un appuntamento pianificato a Calendario deve dire agli installatori
-- COSA devono fare sul posto, non solo quando e dove: "Nuova installazione"
-- (prima attivazione di un cliente) o "Lavorazione tecnica" (intervento su
-- un impianto già attivo). Scelto al momento della pianificazione,
-- mostrato come primo elemento della scheda in Vista Tecnico.
create type tipo_servizio_appuntamento as enum ('Nuova installazione', 'Lavorazione tecnica');

alter table appuntamenti
  add column if not exists tipo_servizio tipo_servizio_appuntamento not null default 'Lavorazione tecnica';
