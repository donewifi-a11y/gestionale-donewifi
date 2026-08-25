-- ★ FIX (2026-08, segnalato dall'utente: "alcuni clienti non attivi in
-- verità sono attivi") — `ricalcola_clienti_attivi()` (migrazione 0026,
-- corretta in 0039) definiva "attivo" come "ha una fattura emessa negli
-- ultimi 90 giorni". Verificato sui dati reali: 868 clienti con contratto
-- Aruba davvero attivo (contrattoattivo='S') risultavano "non attivo" nel
-- gestionale solo perché fatturano a un ciclo più lungo (trimestrale,
-- annuale, o a consumo come Buy&Go) — la finestra di 90 giorni è un
-- segnale sbagliato per capire se un contratto è ancora in essere.
--
-- Nuova fonte: `contratto_attivo`, il campo grezzo Aruba (contrattoattivo
-- S/N) — prima considerato "inaffidabile" e tenuto solo per riferimento,
-- ora promosso a fonte primaria su richiesta esplicita. La fatturazione
-- resta visibile in scheda cliente (tab Fatture) ma non decide più lo
-- stato "attivo/non attivo".
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
