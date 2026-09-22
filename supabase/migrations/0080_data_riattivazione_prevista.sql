-- non cancellare questa riga di commento

-- ============================================================
-- NUOVA — richiesta esplicita: "avrei bisogno di avere un elenco dei
-- clienti in insoluto o da rallentare da poter consultare, con
-- indicazione da parte del reparto fatturazione di quando riattivarlo
-- perché ha pagato".
--
-- I due flag manuali (fattura_insoluta_manuale/rallentato, migrazione
-- 0076) già dicono CHE un cliente è insoluto/da rallentare; qui aggiunge
-- QUANDO Fatturazione prevede di poterlo riattivare (es. "ha promesso di
-- pagare entro il 30, riattivare da lì") — solo un campo informativo,
-- niente automatismi: nessuna integrazione con router/RADIUS esiste in
-- questo gestionale (stessa scelta esplicita già fatta per "rallentato"),
-- resta sempre chi guarda il gestionale a fare l'azione vera altrove.
-- Un solo campo condiviso (non uno per flag): un cliente insoluto E
-- rallentato insieme ha comunque una sola data prevista di rientro.
-- ============================================================
alter table clienti_esterni add column if not exists data_riattivazione_prevista date;

notify pgrst, 'reload schema';
