-- Le due schede di lavoro del vecchio gestionale (Installazione.html,
-- InterventoLoco.html) tornano qui, scelte automaticamente in base al
-- `tipo_servizio` dell'appuntamento (migrazione 0037) invece che da due
-- pulsanti separati in Agenda. Sostituiscono il rapportino generico
-- quando il Ticket ha un appuntamento collegato; il rapportino generico
-- resta per i Ticket chiusi senza passare da un appuntamento a Calendario.

-- ── MATERIALI DI MAGAZZINO — ex foglio "Listino" del vecchio gestionale ──
-- Stessa idea delle Tariffe (catalogo con prezzo, gestito dallo staff),
-- ma per i materiali fisici usati in installazioni/interventi (cavi,
-- alimentatori, antenne...) invece che per i piani venduti al cliente.
create table if not exists materiali_magazzino (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  prezzo_unitario numeric not null default 0,
  unita_misura text not null default 'pz',
  comodato_uso boolean not null default false,
  attivo boolean not null default true,
  ordine integer not null default 0,
  creato_il timestamptz not null default now()
);

alter table materiali_magazzino enable row level security;
drop policy if exists "staff attivo legge materiali" on materiali_magazzino;
create policy "staff attivo legge materiali" on materiali_magazzino for select using (is_active_staff());
drop policy if exists "staff attivo scrive materiali" on materiali_magazzino;
create policy "staff attivo scrive materiali" on materiali_magazzino for insert with check (is_active_staff());
drop policy if exists "staff attivo aggiorna materiali" on materiali_magazzino;
create policy "staff attivo aggiorna materiali" on materiali_magazzino for update using (is_active_staff());
drop policy if exists "staff attivo elimina materiali" on materiali_magazzino;
create policy "staff attivo elimina materiali" on materiali_magazzino for delete using (is_active_staff());

-- ── SCHEDE DI LAVORO — una per appuntamento, tipo deciso da tipo_servizio ──
create table if not exists schede_lavoro (
  id uuid primary key default gen_random_uuid(),
  appuntamento_id uuid not null unique references appuntamenti(id) on delete cascade,
  ticket_id uuid references tickets(id) on delete set null,
  tipo tipo_servizio_appuntamento not null,

  -- campi comuni a entrambe le schede
  esito text,
  note text,
  importo_fatturato numeric,
  -- materiali usati: istantanea al momento dell'uso (nome/prezzo possono
  -- cambiare dopo nel catalogo senza alterare una scheda già salvata) —
  -- stessa idea già in uso per rapportini_intervento.foto.
  materiali jsonb not null default '[]',
  foto jsonb not null default '[]',
  firma_cliente_url text,
  firma_tecnico_url text,

  -- solo Nuova installazione (Struttura/Cablaggio/Radio-CPE/Collaudo)
  supporto text,
  posizione text,
  tipo_cavo text,
  metri_cavo numeric,
  bts text,
  modello_cpe text,
  mac text,
  vlan text,
  rssi numeric,
  snr numeric,
  router text,
  ping_ms numeric,
  download_mbps numeric,
  upload_mbps numeric,

  -- solo Lavorazione tecnica (interventi rapidi selezionati)
  interventi_eseguiti text[] not null default '{}',

  creato_da uuid references persone(id),
  creato_il timestamptz not null default now()
);

create index if not exists schede_lavoro_ticket_id_idx on schede_lavoro (ticket_id);

alter table schede_lavoro enable row level security;
drop policy if exists "staff attivo legge schede lavoro" on schede_lavoro;
create policy "staff attivo legge schede lavoro" on schede_lavoro for select using (is_active_staff());
drop policy if exists "staff attivo scrive schede lavoro" on schede_lavoro;
create policy "staff attivo scrive schede lavoro" on schede_lavoro for insert with check (is_active_staff());
