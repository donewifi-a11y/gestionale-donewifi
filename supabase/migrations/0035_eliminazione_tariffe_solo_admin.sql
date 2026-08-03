-- Eliminare una Tariffa o una Promozione deve essere un'azione da Admin,
-- non da qualsiasi membro dello staff attivo — sono dati che riguardano i
-- prezzi venduti ai clienti, non un contenuto "operativo" come un ticket.
-- Creazione/modifica/lettura restano invariate (staff attivo).
--
-- Stesso approccio già usato per "persone" (migrazione 0008): invece di
-- introdurre una funzione is_admin() lato RLS, si toglie la policy DELETE
-- per il client normale — l'eliminazione passa solo dalla service role,
-- con il controllo admin fatto in app (eliminaTariffa()/eliminaPromozione()
-- in src/app/(app)/tariffe/actions.ts).
drop policy if exists "staff attivo elimina tariffe" on tariffe;
drop policy if exists "staff attivo elimina promozioni" on promozioni;
