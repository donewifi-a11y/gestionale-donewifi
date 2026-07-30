-- ============================================================
-- Clienti — reintroduce i dati contrattuali del vecchio registro
-- "Clienti Attivi" (tariffa attiva, canone, scadenza contratto, note),
-- che non stavano su nessun Ticket. L'elenco Clienti resta comunque
-- derivato dai Ticket per chi non ha ancora un record qui — questa
-- tabella si aggiunge, non sostituisce quella logica.
-- ============================================================
create table if not exists clienti (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefono text,
  email text,
  indirizzo text,
  tariffa_id uuid references tariffe(id),
  canone_mensile numeric,
  scadenza_contratto date,
  note text,
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

create index if not exists clienti_telefono_idx on clienti (telefono);

alter table clienti enable row level security;
drop policy if exists "staff attivo legge clienti" on clienti;
create policy "staff attivo legge clienti" on clienti for select using (is_active_staff());
drop policy if exists "staff attivo scrive clienti" on clienti;
create policy "staff attivo scrive clienti" on clienti for insert with check (is_active_staff());
drop policy if exists "staff attivo aggiorna clienti" on clienti;
create policy "staff attivo aggiorna clienti" on clienti for update using (is_active_staff());
