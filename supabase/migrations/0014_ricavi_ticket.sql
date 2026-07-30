-- ============================================================
-- Cruscotti amministrazione — ex getDatiAnalyticsAmministrazione() del
-- vecchio gestionale: reintroduce il tracciamento economico per Ticket,
-- rimasto fuori dalla migrazione iniziale. Semplificato: un solo importo
-- per Ticket (compilato in chiusura, dal rapportino), non più un foglio
-- "Clienti Attivi" separato — le acquisizioni si leggono direttamente da
-- segnalazioni.tipologia_cliente/profilo_internet, già esistenti.
-- ============================================================
alter table tickets add column if not exists importo_fatturato numeric;
