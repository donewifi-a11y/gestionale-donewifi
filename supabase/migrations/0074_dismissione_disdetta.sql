-- ============================================================
-- NUOVA — richiesta esplicita: "problemi con i ticket di disdetta. una
-- volta aperti dal reparto di fatturazione che li ha ricevuti, la stessa
-- deve dare i tempi per la dismissione e una volta fatto deve essere
-- inoltrato al reparto analisi di rete per procedere con la
-- pianificazione del ritiro degli apparati".
--
-- Un solo campo: la data che Fatturazione fissa per la dismissione del
-- servizio su un Ticket di Disdetta (sottocategoria "Disdetta"). Passare
-- il Ticket da Fatturazione ad Analisi Rete resta il campo `reparto` già
-- esistente — qui serve solo il dato in più da portare con sé, visibile
-- ad Analisi Rete per pianificare il ritiro apparati.
-- ============================================================
alter table tickets add column if not exists data_dismissione_disdetta date;

comment on column tickets.data_dismissione_disdetta is
  'Data di dismissione del servizio, fissata da Fatturazione su un Ticket di Disdetta (sottocategoria "Disdetta") prima di passarlo ad Analisi Rete per pianificare il ritiro degli apparati. NULL finché non ancora fissata.';
