-- Il flag `contratto_attivo` (letto da Aruba, "contrattoattivo" = 'S'/'N')
-- non è affidabile come stato reale del cliente: 2909 righe segnate 'S',
-- ma solo ~1806 clienti hanno davvero ricevuto una fattura negli ultimi
-- 90 giorni. Analisi sulla data di fatturazione: il conteggio si
-- appiattisce nettamente dopo i 60-90 giorni (ciclo mensile/bimestrale),
-- segno che oltre quella soglia il cliente non è più realmente attivo
-- anche se Aruba non ha mai aggiornato il flag.
--
-- `contratto_attivo` resta (dato grezzo, per riferimento) — l'app usa da
-- qui in poi `attivo`, ricalcolato dalla fatturazione reale.

alter table clienti_esterni add column if not exists attivo boolean not null default false;
create index if not exists clienti_esterni_attivo on clienti_esterni (attivo);

-- ★ security definer: la tabella non ha policy di scrittura per lo staff
-- autenticato (si scrive solo dalla sincronizzazione) — questa funzione
-- deve poter aggiornare comunque, chiamata da un admin via RPC.
create or replace function ricalcola_clienti_attivi() returns void as $$
begin
  update clienti_esterni ce
  set attivo = exists (
    select 1 from fatture_esterne fe
    where fe.emissione >= (current_date - interval '90 days')
      and (
        (ce.codice_fiscale is not null and fe.codice_fiscale = ce.codice_fiscale)
        or (ce.partita_iva is not null and fe.partita_iva = ce.partita_iva)
      )
  );
end;
$$ language plpgsql security definer set search_path = public;

select ricalcola_clienti_attivi();
