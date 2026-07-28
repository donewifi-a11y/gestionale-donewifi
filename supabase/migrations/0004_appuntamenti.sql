-- ============================================================
-- Calendario/Installazioni — appuntamenti collegati (facoltativamente)
-- a un Ticket, assegnati a un tecnico.
-- ============================================================
create type stato_appuntamento as enum ('Programmato', 'Completato', 'Annullato');

create table appuntamenti (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets(id) on delete set null,
  titolo text not null,
  indirizzo text,
  data_ora timestamptz not null,
  durata_minuti int not null default 60,
  tecnico_id uuid references staff(id),
  note text,
  stato stato_appuntamento not null default 'Programmato',
  creato_da uuid references staff(id),
  creato_il timestamptz not null default now()
);

create index on appuntamenti (data_ora);
create index on appuntamenti (tecnico_id);

alter table appuntamenti enable row level security;

create policy "staff attivo legge appuntamenti" on appuntamenti for select using (is_active_staff());
create policy "staff attivo scrive appuntamenti" on appuntamenti for insert with check (is_active_staff());
create policy "staff attivo aggiorna appuntamenti" on appuntamenti for update using (is_active_staff());