-- ★ Log delle integrazioni esterne (Email/Telegram/Google Calendar) — oggi
-- ogni invio fallito viene inghiottito in silenzio (principio corretto per
-- non bloccare l'operatore, vedi commenti in email.ts/telegram.ts), ma
-- questo significa che un problema di configurazione (vedi il caso
-- CRON_SECRET incollato nel campo sbagliato su Vercel) può restare
-- invisibile per giorni. Questa tabella registra ok/errore per ogni invio,
-- letta da una pagina di stato riservata admin (/sistema) invece che
-- scoprirla per caso.
create table if not exists integrazioni_log (
  id uuid primary key default gen_random_uuid(),
  servizio text not null check (servizio in ('email', 'telegram', 'google_calendar')),
  esito text not null check (esito in ('ok', 'errore')),
  dettaglio text,
  creato_il timestamptz not null default now()
);

create index if not exists integrazioni_log_servizio_creato_il_idx
  on integrazioni_log (servizio, creato_il desc);

alter table integrazioni_log enable row level security;
-- nessuna policy: solo la service role (server-side, dopo verifica admin
-- nell'azione che legge la pagina /sistema) può leggerla/scriverla —
-- stesso pattern già in uso per altre tabelle interne-only del progetto.

-- ★ promemoria automatico quando un contratto resta "in attesa di
-- approvazione" per troppi giorni: questa colonna evita di rimandare lo
-- stesso avviso in Chat ad ogni passaggio del cron (una volta al giorno al
-- massimo), invece di dover dedurre "quando è stato inviato l'ultimo
-- promemoria" da una ricerca nello Storico.
alter table segnalazioni
  add column if not exists ultimo_promemoria_approvazione_il timestamptz;
