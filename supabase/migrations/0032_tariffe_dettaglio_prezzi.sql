-- Arricchisce il catalogo Tariffe con i dati di prezzo reali forniti
-- dall'utente (listino interno, IVA esclusa): periodo di validità,
-- eventuale promo con prezzo standard di rientro, vincolo contrattuale
-- e periodicità di fatturazione. Non tocca le tariffe già presenti senza
-- corrispondenza nel listino (restano com'erano, prezzo da inserire a mano).

alter table tariffe add column if not exists promo boolean not null default false;
alter table tariffe add column if not exists prezzo_post_promo numeric;
alter table tariffe add column if not exists durata_vincolo text;
alter table tariffe add column if not exists periodicita_fatturazione text;
alter table tariffe add column if not exists valido_dal date;
alter table tariffe add column if not exists valido_al date;
