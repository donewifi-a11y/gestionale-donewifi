-- ============================================================
-- Campi dinamici per sottocategoria (ex CONFIG_CATEGORIE di
-- NuovoTicket.html) — un unico campo jsonb invece di 14 tabelle diverse,
-- coerente con lo spirito di semplificazione già seguito altrove.
-- ============================================================
alter table tickets add column if not exists dettagli_extra jsonb not null default '{}';
