-- ============================================================
-- Notifica in Chat quando un cliente RISPONDE a una delle email inviate
-- dal gestionale (Commerciale/Fatturazione/Assistenza) — un job esterno
-- (cron-job.org, il piano Vercel Hobby di questo progetto ha già i 2 cron
-- nativi occupati) controlla periodicamente le 3 caselle via IMAP e avvisa
-- il reparto competente. Qui solo lo stato "fin dove ho già controllato"
-- per casella, per non rileggere/notificare due volte la stessa email.
-- ============================================================
create table if not exists imap_controllo_email (
  reparto area_accesso primary key,
  ultimo_uid bigint not null default 0,
  ultimo_controllo_il timestamptz
);

alter table imap_controllo_email enable row level security;
-- ★ nessuna policy: si legge/scrive solo dalla route cron con service role,
-- stessa logica già usata per token_approvazione.
