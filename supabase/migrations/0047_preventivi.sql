-- ============================================================
-- Preventivi — righe strutturate (voci da Tariffe/Materiali con prezzo e
-- quantità, totale calcolato), creati da una schermata dedicata "Nuovo
-- Preventivo" invece che sempre a partire da una Segnalazione: il cliente
-- può essere già esistente (collegato via segnalazione_id o
-- cliente_esterno_id, per comparire nella sua scheda) oppure un contatto
-- nuovo inserito a mano (cliente_nome/telefono/email in chiaro, come
-- "istantanea" — non cambia se il cliente aggiorna poi i suoi dati altrove).
-- ============================================================
create table preventivi (
  id uuid primary key default gen_random_uuid(),
  numero serial unique,
  cliente_nome text not null,
  cliente_telefono text,
  cliente_email text,
  tipologia_cliente text not null default 'Privato' check (tipologia_cliente in ('Privato', 'Azienda')),
  segnalazione_id uuid references segnalazioni(id) on delete set null,
  cliente_esterno_id integer references clienti_esterni(id) on delete set null,
  righe jsonb not null default '[]'::jsonb,
  totale numeric not null default 0,
  note text,
  stato text not null default 'Bozza' check (stato in ('Bozza', 'Inviato', 'Approvato', 'Rifiutato')),
  inviato_il timestamptz,
  risposto_il timestamptz,
  operatore_id uuid references staff(id),
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

alter table preventivi enable row level security;
create policy "staff attivo legge preventivi" on preventivi for select using (is_active_staff());
create policy "staff attivo scrive preventivi" on preventivi for insert with check (is_active_staff());
create policy "staff attivo aggiorna preventivi" on preventivi for update using (is_active_staff());

do $$ begin
  alter publication supabase_realtime add table preventivi;
exception when duplicate_object then null;
end $$;

-- ============================================================
-- Approvazione preventivo — stesso link monouso via email già usato per
-- contratti/interventi (token_approvazione), generalizzato a un terzo
-- riferimento possibile. A differenza di contratto/intervento (solo
-- "Approva"), il preventivo espone anche un rifiuto esplicito: la route
-- pubblica riceve quale dei due pulsanti è stato premuto e scrive
-- direttamente `preventivi.stato` ('Approvato'/'Rifiutato'), il token
-- resta comunque monouso (cancellato subito dopo, come gli altri due casi).
-- ============================================================
alter table token_approvazione add column if not exists preventivo_id uuid references preventivi(id) on delete cascade;

alter table token_approvazione drop constraint if exists token_approvazione_un_riferimento;
alter table token_approvazione add constraint token_approvazione_un_riferimento check (
  (ticket_id is not null)::int + (segnalazione_id is not null)::int + (preventivo_id is not null)::int = 1
);

alter table token_approvazione drop constraint if exists token_approvazione_origine_check;
alter table token_approvazione add constraint token_approvazione_origine_check check (
  origine in ('intervento', 'contratto', 'preventivo')
);

-- ★ anche storico.origine (0001_init.sql) ha il proprio check separato,
-- finora solo 'ticket'/'segnalazione' — senza questo, ogni insert in
-- storico con origine='preventivo' (creazione/invio/eliminazione) fallisce.
alter table storico drop constraint if exists storico_origine_check;
alter table storico add constraint storico_origine_check check (
  origine in ('ticket', 'segnalazione', 'preventivo')
);
