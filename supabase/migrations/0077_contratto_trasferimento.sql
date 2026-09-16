-- non cancellare questa riga di commento

-- ============================================================
-- NUOVA — richiesta esplicita, dopo un audit sulla gestione delle pratiche
-- cliente ("perché non si convertono i passaggi"): trovato un caso reale
-- in produzione (Trasferimento di "Feiza", segnato "Lavorata" con la data
-- preferita del trasferimento ancora nel futuro) — lo stato "Lavorata" per
-- Trasferimento era un semplice pulsante manuale, senza nessuna garanzia
-- che il cambiamento fosse davvero avvenuto. Uniformato allo stesso
-- sistema già in uso per Subentro/Nuovi Clienti: contratto caricato →
-- inviato al cliente → approvato dal cliente → SOLO ALLORA la pratica
-- diventa "Lavorata" da sola, non un giudizio manuale dell'operatore.
--
-- `contratto_pdf_url`/`contratto_inviato_approvazione_il` sono già
-- generici (nessun riferimento a "Subentro" nel nome), riusati anche per
-- Trasferimento. Solo l'esito dell'approvazione ha un campo suo —
-- `contratto_approvato_nuovo_cliente_il` è specifico del Subentro (il
-- "nuovo" titolare, distinto dal "vecchio"): per Trasferimento c'è un solo
-- cliente, da cui il nome più semplice.
-- ============================================================
alter table richieste_clienti add column if not exists contratto_approvato_cliente_il timestamptz;

-- ★ settimo valore possibile per token_approvazione.origine (dopo
-- intervento/contratto/preventivo/firma_scheda/firma_rapportino/
-- subentro_vecchio_cliente/subentro_contratto) — il link di approvazione
-- del contratto di Trasferimento.
alter table token_approvazione drop constraint if exists token_approvazione_origine_check;
alter table token_approvazione add constraint token_approvazione_origine_check check (
  origine in ('intervento', 'contratto', 'preventivo', 'firma_scheda', 'firma_rapportino', 'subentro_vecchio_cliente', 'subentro_contratto', 'trasferimento_contratto')
);

notify pgrst, 'reload schema';
