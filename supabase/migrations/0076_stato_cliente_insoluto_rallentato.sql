-- non cancellare questa riga di commento

-- ============================================================
-- NUOVA — richiesta esplicita: "metterei all'interno della scheda cliente
-- la possibilità di far inserire se una fattura è insoluta e far indicare
-- se un cliente va rallentato e mettere status rallentato".
--
-- Due flag manuali su clienti_esterni, indipendenti dai dati sincronizzati
-- da Aruba (vedi sincronizzaFattureAruba/insoluti in questo stesso file):
-- coprono i casi che l'automatismo non intercetta (fatture appena emesse,
-- clienti Buy&Go, ecc.) e un giudizio interno ("va rallentato") che Aruba
-- non ha modo di sapere. Solo stato/tracciamento — nessuna azione
-- automatica sull'apparato: è chi guarda il gestionale a decidere cosa
-- farne.
-- ============================================================
alter table clienti_esterni add column if not exists fattura_insoluta_manuale boolean not null default false;
alter table clienti_esterni add column if not exists fattura_insoluta_dal date;
alter table clienti_esterni add column if not exists fattura_insoluta_nota text;

alter table clienti_esterni add column if not exists rallentato boolean not null default false;
alter table clienti_esterni add column if not exists rallentato_dal date;
alter table clienti_esterni add column if not exists rallentato_motivo text;

notify pgrst, 'reload schema';
