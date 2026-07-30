-- ============================================================
-- Ultimi due pezzi ancora sul vecchio gestionale pubblico (Apps Script,
-- area.donewifi.it): il Portale clienti (apri un ticket / verifica stato,
-- senza login) e l'approvazione via email dell'intervento (quando il
-- tecnico non è di persona dal cliente per farsi firmare il rapportino).
-- ============================================================

-- ★ ex colonna "Data Approvazione Email" del vecchio foglio Ticket.
alter table tickets add column if not exists confermato_cliente_il timestamptz;

-- ★ ex TOKENAPPROVA_* in PropertiesService (Apps Script) — qui una vera
-- tabella invece di una property-bag, un token monouso per ticket alla
-- volta (basta il ticket_id come chiave, un nuovo invio sostituisce il
-- precedente non ancora usato).
create table if not exists token_approvazione (
  token uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  creato_il timestamptz not null default now()
);

-- ★ nessuna policy RLS: questa tabella si legge/scrive SOLO da route
-- pubbliche con service role (il token stesso, non una sessione, è la
-- prova di autorizzazione) — stessa logica già usata per "documenti".
alter table token_approvazione enable row level security;
