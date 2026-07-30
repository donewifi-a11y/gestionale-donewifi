-- Permessi granulari & multi-reparto: "area_accesso" faceva due lavori (livello
-- Tutto/Admin + reparto singolo). "Tutto" e "Admin" si comportavano già in modo
-- identico ovunque nel codice: qui si uniscono in un solo booleano
-- "amministratore", e il reparto singolo diventa una lista ("reparti").

alter table persone add column amministratore boolean not null default false;
alter table persone add column reparti area_accesso[] not null default '{}';

update persone
  set amministratore = (area_accesso in ('Tutto', 'Admin')),
      reparti = case when area_accesso in ('Analisi Rete', 'Commerciale', 'Fatturazione')
                     then array[area_accesso] else '{}' end;

alter table persone drop column area_accesso;
