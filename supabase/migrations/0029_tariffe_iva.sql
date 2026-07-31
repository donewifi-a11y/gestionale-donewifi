-- Il prezzo mensile di una Tariffa può essere inserito IVA inclusa o
-- IVA esclusa (22%, l'aliquota unica valida per questi servizi) — serve
-- saperlo per riga, non è uguale per tutte le 164 tariffe importate da
-- Aruba. Default IVA inclusa (il prezzo "di vetrina" più comune), ma
-- modificabile per ciascuna dall'interfaccia Tariffe.

alter table tariffe add column if not exists iva_inclusa boolean not null default true;
