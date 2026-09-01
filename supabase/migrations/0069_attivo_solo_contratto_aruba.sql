-- ★ FIX (2026-08-31, richiesta esplicita: "le fatture potrebbero essere non
-- sempre un sistema preciso di verifica. Utilizzerei la pagina di ricerca
-- con i clienti con status si") — la migrazione 0060 (2026-08-25) aveva già
-- provato a correggere il flag Aruba incrociandolo con le fatture (prima 90
-- giorni, poi 12 mesi), perché il flag grezzo da solo sembrava sovrastimare
-- gli attivi. Ma l'abbinamento fattura↔cliente è per CF/P.IVA, e quello
-- salta quando il pagante non coincide col nome sul contratto (nucleo
-- familiare, contratto ereditato...) — verificato su un caso reale:
-- l'account dell'utente stesso (cod. gestionale 900500) risultava "non
-- attivo" perché le fatture di quell'indirizzo erano intestate a due
-- parenti con CF diversi, non al suo. Su 585 clienti con
-- `contratto_attivo=true` ma `attivo=false`, 233 non avevano NESSUNA
-- fattura mai abbinata pur avendo un profilo/contratto assegnato — segno
-- di un problema di abbinamento, non di clienti davvero cessati.
--
-- Nuova regola, la più semplice: `attivo` = `contratto_attivo` grezzo, lo
-- stesso dato mostrato dalla pagina interna di ricerca anagrafica Aruba
-- ("Status Sì/No") già usata come riferimento. Le fatture restano
-- disponibili in scheda cliente per un controllo caso per caso, ma non
-- decidono più il flag "attivo" mostrato in giro per il gestionale.
create or replace function ricalcola_clienti_attivi() returns void as $$
begin
  update clienti_esterni ce
  set attivo = coalesce(ce.contratto_attivo, false)
  where true; -- no-op richiesta dalla protezione anti-UPDATE-senza-WHERE, vedi 0039
end;
$$ language plpgsql security definer set search_path = public;

-- applica subito la nuova definizione ai dati esistenti, non solo alla
-- prossima sincronizzazione Aruba.
select ricalcola_clienti_attivi();
