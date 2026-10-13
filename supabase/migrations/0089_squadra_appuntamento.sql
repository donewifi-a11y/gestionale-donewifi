-- non cancellare questa riga di commento

-- ============================================================
-- NUOVA — richiesta esplicita: "dobbiamo dare la possibilità di creare
-- appuntamenti in simultanea, in cui sono presenti diverse squadre e
-- mettere la possibilità di far vedere alla squadra l'intervento".
--
-- Un appuntamento oggi ha UN solo assegnatario (tecnico_id O
-- tecnico_esterno_id, mutuamente esclusivi, vedi migrazioni 0004/0005/0061)
-- — niente modo di mandare due persone insieme sullo stesso intervento, né
-- di far vedere l'appuntamento a chi non è l'unico assegnatario diretto.
--
-- Scelta di design: non si tocca `tecnico_id`/`tecnico_esterno_id` su
-- `appuntamenti` (restano il PRIMO assegnatario, l'unico letto da tutto il
-- codice esistente — nessuna rottura di nulla di già scritto). Questa
-- tabella aggiunge solo i membri EXTRA della squadra: 0 o più persone
-- interne/tecnici esterni in più, oltre al primo. "Far vedere alla
-- squadra l'intervento" = ogni riga qui dentro dà a quella persona la
-- stessa visibilità/possibilità di completare la Scheda del primo
-- assegnatario — vedi i fix applicativi in calendario/actions.ts e
-- app/pose/actions.ts che accompagnano questa migrazione.
-- ============================================================

create table appuntamento_squadra (
  id uuid primary key default gen_random_uuid(),
  appuntamento_id uuid not null references appuntamenti(id) on delete cascade,
  tecnico_id uuid references persone(id) on delete cascade,
  tecnico_esterno_id uuid references tecnici_esterni(id) on delete cascade,
  creato_il timestamptz not null default now(),
  -- ★ come tecnico_id/tecnico_esterno_id su appuntamenti: mai entrambi
  -- valorizzati insieme, mai entrambi nulli — una riga è sempre UNA persona,
  -- interna o esterna.
  constraint appuntamento_squadra_un_assegnatario check (
    (tecnico_id is not null and tecnico_esterno_id is null)
    or (tecnico_id is null and tecnico_esterno_id is not null)
  )
);

create index on appuntamento_squadra (appuntamento_id);
create index on appuntamento_squadra (tecnico_id);
create index on appuntamento_squadra (tecnico_esterno_id);

-- ★ evita la stessa persona aggiunta due volte allo stesso appuntamento —
-- un indice unico su (appuntamento, chi), con "chi" ridotto a un solo
-- valore testuale perché un indice unico non può condizionarsi da solo su
-- "quale colonna delle due è valorizzata".
create unique index appuntamento_squadra_una_volta
  on appuntamento_squadra (appuntamento_id, coalesce(tecnico_id::text, tecnico_esterno_id::text));

alter table appuntamento_squadra enable row level security;

-- ★ stessa policy, permissiva quanto quella già in vigore su "appuntamenti"
-- stesso (migrazione 0004: "staff attivo legge/scrive/aggiorna
-- appuntamenti", nessun filtro per reparto/assegnatario — il Calendario
-- interno mostra già gli appuntamenti di tutti). pose.donewifi.it passa
-- sempre dalla service role (bypassa RLS), quindi non serve una policy per
-- "tecnico esterno" qui — il filtro "solo i tuoi interventi" per un
-- tecnico esterno resta applicativo, in app/pose/actions.ts.
create policy "staff attivo legge squadra appuntamenti" on appuntamento_squadra
  for select using (is_active_staff());
create policy "staff attivo scrive squadra appuntamenti" on appuntamento_squadra
  for insert with check (is_active_staff());
create policy "staff attivo elimina squadra appuntamenti" on appuntamento_squadra
  for delete using (is_active_staff());

notify pgrst, 'reload schema';
