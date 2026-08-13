-- ★ NUOVA — richiesta esplicita: il passo "Materiali" della Scheda di
-- Installazione/Lavorazione era un unico elenco che mescolava apparati
-- installati gratuitamente (CPE, alimentatore...) con prodotti e servizi
-- a pagamento, più un "Importo fatturato" scritto a mano e scollegato
-- dal totale calcolato dall'elenco. Proposta con artifact interattivo,
-- approvata con una correzione esplicita: la distinzione Comodato/
-- Prodotto/Servizio si definisce **una volta per tutte nel catalogo
-- Materiali**, non riga per riga nella Scheda.

-- ── CLASSIFICAZIONE PER RIGA DI CATALOGO ────────────────────────────────
-- `tipo_riga` sostituisce, come unico campo che l'amministratore edita,
-- la vecchia checkbox `comodato_uso`: quest'ultima resta in tabella (già
-- usata da FirmaClienteScheda/SelettoreMateriali/schede storiche per
-- "prezzo forzato a zero") ma da ora viene sempre derivata da tipo_riga
-- lato server (creaMateriale/aggiornaMateriale), mai scritta a mano —
-- così le due non possono più disallinearsi.
alter table materiali_magazzino add column if not exists tipo_riga text not null default 'Prodotto'
  check (tipo_riga in ('Comodato', 'Prodotto', 'Servizio'));
update materiali_magazzino set tipo_riga = 'Comodato' where comodato_uso = true and tipo_riga <> 'Comodato';

comment on column materiali_magazzino.tipo_riga is
  'Classificazione usata per raggruppare il passo "Materiali" della Scheda di lavoro: Comodato (installato, non fatturato) / Prodotto / Servizio. comodato_uso è sempre derivato da questo campo, mai scritto a mano.';

-- ── RIGA DI ATTIVAZIONE PREDEFINITA ──────────────────────────────────────
-- Al più una riga di catalogo per tipo cliente può essere marcata come
-- "quella che si aggiunge da sola" nella Scheda (oggi tipicamente
-- ATTIVAZIONI/Privati e ATTIVAZIONI/Business) — il suo prezzo è già il
-- valore finale per quel tipo cliente, va usato così com'è, MAI passato
-- per prezzoPerTipoCliente() (che raddoppierebbe l'IVA se applicato a un
-- prezzo Business già finale — bug reale trovato durante l'analisi).
alter table materiali_magazzino add column if not exists attivazione_predefinita text
  check (attivazione_predefinita in ('Privato', 'Business'));

comment on column materiali_magazzino.attivazione_predefinita is
  'Se valorizzato, questa riga si aggiunge da sola nella Scheda per il tipo cliente indicato, con il prezzo_unitario preso così com''è (mai ricalcolato con la formula IVA Privato/Business).';

-- ── METODO DI PAGAMENTO DELLA POSA ───────────────────────────────────────
alter table schede_lavoro add column if not exists metodo_pagamento_posa text
  check (metodo_pagamento_posa in ('Contanti', 'POS', 'Non riscosso'));

-- ── SISTEMAZIONE DEL CATALOGO REALE (decisione 1 dell'artifact) ─────────
-- Le CPE installate (non le sostituzioni a pagamento per guasto/upgrade,
-- quelle restano un servizio a pagamento) diventano comodato d'uso:
-- oggi erano tutte a pagamento, la distinzione richiesta non esisteva nei
-- dati. `tipo_riga='Prodotto'` è già il default per tutto il resto (Router/
-- Extender/Powerline/Switch/AP, materiali di posa) — nessun update
-- necessario per quelle categorie.
update materiali_magazzino
  set tipo_riga = 'Comodato', comodato_uso = true, prezzo_unitario = 0
  where categoria = 'CPE' and nome <> 'Sostituzione antenna';

-- ATTIVAZIONI: Privati/Business diventano l'attivazione predefinita per il
-- rispettivo tipo cliente (si aggiunge da sola nella Scheda); tutta la
-- categoria passa a Servizio (Buy&Go/Subentro restano scelte manuali).
update materiali_magazzino set tipo_riga = 'Servizio' where categoria = 'ATTIVAZIONI';
update materiali_magazzino set attivazione_predefinita = 'Privato' where categoria = 'ATTIVAZIONI' and nome = 'Privati';
update materiali_magazzino set attivazione_predefinita = 'Business' where categoria = 'ATTIVAZIONI' and nome = 'Business';

update materiali_magazzino set tipo_riga = 'Servizio'
  where categoria in ('WLINK/WORK', 'TRASFERIMENTI', 'INTERVENTO TECNICO', 'VARIAZIONI');

-- Nuove voci in comodato d'uso citate esplicitamente nella richiesta,
-- non ancora presenti nel catalogo.
insert into materiali_magazzino (nome, categoria, prezzo_unitario, unita_misura, tipo_riga, comodato_uso, mostra_in_schede_lavoro)
select 'Alimentatore', 'CPE', 0, 'pz', 'Comodato', true, true
where not exists (select 1 from materiali_magazzino where nome = 'Alimentatore' and categoria = 'CPE');

insert into materiali_magazzino (nome, categoria, prezzo_unitario, unita_misura, tipo_riga, comodato_uso, mostra_in_schede_lavoro)
select 'Griglia piccola', 'CPE', 0, 'pz', 'Comodato', true, true
where not exists (select 1 from materiali_magazzino where nome = 'Griglia piccola' and categoria = 'CPE');

insert into materiali_magazzino (nome, categoria, prezzo_unitario, unita_misura, tipo_riga, comodato_uso, mostra_in_schede_lavoro)
select 'Griglia grande', 'CPE', 0, 'pz', 'Comodato', true, true
where not exists (select 1 from materiali_magazzino where nome = 'Griglia grande' and categoria = 'CPE');
