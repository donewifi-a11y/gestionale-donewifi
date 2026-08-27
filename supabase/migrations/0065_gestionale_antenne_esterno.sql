-- ★ NUOVA (2026-08-27, richiesta esplicita: "il rapporto di lavoro deve
-- andare, una volta completato, sul gestionale principale nella scheda
-- del cliente in modo che poi venga inserito dall'operatore nel
-- gestionale esterno delle antenne") — il gestionale esterno delle
-- antenne è un sistema separato, senza integrazione: qui serve solo
-- tracciare SE e QUANDO un operatore ha già trascritto una scheda là,
-- così nessuna installazione/sostituzione antenna va persa e nessuna
-- viene trascritta due volte. Vedi lib/notifiche-antenne.ts per l'avviso
-- automatico in Chat interna alla chiusura, e la vista "Da trasferire"
-- nella pagina Materiali per la coda di riserva.
alter table schede_lavoro
  add column if not exists inserita_gestionale_antenne_il timestamptz null,
  add column if not exists inserita_gestionale_antenne_da uuid null references persone(id) on delete set null;
