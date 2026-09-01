-- ★ FIX (2026-08-31, seguito immediato della migrazione 0069 — richiesta
-- esplicita dopo aver visto i numeri: "sono tanti") — la 0069 aveva
-- promosso `contratto_attivo` a unica fonte di "attivo" (2922 risultati),
-- ma questo reintroduce esattamente il problema che ci aveva spinto a
-- incrociare le fatture la prima volta (migrazione 0060): Aruba non
-- aggiorna il flag in modo affidabile alla chiusura di un contratto.
--
-- Verificato sui dati reali dopo la 0069: dei 2922 clienti
-- `contratto_attivo=true`, 355 hanno una fattura emessa ma la più recente
-- ha più di 12 mesi (probabile vero cessato) — mentre 244 non hanno
-- NESSUNA fattura mai abbinata (come il caso dell'utente stesso, cod.
-- gestionale 900500: fatturato sotto il CF di due parenti, non il suo —
-- qui non è cessazione, è un problema di abbinamento).
--
-- Nuova regola ibrida: `contratto_attivo=true` E (una fattura emessa negli
-- ultimi 12 mesi, OPPURE nessuna fattura mai trovata per quel CF/P.IVA).
-- Esclude solo chi ha una fattura vecchia ACCERTATA (prova di cessazione
-- reale); dà il beneficio del dubbio a chi non ha alcuna fattura abbinata,
-- invece di escluderlo come faceva la 0060. Risultato atteso: 2567 clienti
-- (contro 2922 della sola 0069 e 2323 della 0060).
create or replace function ricalcola_clienti_attivi() returns void as $$
begin
  update clienti_esterni ce
  set attivo = coalesce(ce.contratto_attivo, false) and (
    not exists (
      select 1 from fatture_esterne fe
      where (
        (ce.codice_fiscale is not null and fe.codice_fiscale = ce.codice_fiscale)
        or (ce.partita_iva is not null and fe.partita_iva = ce.partita_iva)
      )
    )
    or exists (
      select 1 from fatture_esterne fe
      where fe.emissione >= (current_date - interval '365 days')
        and (
          (ce.codice_fiscale is not null and fe.codice_fiscale = ce.codice_fiscale)
          or (ce.partita_iva is not null and fe.partita_iva = ce.partita_iva)
        )
    )
  )
  where true; -- no-op richiesta dalla protezione anti-UPDATE-senza-WHERE, vedi 0039
end;
$$ language plpgsql security definer set search_path = public;

-- applica subito la nuova definizione ai dati esistenti, non solo alla
-- prossima sincronizzazione Aruba.
select ricalcola_clienti_attivi();
