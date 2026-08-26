-- ★ FIX (2026-08-26, richiesta esplicita — revisione contenuti Scheda
-- Installazione via artifact) — "Non riscosso" era ambiguo ("non pagato
-- affatto?" o "pagato ma non in contanti/POS?"): rinominato in
-- "In Fattura", più preciso (il cliente paga tramite fattura invece che
-- sul posto). Stesso campo, stesso significato — solo l'etichetta cambia
-- ovunque (gestionale interno e pose.donewifi.it, Scheda Installazione e
-- Lavorazione: stessa colonna `metodo_pagamento_posa`, non ha senso un
-- valore diverso a seconda di dove si compila la scheda).
-- ★ FIX (trovato in verifica dopo il primo tentativo) — l'UPDATE va fatto
-- DOPO aver allentato il vincolo, non prima: il vecchio vincolo ammette
-- solo ('Contanti', 'POS', 'Non riscosso'), quindi scrivere 'In Fattura'
-- mentre è ancora attivo lo viola (l'intera migrazione falliva qui,
-- rollback automatico — nessuna riga era stata davvero toccata).
alter table schede_lavoro drop constraint if exists schede_lavoro_metodo_pagamento_posa_check;
alter table schede_lavoro add constraint schede_lavoro_metodo_pagamento_posa_check
  check (metodo_pagamento_posa in ('Contanti', 'POS', 'Non riscosso', 'In Fattura'));

update schede_lavoro set metodo_pagamento_posa = 'In Fattura' where metodo_pagamento_posa = 'Non riscosso';

-- ora che nessuna riga usa più 'Non riscosso', si può restringere il
-- vincolo definitivo alle sole 3 opzioni attuali.
alter table schede_lavoro drop constraint if exists schede_lavoro_metodo_pagamento_posa_check;
alter table schede_lavoro add constraint schede_lavoro_metodo_pagamento_posa_check
  check (metodo_pagamento_posa in ('Contanti', 'POS', 'In Fattura'));
