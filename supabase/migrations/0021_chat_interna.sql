-- Chat interna tra Persone: messaggi diretti (1-a-1) + un gruppo per
-- ciascun reparto (Analisi Rete/Commerciale/Fatturazione), popolato con la
-- lista membri calcolata al volo da persone.reparti — non c'è una tabella
-- di iscrizione da tenere allineata quando i reparti di qualcuno cambiano.
--
-- ★ A differenza del resto del gestionale, qui la RLS applica davvero il
-- controllo (non solo l'app): i messaggi sono dati privati, e chiunque ha
-- la sessione potrebbe altrimenti leggerli via REST diretta bypassando le
-- Server Action, cosa che invece va bene per dati "reparto-wide" come i
-- Ticket ma non per una chat privata.

create or replace function persona_corrente_id() returns uuid as $$
  select id from persone where auth_user_id = auth.uid() and attivo = true limit 1;
$$ language sql stable security definer;

create table if not exists conversazioni (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('diretta', 'gruppo')),
  persona_a_id uuid references persone(id),
  persona_b_id uuid references persone(id),
  reparto area_accesso,
  creato_il timestamptz not null default now(),
  check (
    (tipo = 'diretta' and persona_a_id is not null and persona_b_id is not null and reparto is null)
    or
    (tipo = 'gruppo' and reparto is not null and persona_a_id is null and persona_b_id is null)
  )
);

-- ★ una sola conversazione diretta per coppia, indipendentemente dall'ordine.
create unique index if not exists conversazioni_coppia_unica on conversazioni (
  least(persona_a_id, persona_b_id), greatest(persona_a_id, persona_b_id)
) where tipo = 'diretta';

create unique index if not exists conversazioni_gruppo_reparto_unico on conversazioni (reparto) where tipo = 'gruppo';

create table if not exists messaggi_chat (
  id uuid primary key default gen_random_uuid(),
  conversazione_id uuid not null references conversazioni(id) on delete cascade,
  mittente_id uuid not null references persone(id),
  testo text,
  allegato_url text,
  allegato_nome text,
  creato_il timestamptz not null default now(),
  check (testo is not null or allegato_url is not null)
);

create index if not exists messaggi_chat_conversazione on messaggi_chat (conversazione_id, creato_il);

alter table conversazioni enable row level security;
alter table messaggi_chat enable row level security;

drop policy if exists "vede le proprie conversazioni" on conversazioni;
create policy "vede le proprie conversazioni" on conversazioni for select using (
  is_active_staff() and (
    (tipo = 'diretta' and persona_corrente_id() in (persona_a_id, persona_b_id))
    or
    (tipo = 'gruppo' and (
      (select amministratore from persone where id = persona_corrente_id())
      or reparto = any(select unnest(reparti) from persone where id = persona_corrente_id())
    ))
  )
);

drop policy if exists "crea una conversazione diretta propria" on conversazioni;
create policy "crea una conversazione diretta propria" on conversazioni for insert with check (
  is_active_staff() and tipo = 'diretta' and persona_corrente_id() in (persona_a_id, persona_b_id)
);

drop policy if exists "legge i messaggi delle proprie conversazioni" on messaggi_chat;
create policy "legge i messaggi delle proprie conversazioni" on messaggi_chat for select using (
  exists (
    select 1 from conversazioni c where c.id = messaggi_chat.conversazione_id and (
      (c.tipo = 'diretta' and persona_corrente_id() in (c.persona_a_id, c.persona_b_id))
      or
      (c.tipo = 'gruppo' and (
        (select amministratore from persone where id = persona_corrente_id())
        or c.reparto = any(select unnest(reparti) from persone where id = persona_corrente_id())
      ))
    )
  )
);

drop policy if exists "scrive messaggi nelle proprie conversazioni" on messaggi_chat;
create policy "scrive messaggi nelle proprie conversazioni" on messaggi_chat for insert with check (
  mittente_id = persona_corrente_id() and exists (
    select 1 from conversazioni c where c.id = messaggi_chat.conversazione_id and (
      (c.tipo = 'diretta' and persona_corrente_id() in (c.persona_a_id, c.persona_b_id))
      or
      (c.tipo = 'gruppo' and (
        (select amministratore from persone where id = persona_corrente_id())
        or c.reparto = any(select unnest(reparti) from persone where id = persona_corrente_id())
      ))
    )
  )
);

-- ★ i 3 gruppi reparto esistono sempre, creati una volta sola qui — non
-- servono policy di insert per "gruppo", nessuno li crea da app.
insert into conversazioni (tipo, reparto)
select 'gruppo', r from unnest(enum_range(null::area_accesso)) as r
where r in ('Analisi Rete', 'Commerciale', 'Fatturazione')
on conflict (reparto) where (tipo = 'gruppo') do nothing;

-- ★ idempotente: fallisce silenziosamente se la tabella è già nella
-- pubblicazione (es. riesecuzione di questa migrazione).
do $$
begin
  alter publication supabase_realtime add table messaggi_chat;
exception when duplicate_object then null;
end $$;
