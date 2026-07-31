-- Stato "letto" della chat: una riga per persona/conversazione con l'istante
-- dell'ultima lettura, aggiornata quando si apre/tiene aperta la
-- conversazione. Chi ha scritto l'ultimo messaggio può controllare se
-- l'altra persona ha letto confrontando questa data con quella del
-- messaggio — stesso principio della doppia spunta di WhatsApp.
--
-- L'essere online/offline invece non ha bisogno di una tabella: è gestito
-- lato client con la Presence di Supabase Realtime (effimera, nessun dato
-- da conservare).

create table if not exists conversazioni_letture (
  conversazione_id uuid not null references conversazioni(id) on delete cascade,
  persona_id uuid not null references persone(id) on delete cascade,
  ultimo_letto_il timestamptz not null default now(),
  primary key (conversazione_id, persona_id)
);

alter table conversazioni_letture enable row level security;

drop policy if exists "legge le letture delle proprie conversazioni" on conversazioni_letture;
create policy "legge le letture delle proprie conversazioni" on conversazioni_letture for select using (
  exists (
    select 1 from conversazioni c where c.id = conversazioni_letture.conversazione_id and (
      (c.tipo = 'diretta' and persona_corrente_id() in (c.persona_a_id, c.persona_b_id))
      or
      (c.tipo = 'gruppo' and (
        (select amministratore from persone where id = persona_corrente_id())
        or c.reparto = any(select unnest(reparti) from persone where id = persona_corrente_id())
      ))
    )
  )
);

drop policy if exists "scrive la propria lettura" on conversazioni_letture;
create policy "scrive la propria lettura" on conversazioni_letture for insert with check (
  persona_id = persona_corrente_id()
);

drop policy if exists "aggiorna la propria lettura" on conversazioni_letture;
create policy "aggiorna la propria lettura" on conversazioni_letture for update using (
  persona_id = persona_corrente_id()
);

do $$
begin
  alter publication supabase_realtime add table conversazioni_letture;
exception when duplicate_object then null;
end $$;
