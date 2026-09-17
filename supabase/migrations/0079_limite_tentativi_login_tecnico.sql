-- non cancellare questa riga di commento

-- ============================================================
-- NUOVA — "controllo d'oro" completo del gestionale, priorità 3: il login
-- dei tecnici esterni (pose.donewifi.it) è l'unico dei due login di questo
-- progetto che NON passa da Supabase Auth (verifica_login_tecnico_esterno,
-- una funzione RPC su una password_hash gestita a mano) — a differenza del
-- login principale e del login staff su pose (entrambi Supabase Auth, che
-- applica già un limite di frequenza a livello di piattaforma), questo non
-- aveva alcun limite di tentativi. Su un nome utente breve e prevedibile è
-- un rischio concreto, anche se contenuto (accesso interno, non pubblico).
--
-- Un blocco temporaneo per nome utente dopo troppi tentativi falliti
-- ravvicinati, non per IP (un ufficio con più tecnici dietro lo stesso NAT
-- si bloccherebbe a vicenda) — nessuna RLS: la tabella si legge/scrive
-- solo dalla service role, mai dal client.
-- ============================================================
create table if not exists tentativi_login_tecnico (
  username text primary key,
  tentativi_falliti integer not null default 0,
  ultimo_tentativo_il timestamptz not null default now(),
  bloccato_fino_il timestamptz
);

notify pgrst, 'reload schema';
