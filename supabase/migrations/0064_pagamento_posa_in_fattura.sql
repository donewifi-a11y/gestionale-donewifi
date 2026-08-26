-- ★ FIX (2026-08-26, richiesta esplicita — revisione contenuti Scheda
-- Installazione via artifact) — "Non riscosso" era ambiguo ("non pagato
-- affatto?" o "pagato ma non in contanti/POS?"): rinominato in
-- "In Fattura", più preciso (il cliente paga tramite fattura invece che
-- sul posto). Stesso campo, stesso significato — solo l'etichetta cambia
-- ovunque (gestionale interno e pose.donewifi.it, Scheda Installazione e
-- Lavorazione: stessa colonna `metodo_pagamento_posa`, non ha senso un
-- valore diverso a seconda di dove si compila la scheda).
update schede_lavoro set metodo_pagamento_posa = 'In Fattura' where metodo_pagamento_posa = 'Non riscosso';

alter table schede_lavoro drop constraint if exists schede_lavoro_metodo_pagamento_posa_check;
alter table schede_lavoro add constraint schede_lavoro_metodo_pagamento_posa_check
  check (metodo_pagamento_posa in ('Contanti', 'POS', 'In Fattura'));
