-- non cancellare questa riga di commento

-- ============================================================
-- NUOVA — richiesta esplicita: "devi dare la possibilità negli interventi
-- in loco di mettere il costo di intervento gratuito". "Gratuito" copre un
-- intervento svolto ma non fatturato al cliente (garanzia, errore nostro,
-- cortesia) — distinto da "In Fattura" (comunque fatturato, solo non
-- riscosso sul posto) e da "nessun materiale/servizio aggiunto" (che oggi
-- risulta già a 0€ ma senza dichiararlo esplicitamente, ambiguo tra
-- "gratuito apposta" e "il tecnico si è dimenticato di registrarlo").
-- ============================================================
alter table schede_lavoro drop constraint if exists schede_lavoro_metodo_pagamento_posa_check;
alter table schede_lavoro add constraint schede_lavoro_metodo_pagamento_posa_check
  check (metodo_pagamento_posa in ('Contanti', 'POS', 'In Fattura', 'Gratuito'));

notify pgrst, 'reload schema';
