-- ★ FIX (2026-08-25, richiesta esplicita: "quanti clienti ti risultano? dovrebbero
-- essere circa 1800") — la migrazione 0059 aveva promosso `contratto_attivo`
-- (flag grezzo Aruba) a UNICA fonte di "attivo", scartando del tutto il
-- controllo sulle fatture. Verificato sui dati reali dopo il dedup
-- (migrazioni codice `dedupClientiPerContratto`/`dedupClientiPerInstallazione`):
-- 2397 installazioni risultavano "attive", ma 531 di queste non fatturano da
-- oltre un anno (179 da oltre 2 anni, 221 mai fatturato una volta) — il flag
-- Aruba non viene aggiornato in modo affidabile quando un contratto chiude.
--
-- Nuova regola, le due condizioni insieme: `contratto_attivo=true` E almeno
-- una fattura emessa negli ultimi 12 mesi (contro i 90 giorni della vecchia
-- logica pre-0059, troppo severi per chi fattura a ciclo lungo/annuale/a
-- consumo). Risultato sui dati reali: 1866 installazioni attive — vicino al
-- numero atteso (~1800).
create or replace function ricalcola_clienti_attivi() returns void as $$
begin
  update clienti_esterni ce
  set attivo = coalesce(ce.contratto_attivo, false) and exists (
    select 1 from fatture_esterne fe
    where fe.emissione >= (current_date - interval '365 days')
      and (
        (ce.codice_fiscale is not null and fe.codice_fiscale = ce.codice_fiscale)
        or (ce.partita_iva is not null and fe.partita_iva = ce.partita_iva)
      )
  )
  where true; -- no-op richiesta dalla protezione anti-UPDATE-senza-WHERE, vedi 0039
end;
$$ language plpgsql security definer set search_path = public;

-- applica subito la nuova definizione ai dati esistenti, non solo alla
-- prossima sincronizzazione Aruba.
select ricalcola_clienti_attivi();
