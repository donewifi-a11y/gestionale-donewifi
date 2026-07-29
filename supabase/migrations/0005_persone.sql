-- ============================================================
-- Persone — quando più persone reali condividono lo stesso login
-- (Gmail comuni), "staff" non basta più per sapere chi ha fatto cosa.
-- "persone" è il registro dei membri del team, senza un proprio login:
-- dopo l'accesso con l'account condiviso, l'utente sceglie "chi è" nel
-- gestionale, e da quel momento assegnazioni/note/creazioni si
-- riferiscono alla persona scelta, non più all'account condiviso.
-- ============================================================
create table if not exists persone (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  attivo boolean not null default true,
  creato_il timestamptz not null default now()
);

alter table persone enable row level security;
drop policy if exists "staff attivo legge persone" on persone;
create policy "staff attivo legge persone" on persone for select using (is_active_staff());
drop policy if exists "staff attivo scrive persone" on persone;
create policy "staff attivo scrive persone" on persone for insert with check (is_active_staff());
drop policy if exists "staff attivo aggiorna persone" on persone;
create policy "staff attivo aggiorna persone" on persone for update using (is_active_staff());

-- ★ traghetta ogni account "staff" già in uso in una riga "persone" con lo
-- stesso id: così i Ticket/Segnalazioni/Appuntamenti/Note già assegnati a
-- quell'account restano validi quando le colonne sotto passano a
-- referenziare persone(id) invece di staff(id). Chi gestisce il team può
-- poi rinominare/disattivare queste righe "traghettate" dalla pagina
-- Persone, o aggiungerne di nuove per le persone reali.
insert into persone (id, nome, attivo)
select id, coalesce(nome, email), attivo from staff
on conflict (id) do nothing;

-- ── ricollega a "persone" le colonne che tracciano un individuo ──────
alter table tickets drop constraint if exists tickets_tecnico_assegnato_fkey;
alter table tickets add constraint tickets_tecnico_assegnato_fkey
  foreign key (tecnico_assegnato) references persone(id);

alter table tickets drop constraint if exists tickets_creato_da_fkey;
alter table tickets add constraint tickets_creato_da_fkey
  foreign key (creato_da) references persone(id);

alter table segnalazioni drop constraint if exists segnalazioni_operatore_id_fkey;
alter table segnalazioni add constraint segnalazioni_operatore_id_fkey
  foreign key (operatore_id) references persone(id);

alter table appuntamenti drop constraint if exists appuntamenti_tecnico_id_fkey;
alter table appuntamenti add constraint appuntamenti_tecnico_id_fkey
  foreign key (tecnico_id) references persone(id);

alter table appuntamenti drop constraint if exists appuntamenti_creato_da_fkey;
alter table appuntamenti add constraint appuntamenti_creato_da_fkey
  foreign key (creato_da) references persone(id);

alter table note_ticket drop constraint if exists note_ticket_autore_id_fkey;
alter table note_ticket add constraint note_ticket_autore_id_fkey
  foreign key (autore_id) references persone(id);

alter table storico drop constraint if exists storico_operatore_id_fkey;
alter table storico add constraint storico_operatore_id_fkey
  foreign key (operatore_id) references persone(id);
