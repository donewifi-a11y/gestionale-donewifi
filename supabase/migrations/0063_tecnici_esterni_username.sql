-- ★ FIX (2026-08-26, richiesta esplicita) — "per i tecnici userei un nome
-- utente che definiamo noi e la password la segniamo noi": il login era
-- per email con password provvisoria generata a caso (stesso schema di
-- Persone/reimposta password), ma per un tecnico esterno l'admin preferisce
-- scegliere lui username e password, non riceverne uno auto-generato.
--
-- `email` resta come contatto facoltativo (come `telefono`), non più
-- l'identificativo di accesso. Nessuna riga esistente da migrare (tabella
-- vuota, verificato prima di questa migrazione).
alter table tecnici_esterni add column username text;
alter table tecnici_esterni alter column username set not null;
alter table tecnici_esterni add constraint tecnici_esterni_username_key unique (username);
alter table tecnici_esterni drop constraint if exists tecnici_esterni_email_key;
alter table tecnici_esterni alter column email drop not null;

-- ★ stessa funzione, login per username invece che per email.
create or replace function verifica_login_tecnico_esterno(p_username text, p_password text)
returns uuid
language sql
security definer
set search_path = public, extensions
as $$
  select id from tecnici_esterni
  where lower(username) = lower(p_username)
    and attivo = true
    and password_hash = crypt(p_password, password_hash);
$$;
