-- To-do personali: un "angolo" privato per ciascuna Persona, non legato a
-- Ticket/Segnalazioni/Calendario — appunti/cose da fare propri, non
-- condivisi con nessun altro.
--
-- ★ Come la chat interna (migrazione 0021): dati privati di una singola
-- Persona, quindi la RLS applica davvero il controllo (non solo l'app) —
-- riusa la stessa persona_corrente_id() già definita lì, nessuna nuova
-- funzione necessaria.

create table if not exists todo_personali (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references persone(id) on delete cascade,
  testo text not null,
  fatto boolean not null default false,
  creato_il timestamptz not null default now(),
  completato_il timestamptz
);

create index if not exists todo_personali_persona on todo_personali (persona_id, fatto, creato_il);

alter table todo_personali enable row level security;

drop policy if exists "vede i propri to-do" on todo_personali;
create policy "vede i propri to-do" on todo_personali for select using (
  is_active_staff() and persona_id = persona_corrente_id()
);

drop policy if exists "crea propri to-do" on todo_personali;
create policy "crea propri to-do" on todo_personali for insert with check (
  is_active_staff() and persona_id = persona_corrente_id()
);

drop policy if exists "aggiorna propri to-do" on todo_personali;
create policy "aggiorna propri to-do" on todo_personali for update using (
  is_active_staff() and persona_id = persona_corrente_id()
) with check (
  is_active_staff() and persona_id = persona_corrente_id()
);

drop policy if exists "elimina propri to-do" on todo_personali;
create policy "elimina propri to-do" on todo_personali for delete using (
  is_active_staff() and persona_id = persona_corrente_id()
);
