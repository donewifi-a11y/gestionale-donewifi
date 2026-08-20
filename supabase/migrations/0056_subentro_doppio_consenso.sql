-- ============================================================
-- Subentro — doppio consenso in parallelo (Opzione B della proposta
-- "Sistema Subentro", 2026-08): oggi un solo link raccoglie solo i dati
-- del nuovo titolare, senza mai chiedere una conferma esplicita al vecchio
-- cliente. Da qui in avanti la pratica ha due tracce indipendenti — il
-- vecchio cliente conferma via link monouso (stesso meccanismo già usato
-- per contratto/preventivo/firma), il nuovo cliente compila il modulo
-- pubblico esistente — e non serve un ordine preciso tra le due.
-- ============================================================

alter table richieste_clienti add column if not exists vecchio_cliente_confermato_il timestamptz;
alter table richieste_clienti add column if not exists vecchio_cliente_rifiutato_il timestamptz;

-- ★ quinto riferimento possibile per token_approvazione (dopo ticket/
-- segnalazione/preventivo/appuntamento): qui punta alla riga richieste_clienti
-- già creata dall'operatore quando avvia la pratica di Subentro, prima
-- ancora che il nuovo cliente abbia compilato alcunché.
alter table token_approvazione add column if not exists richiesta_cliente_id uuid references richieste_clienti(id) on delete cascade;

alter table token_approvazione drop constraint if exists token_approvazione_un_riferimento;
alter table token_approvazione add constraint token_approvazione_un_riferimento check (
  (ticket_id is not null)::int + (segnalazione_id is not null)::int + (preventivo_id is not null)::int
  + (appuntamento_id is not null)::int + (richiesta_cliente_id is not null)::int = 1
);

alter table token_approvazione drop constraint if exists token_approvazione_origine_check;
alter table token_approvazione add constraint token_approvazione_origine_check check (
  origine in ('intervento', 'contratto', 'preventivo', 'firma_scheda', 'firma_rapportino', 'subentro_vecchio_cliente')
);
