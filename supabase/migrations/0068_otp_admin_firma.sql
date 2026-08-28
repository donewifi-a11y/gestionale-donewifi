-- ★ NUOVA (2026-08-28, richiesta esplicita: "dobbiamo fare il modo di
-- bypassare nel rapporto di lavoro otp del cliente facendo richiedere con
-- otp agli amministratori") — quando il cliente non può confermare di
-- persona (irraggiungibile, assente...), un amministratore autorizza al
-- posto suo: stesso principio del codice OTP del cliente (migrazioni 0050/
-- 0051), ma il codice arriva in Chat interna a tutti gli amministratori
-- attivi (richiesta esplicita: "arriva su chat l'otp... all'amministratore")
-- invece che via email al cliente. Tabella dedicata, stesso schema di
-- otp_firma_cliente, invece di riusarla: qui non c'è un'email del cliente,
-- e serve un campo in più per registrare quale amministratore ha davvero
-- fornito il codice al tecnico (chiesto dopo la verifica, non è detto sia
-- deducibile dal codice stesso visto che arriva a tutti insieme).
create table if not exists otp_admin_firma (
  id uuid primary key default gen_random_uuid(),
  appuntamento_id uuid references appuntamenti(id) on delete cascade,
  ticket_id uuid references tickets(id) on delete cascade,
  codice_hash text not null,
  tentativi int not null default 0,
  creato_il timestamptz not null default now(),
  scaduto_il timestamptz not null,
  verificato_il timestamptz,
  -- ★ l'amministratore indicato dal tecnico come chi gli ha dato il
  -- codice (raccolto subito dopo la verifica, un select — non un motivo
  -- scritto a mano, non richiesto esplicitamente).
  admin_id uuid references persone(id)
);

alter table otp_admin_firma drop constraint if exists otp_admin_firma_un_riferimento;
alter table otp_admin_firma add constraint otp_admin_firma_un_riferimento check (
  (appuntamento_id is not null)::int + (ticket_id is not null)::int = 1
);

-- ★ nessuna policy RLS: si legge/scrive solo da Server Action con service
-- role (staff già verificato attivo lì) — stessa scelta di otp_firma_cliente.
alter table otp_admin_firma enable row level security;

-- ★ "otp_admin" si aggiunge come terzo metodo possibile, accanto a
-- otp_email/link_email (il cliente in prima persona) — mai un sostituto
-- del cliente stesso nella colonna email: firma_cliente_email resta null
-- per questo metodo, il nome dell'amministratore va nella nuova colonna
-- dedicata.
--
-- ★ solo schede_lavoro, non rapportini_intervento: il Rapportino di
-- chiusura Ticket non chiede più conferma del cliente da tempo (giro
-- "chiusura senza conferma obbligatoria del cliente", 2026-08-27) —
-- rapportini_intervento.firma_metodo è già sempre null lì, estendere
-- anche quel vincolo sarebbe schema inutilizzato.
alter table schede_lavoro drop constraint if exists schede_lavoro_firma_cliente_metodo_check;
alter table schede_lavoro add constraint schede_lavoro_firma_cliente_metodo_check
  check (firma_cliente_metodo in ('otp_email', 'link_email', 'otp_admin'));
alter table schede_lavoro add column if not exists firma_cliente_admin_id uuid references persone(id);
