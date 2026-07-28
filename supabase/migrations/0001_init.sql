-- ============================================================
-- Gestionale Done Wifi — schema nucleo
-- Mappato 1:1 dai fogli del gestionale precedente (Google Apps Script /
-- Google Sheets): staff (ex "Configurazione"), tickets (ex "Ticket"),
-- segnalazioni (ex "Segnalazioni Nuovo Cliente"), richieste_clienti
-- (ex "Richieste Clienti"), storico (ex "Storico Modifiche").
-- ============================================================

create extension if not exists "pgcrypto";

-- ── ENUM ──────────────────────────────────────────────────────
create type area_accesso as enum ('Tutto', 'Admin', 'Analisi Rete', 'Commerciale', 'Fatturazione');
create type stato_ticket as enum ('Da gestire', 'In lavorazione', 'In attesa', 'Completato', 'Annullato');
create type priorita_ticket as enum ('Urgente', 'Normale', 'Bassa');
create type stato_segnalazione as enum ('Da Contattare', 'In Contatto', 'Gestione Cliente', 'Trasmessa');
create type copertura_segnalazione as enum ('si', 'no', 'daVerificare');

-- ── STAFF (ex foglio "Configurazione") ───────────────────────
create table staff (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  nome text,
  area_accesso area_accesso not null default 'Analisi Rete',
  permessi text[] not null default '{}',
  visibilita text not null default 'Tutti' check (visibilita in ('Tutti', 'Solo assegnati')),
  attivo boolean not null default true,
  creato_il timestamptz not null default now()
);

-- ── SEGNALAZIONI (ex foglio "Segnalazioni Nuovo Cliente") ────
-- ★ NUOVA — a differenza del sistema precedente, tipologia_cliente e
-- profilo_internet vengono scritti automaticamente qui non appena il
-- cliente li sceglie dal modulo pubblico (vedi API /api/richiesta-dati):
-- nel gestionale Apps Script questo collegamento era rotto (cercava
-- l'ID in un altro foglio) e lo staff doveva reinserirli a mano.
create table segnalazioni (
  id uuid primary key default gen_random_uuid(),
  numero serial unique,
  data timestamptz not null default now(),
  nome text not null,
  telefono text not null,
  email text,
  via text not null,
  civico text not null,
  comune text not null,
  cap text not null,
  copertura copertura_segnalazione not null default 'daVerificare',
  note text,
  stato stato_segnalazione not null default 'Da Contattare',
  operatore_id uuid references staff(id),
  tipologia_cliente text,
  profilo_internet text,
  contratto_pdf_url text,
  documenti_richiesti_at timestamptz,
  dati_ricevuti_at timestamptz,
  aggiornato_il timestamptz not null default now()
);

-- ── TICKETS (ex foglio "Ticket") ──────────────────────────────
create table tickets (
  id uuid primary key default gen_random_uuid(),
  numero serial unique,
  data_creazione timestamptz not null default now(),
  cliente text not null,
  telefono text,
  email text,
  indirizzo text,
  categoria text not null,
  problema text,
  stato stato_ticket not null default 'Da gestire',
  priorita priorita_ticket not null default 'Normale',
  reparto area_accesso not null,
  tecnico_assegnato uuid references staff(id),
  note text,
  tipologia_cliente text,
  profilo_internet text,
  contratto_pdf_url text,
  segnalazione_id uuid references segnalazioni(id),
  creato_da uuid references staff(id),
  aggiornato_il timestamptz not null default now()
);

-- ── RICHIESTE CLIENTI (dati/documenti inviati dal modulo pubblico) ──
create table richieste_clienti (
  id uuid primary key default gen_random_uuid(),
  data timestamptz not null default now(),
  tipo_richiesta text not null,
  cliente text,
  segnalazione_id uuid references segnalazioni(id),
  dettagli jsonb not null default '{}',
  documenti jsonb not null default '[]',
  stato text not null default 'Da Lavorare'
);

-- ── STORICO (log unico, ex "Storico Modifiche") ──────────────
create table storico (
  id uuid primary key default gen_random_uuid(),
  data timestamptz not null default now(),
  origine text not null check (origine in ('ticket', 'segnalazione')),
  riferimento_id uuid not null,
  operazione text not null,
  valore_prima text,
  valore_dopo text,
  operatore_id uuid references staff(id)
);

create index on tickets (stato);
create index on tickets (reparto);
create index on tickets (tecnico_assegnato);
create index on segnalazioni (stato);
create index on storico (origine, riferimento_id);

-- ============================================================
-- RLS — solo staff attivo autenticato legge/scrive; il modulo pubblico
-- di Richiesta Dati (nessun login, come nel gestionale precedente) passa
-- da una API route server-side con la service key, che bypassa RLS in
-- modo controllato invece di aprire una policy anonima diretta.
-- ============================================================
alter table staff enable row level security;
alter table tickets enable row level security;
alter table segnalazioni enable row level security;
alter table richieste_clienti enable row level security;
alter table storico enable row level security;

create function is_active_staff() returns boolean as $$
  select exists (select 1 from staff where id = auth.uid() and attivo = true);
$$ language sql stable security definer;

create policy "staff legge il proprio profilo" on staff for select using (id = auth.uid());

create policy "staff attivo legge tickets" on tickets for select using (is_active_staff());
create policy "staff attivo scrive tickets" on tickets for insert with check (is_active_staff());
create policy "staff attivo aggiorna tickets" on tickets for update using (is_active_staff());

create policy "staff attivo legge segnalazioni" on segnalazioni for select using (is_active_staff());
create policy "staff attivo scrive segnalazioni" on segnalazioni for insert with check (is_active_staff());
create policy "staff attivo aggiorna segnalazioni" on segnalazioni for update using (is_active_staff());

create policy "staff attivo legge richieste" on richieste_clienti for select using (is_active_staff());

create policy "staff attivo legge storico" on storico for select using (is_active_staff());
create policy "staff attivo scrive storico" on storico for insert with check (is_active_staff());