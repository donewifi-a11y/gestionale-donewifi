-- ============================================================
-- Note/promemoria nel Calendario — non legate per forza a un Ticket o a
-- un Appuntamento: un promemoria libero ("richiamare il cliente X",
-- "ordinare materiale per Y") con una data, visibile nel Calendario
-- insieme agli appuntamenti e ripreso in Mondo Ticket quando è scaduto
-- o del giorno stesso.
-- ============================================================
create table if not exists note_calendario (
  id uuid primary key default gen_random_uuid(),
  testo text not null,
  data_promemoria date not null,
  ticket_id uuid references tickets(id),
  completata boolean not null default false,
  creato_da uuid references persone(id),
  creato_il timestamptz not null default now()
);

create index if not exists note_calendario_data_idx on note_calendario (data_promemoria);

alter table note_calendario enable row level security;
drop policy if exists "staff attivo legge note calendario" on note_calendario;
create policy "staff attivo legge note calendario" on note_calendario for select using (is_active_staff());
drop policy if exists "staff attivo scrive note calendario" on note_calendario;
create policy "staff attivo scrive note calendario" on note_calendario for insert with check (is_active_staff());
drop policy if exists "staff attivo aggiorna note calendario" on note_calendario;
create policy "staff attivo aggiorna note calendario" on note_calendario for update using (is_active_staff());
drop policy if exists "staff attivo elimina note calendario" on note_calendario;
create policy "staff attivo elimina note calendario" on note_calendario for delete using (is_active_staff());
