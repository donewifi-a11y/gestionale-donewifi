-- ============================================================
-- Migrazione funzioni dal vecchio gestionale (Apps Script), aggiornate
-- e semplificate: rapportino di chiusura intervento, catalogo tariffe,
-- e collegamento delle Richieste Clienti anche ai Ticket (non solo alle
-- Segnalazioni, dato che Cambio IBAN/Anagrafica/Trasferimento/Subentro
-- partono spesso da un cliente già attivo con un Ticket aperto).
-- ============================================================

-- ── RAPPORTINO DI CHIUSURA INTERVENTO (ex Installazione/Lavorazione/
-- InterventoLoco.html + generaSchedaPDF/generaSchedaLavoro) ─────────
-- ★ Semplificato: invece di generare un PDF lato server, il rapportino
-- resta un record leggibile a schermo con una vista stampabile (il
-- browser genera il PDF con "Stampa" → "Salva come PDF") — stesso
-- risultato per il cliente, senza una libreria di generazione PDF in più.
create table if not exists rapportini_intervento (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references tickets(id) on delete cascade,
  esito text not null,
  lavori_svolti text,
  materiali text,
  firma_url text,
  foto jsonb not null default '[]',
  creato_da uuid references persone(id),
  creato_il timestamptz not null default now()
);

alter table rapportini_intervento enable row level security;
drop policy if exists "staff attivo legge rapportini" on rapportini_intervento;
create policy "staff attivo legge rapportini" on rapportini_intervento for select using (is_active_staff());
drop policy if exists "staff attivo scrive rapportini" on rapportini_intervento;
create policy "staff attivo scrive rapportini" on rapportini_intervento for insert with check (is_active_staff());

-- ── TARIFFE (ex foglio Tariffe, gestito da Commerciale.html) ────────
-- ★ Semplificato: una sola tabella tariffe attive, niente più fogli
-- "prodotti" separati — il catalogo che il cliente vede nel form
-- pubblico "Nuovo Contratto" è direttamente quello gestito qui.
create table if not exists tariffe (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipologia_cliente text not null check (tipologia_cliente in ('Privato', 'Azienda', 'Tutti')),
  velocita text,
  prezzo_mensile numeric,
  descrizione text,
  attivo boolean not null default true,
  ordine integer not null default 0,
  creato_il timestamptz not null default now()
);

alter table tariffe enable row level security;
drop policy if exists "staff attivo legge tariffe" on tariffe;
create policy "staff attivo legge tariffe" on tariffe for select using (is_active_staff());
drop policy if exists "staff attivo scrive tariffe" on tariffe;
create policy "staff attivo scrive tariffe" on tariffe for insert with check (is_active_staff());
drop policy if exists "staff attivo aggiorna tariffe" on tariffe;
create policy "staff attivo aggiorna tariffe" on tariffe for update using (is_active_staff());
drop policy if exists "staff attivo elimina tariffe" on tariffe;
create policy "staff attivo elimina tariffe" on tariffe for delete using (is_active_staff());
-- letta anche dal form pubblico (nessun login) tramite la route API con service role, non da qui.

-- ── RICHIESTE CLIENTI — collegamento anche ai Ticket ────────────────
-- Cambio IBAN/Anagrafica/Trasferimento/Subentro partono spesso da un
-- cliente già attivo (Ticket), non da una nuova Segnalazione.
alter table richieste_clienti add column if not exists ticket_id uuid references tickets(id);
create index if not exists richieste_clienti_ticket_id_idx on richieste_clienti (ticket_id);

-- ★ FIX — mancava una policy UPDATE su richieste_clienti (la 0001 aveva
-- solo la SELECT): senza questa, cambiare stato da "Da Lavorare" a
-- "Lavorata" nella nuova bacheca Richieste Clienti sarebbe un no-op
-- silenzioso con il client normale, come già successo con "staff".
drop policy if exists "staff attivo aggiorna richieste" on richieste_clienti;
create policy "staff attivo aggiorna richieste" on richieste_clienti for update using (is_active_staff());
