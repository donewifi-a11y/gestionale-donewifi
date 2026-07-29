-- ============================================================
-- Persone: livello di accesso e password propri, distinti
-- dall'account condiviso (staff) usato per il login.
-- - area_accesso: cosa può fare QUESTA persona nel gestionale
--   (Utenti/Persone visibili solo a "Tutto"/"Admin", come oggi).
-- - password_hash: PIN facoltativo per "diventare" questa persona dal
--   selettore "Tu sei" — impedisce che chiunque usi il login condiviso
--   possa scegliersi come un collega senza saperne la password.
--   Nessuna password impostata = nessuna richiesta al cambio persona
--   (comportamento invariato per chi non ne ha bisogno).
-- ============================================================
alter table persone add column if not exists area_accesso area_accesso not null default 'Analisi Rete';
alter table persone add column if not exists password_hash text;

-- ── funzioni per impostare/verificare la password senza mai esporre
-- l'hash al client (le tabelle si leggono via RLS, l'hash resta dentro
-- queste funzioni "security definer") ────────────────────────────────
create or replace function imposta_password_persona(p_persona_id uuid, p_password text)
returns void
language sql
security definer
set search_path = public
as $$
  update persone set password_hash = crypt(p_password, gen_salt('bf')) where id = p_persona_id;
$$;

create or replace function verifica_password_persona(p_persona_id uuid, p_password text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select case
    when not exists (select 1 from persone where id = p_persona_id and attivo = true) then false
    when (select password_hash from persone where id = p_persona_id) is null then true
    else (select password_hash = crypt(p_password, password_hash) from persone where id = p_persona_id)
  end;
$$;

revoke all on function imposta_password_persona(uuid, text) from public;
revoke all on function verifica_password_persona(uuid, text) from public;
grant execute on function imposta_password_persona(uuid, text) to authenticated;
grant execute on function verifica_password_persona(uuid, text) to authenticated;
