-- Totali generali (fatturato storico, clienti, insoluti) calcolati
-- direttamente in Postgres invece che scaricando 57mila+ fatture via rete
-- per sommarle lato Next.js — molto più veloce e senza rischio di
-- ricadere nel limite delle 1000 righe per risposta. Nessun security
-- definer: gira con i permessi di chi chiama, filtrata dalle stesse
-- policy RLS già in vigore su clienti_esterni/fatture_esterne
-- (is_active_staff()).

create or replace function statistiche_generali_aruba()
returns table (
  fatturato_totale numeric,
  numero_fatture integer,
  numero_fatture_insolute integer,
  totale_insoluto numeric,
  clienti_totali integer,
  clienti_attivi integer
)
language sql stable
as $$
  select
    coalesce((select sum(f.importo) from fatture_esterne f), 0),
    (select count(*) from fatture_esterne)::int,
    (select count(*) from fatture_esterne where pagata = false)::int,
    coalesce((select sum(importo) from fatture_esterne where pagata = false), 0),
    (select count(distinct coalesce(codice_fiscale, partita_iva, id::text)) from clienti_esterni)::int,
    (select count(distinct coalesce(codice_fiscale, partita_iva, id::text)) from clienti_esterni where attivo)::int;
$$;
