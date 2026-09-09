-- ============================================================
-- Subentro — contratto approvato dal nuovo cliente (2026-09, richiesta
-- esplicita: "il contratto nuovo approvato solo da nuovo" — vedi
-- l'artifact "Il Subentro Fino all'Installazione"): dopo il doppio
-- consenso (vecchio conferma la cessione, nuovo invia dati/documenti),
-- mancava tutta la fase del contratto — lo stesso meccanismo già in uso
-- per i Nuovi Clienti (segnalazioni.contratto_pdf_url/
-- contratto_inviato_approvazione_il/contratto_approvato_cliente_il),
-- qui applicato a richieste_clienti e con l'approvazione riservata al
-- SOLO nuovo cliente (il vecchio ha già dato il suo consenso alla
-- cessione al passo precedente, non deve approvare due volte).
-- ============================================================

alter table richieste_clienti add column if not exists contratto_pdf_url text;
alter table richieste_clienti add column if not exists contratto_inviato_approvazione_il timestamptz;
alter table richieste_clienti add column if not exists contratto_approvato_nuovo_cliente_il timestamptz;

-- ★ sesto valore possibile per token_approvazione.origine (dopo intervento/
-- contratto/preventivo/firma_scheda/firma_rapportino/subentro_vecchio_cliente):
-- il link di approvazione del contratto mandato al NUOVO cliente di un
-- Subentro — non riusa "contratto" (quello punta a segnalazione_id, un
-- riferimento diverso) per lo stesso motivo per cui "subentro_vecchio_cliente"
-- non riusa "intervento".
alter table token_approvazione drop constraint if exists token_approvazione_origine_check;
alter table token_approvazione add constraint token_approvazione_origine_check check (
  origine in ('intervento', 'contratto', 'preventivo', 'firma_scheda', 'firma_rapportino', 'subentro_vecchio_cliente', 'subentro_contratto')
);
