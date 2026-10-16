-- non cancellare questa riga di commento

-- ============================================================
-- NUOVA — richiesta esplicita: "nel preventivo non ci sono i dati legali
-- del cliente". Verificato: il preventivo (sia a schermo sia nel PDF)
-- mostrava solo nome/telefono/email del cliente, mai indirizzo/codice
-- fiscale/partita IVA — dati già raccolti per un Cliente Esterno
-- (clienti_esterni.indirizzo/codice_fiscale/partita_iva) ma mai riportati
-- qui, e del tutto assenti per un cliente nuovo (Segnalazione) o inserito
-- a mano.
--
-- Tutti e tre facoltativi — un preventivo resta creabile senza, come
-- prima.
-- ============================================================

alter table preventivi
  add column cliente_indirizzo text,
  add column cliente_codice_fiscale text,
  add column cliente_partita_iva text;

notify pgrst, 'reload schema';
