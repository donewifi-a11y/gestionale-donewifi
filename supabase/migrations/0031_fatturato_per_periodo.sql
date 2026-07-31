-- Fatturato/clienti/profili filtrabili per periodo arbitrario (non solo
-- il mese corrente o gli ultimi 6 mesi fissi), per poter confrontare due
-- intervalli e calcolare crescita/decrescita — calcolato in SQL invece
-- che scaricando le fatture del periodo via rete.

create or replace function statistiche_fatturato_periodo(p_inizio date, p_fine date)
returns table (
  fatturato numeric,
  numero_fatture integer,
  numero_insolute integer,
  totale_insoluto numeric,
  clienti_attivi_periodo integer
)
language sql stable
as $$
  select
    coalesce(sum(f.importo), 0),
    count(*)::int,
    (count(*) filter (where f.pagata = false))::int,
    coalesce(sum(f.importo) filter (where f.pagata = false), 0),
    count(distinct coalesce(f.codice_fiscale, f.partita_iva))::int
  from fatture_esterne f
  where f.emissione between p_inizio and p_fine;
$$;

-- ★ profilo del cliente al momento di OGGI (clienti_esterni non tiene uno
-- storico "il profilo che aveva a marzo") — un limite noto, non un bug:
-- se un cliente ha cambiato piano da allora, qui compare con quello
-- attuale. Lo storico dei cambi (clienti_esterni_storico_profilo) esiste
-- ma solo da quando è stato introdotto, non abbastanza per ricostruirlo.
create or replace function profili_per_periodo(p_inizio date, p_fine date)
returns table (profilo text, conteggio integer)
language sql stable
as $$
  select ce.profilo_internet, count(distinct coalesce(f.codice_fiscale, f.partita_iva))::int as conteggio
  from fatture_esterne f
  join clienti_esterni ce
    on (ce.codice_fiscale is not null and ce.codice_fiscale = f.codice_fiscale)
    or (ce.partita_iva is not null and ce.partita_iva = f.partita_iva)
  where f.emissione between p_inizio and p_fine
    and ce.profilo_internet is not null and ce.profilo_internet <> ''
  group by ce.profilo_internet
  order by conteggio desc
  limit 8;
$$;
