-- ============================================================
-- Note e aggiornamenti sui Ticket — log testuale libero dei passaggi
-- fatti (distinto da "storico", che registra solo i cambi di stato
-- strutturati). Ogni riga è un aggiornamento scritto da un operatore.
-- ============================================================
create table note_ticket (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  autore_id uuid references staff(id),
  testo text not null,
  creato_il timestamptz not null default now()
);

create index on note_ticket (ticket_id, creato_il);

alter table note_ticket enable row level security;

create policy "staff attivo legge note ticket" on note_ticket for select using (is_active_staff());
create policy "staff attivo scrive note ticket" on note_ticket for insert with check (is_active_staff());