-- ============================================================
-- 1) Realtime per Segnalazioni — la bacheca deve aggiornarsi da sola quando
-- arrivano dati/documenti dal cliente (POST pubblico a /api/richiesta-dati),
-- senza che lo staff debba ricaricare la pagina a mano.
-- ============================================================
do $$
begin
  alter publication supabase_realtime add table segnalazioni;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table richieste_clienti;
exception when duplicate_object then null;
end $$;

-- ============================================================
-- 2) Approvazione contratto via email — stesso principio già usato per
-- l'approvazione dell'intervento su un Ticket (migrazione 0013): un link
-- monouso inviato all'email del cliente, che quando cliccato prova che
-- l'approvazione viene davvero da quella casella. Si generalizza la stessa
-- tabella `token_approvazione` per riferirsi anche a una Segnalazione,
-- invece di crearne una copia quasi identica solo per i contratti.
-- ============================================================
alter table segnalazioni add column if not exists contratto_inviato_approvazione_il timestamptz;
alter table segnalazioni add column if not exists contratto_approvato_cliente_il timestamptz;

alter table token_approvazione alter column ticket_id drop not null;
alter table token_approvazione add column if not exists segnalazione_id uuid references segnalazioni(id) on delete cascade;
alter table token_approvazione add column if not exists origine text not null default 'intervento' check (origine in ('intervento', 'contratto'));

-- ★ un token è o per un Ticket o per una Segnalazione, mai entrambi o nessuno dei due.
alter table token_approvazione drop constraint if exists token_approvazione_un_riferimento;
alter table token_approvazione add constraint token_approvazione_un_riferimento check (
  (ticket_id is not null and segnalazione_id is null) or (ticket_id is null and segnalazione_id is not null)
);
