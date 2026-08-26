-- ============================================================
-- Tecnici esterni: nuovo sistema pose.donewifi.it (2026-08-26,
-- richiesta esplicita: "semplificare la procedura per i tecnici esterni,
-- non passare dal gestionale ma fare un altro sistema").
--
-- Identità DELIBERATAMENTE separata da `persone` (staff interno): un
-- tecnico esterno non ha login condiviso, non ha reparti/permessi sul
-- gestionale, non compare nel selettore "Tu sei" né in Persone/Utenti —
-- ha solo un account fisso (email+password) per pose.donewifi.it, dove
-- vede i propri interventi e compila il rapportino. Stesso pattern
-- password di `persone` (migrazione 0006): hash con pgcrypto dentro
-- funzioni security definer, mai esposto al client.
--
-- `tecnico_esterno_id` su tickets/appuntamenti è un FK NULLABLE aggiunto
-- accanto a `tecnico_assegnato`/`tecnico_id` (che restano il tecnico
-- INTERNO) — stesso principio già usato per `cliente_esterno_id` su
-- richieste_clienti: si aggiunge un collegamento, non si sostituisce
-- quello esistente.
-- ============================================================
create table tecnici_esterni (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cognome text,
  telefono text,
  email text not null unique,
  password_hash text not null,
  attivo boolean not null default true,
  creato_il timestamptz not null default now()
);

alter table tickets add column tecnico_esterno_id uuid references tecnici_esterni(id);
alter table appuntamenti add column tecnico_esterno_id uuid references tecnici_esterni(id);

-- ★ `rapportini_intervento.creato_da` è `references persone(id)` (staff
-- interno) — un tecnico esterno non può comparire lì senza violare quella
-- FK. Colonna gemella nullable per lo stesso identico ruolo quando chi
-- compila è un tecnico esterno (le due restano mutuamente esclusive, mai
-- valorizzate insieme, stesso principio già usato per
-- otp_firma_cliente_un_riferimento nella migrazione 0051).
alter table rapportini_intervento add column creato_da_tecnico_esterno_id uuid references tecnici_esterni(id);

alter table tecnici_esterni enable row level security;
-- ★ pose.donewifi.it (login/dashboard/rapportino del tecnico) non passa MAI
-- da qui: solo Server Action con service role, che bypassa RLS. La SELECT
-- serve all'AREA STAFF del gestionale (elenco per assegnare un ticket a un
-- tecnico esterno dal dettaglio Ticket) — sola lettura, come `persone` dopo
-- l'indurimento della migrazione 0008: nessuna policy INSERT/UPDATE per
-- `authenticated`, creare/modificare un account passa solo da una Server
-- Action con service role che verifica `personaHaAccessoAdmin()` in
-- codice, non da una policy che non può sapere "la persona corrente è
-- admin" (vive in un cookie, non nella sessione Postgres).
create policy "staff attivo legge tecnici esterni" on tecnici_esterni for select using (is_active_staff());

create or replace function imposta_password_tecnico_esterno(p_id uuid, p_password text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
  update tecnici_esterni set password_hash = crypt(p_password, gen_salt('bf')) where id = p_id;
$$;

-- ★ il login avviene per email (il tecnico non conosce il proprio uuid) —
-- a differenza di verifica_password_persona() (che riceve già l'id scelto
-- dal selettore "Tu sei"), questa funzione cerca prima l'account e poi
-- verifica la password, tornando l'id solo se entrambi corrispondono.
create or replace function verifica_login_tecnico_esterno(p_email text, p_password text)
returns uuid
language sql
security definer
set search_path = public, extensions
as $$
  select id from tecnici_esterni
  where lower(email) = lower(p_email)
    and attivo = true
    and password_hash = crypt(p_password, password_hash);
$$;

revoke all on function imposta_password_tecnico_esterno(uuid, text) from public;
revoke all on function verifica_login_tecnico_esterno(text, text) from public;
-- nessun grant a `authenticated`/`anon`: chiamate solo da Server Action
-- con service role (che bypassa i grant, come ogni altra scrittura service
-- role di questo progetto).
