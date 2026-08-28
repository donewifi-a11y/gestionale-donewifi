-- ★ NUOVA (2026-08-28, richiesta esplicita: "una volta che riceviamo la
-- documentazione il trasferimento si procede come nuova installazione,
-- però il costo è di 60€ e non il costo di privato o business") — un
-- Ticket "Trasferimento" (categoria Commerciale) apre la Scheda di
-- Installazione come un nuovo contratto, e la Scheda aggiunge da sola la
-- riga Privato/Business (30€/50€, vedi migrazione 0055) — sbagliata per un
-- trasferimento, che ha una tariffa fissa a parte. La riga giusta esiste
-- già nel catalogo (categoria TRASFERIMENTI, "Stesso comune utente
-- privato", 60€) ma finora andava aggiunta a mano: nessuno lo faceva
-- sistematicamente, il costo sbagliato restava quello Privato/Business.
--
-- Stesso meccanismo già in uso per Privato/Business (colonna
-- attivazione_predefinita, vedi migrazione 0055): esteso qui con un terzo
-- valore, chiavato sulla sottocategoria del Ticket ("Trasferimento")
-- invece che sul tipo cliente — vedi anche selettore-materiali.tsx.
alter table materiali_magazzino drop constraint if exists materiali_magazzino_attivazione_predefinita_check;
alter table materiali_magazzino add constraint materiali_magazzino_attivazione_predefinita_check
  check (attivazione_predefinita in ('Privato', 'Business', 'Trasferimento'));

comment on column materiali_magazzino.attivazione_predefinita is
  'Se valorizzato, questa riga si aggiunge da sola nella Scheda: "Privato"/"Business" per tipo cliente, "Trasferimento" per un Ticket con quella sottocategoria (indipendente dal tipo cliente). Il prezzo_unitario è preso così com''è (mai ricalcolato con la formula IVA Privato/Business).';

update materiali_magazzino
  set attivazione_predefinita = 'Trasferimento'
  where id = '26b95ad4-51c7-44fb-bafd-b5790fd619c8'; -- "Stesso comune utente privato", categoria TRASFERIMENTI, 60€
