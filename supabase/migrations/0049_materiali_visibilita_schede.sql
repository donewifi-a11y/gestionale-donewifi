-- ★ NUOVA — richiesta esplicita: oggi ogni materiale "attivo" compare nel
-- selettore della Scheda di Installazione/Lavorazione Tecnica — comodo per
-- il listino Preventivi (dove serve il catalogo intero), scomodo per il
-- tecnico sul campo che deve scorrere anche voci di puro servizio (es.
-- "Trasferimento stesso comune") mai usate in una scheda. Un secondo
-- interruttore, indipendente da "attivo": quest'ultimo resta il permesso
-- generale "esiste nel listino", il nuovo decide solo se compare nel
-- selettore materiali delle Schede di lavoro.
-- Default true per non far sparire nulla al primo deploy: chi vuole
-- restringere l'elenco lo fa dalla nuova schermata "In Scheda di lavoro"
-- in Materiali, un materiale alla volta.
alter table materiali_magazzino
  add column if not exists mostra_in_schede_lavoro boolean not null default true;
