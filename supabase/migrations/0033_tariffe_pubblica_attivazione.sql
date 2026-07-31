-- Due esigenze distinte da "attivo" (sottoscrivibile o no):
-- 1) `pubblica` — una tariffa può essere attiva/sottoscrivibile ma non
--    comparire nella documentazione inviata al cliente (form pubblico
--    "Richiesta Dati"): es. piani venduti solo su trattativa diretta.
--    Di default pubblica = attivo era finora, quindi default true.
-- 2) `prezzo_attivazione` — costo una tantum di attivazione, separato dal
--    canone mensile ricorrente.

alter table tariffe add column if not exists pubblica boolean not null default true;
alter table tariffe add column if not exists prezzo_attivazione numeric;
