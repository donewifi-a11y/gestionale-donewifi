-- ============================================================
-- Login individuale per Persona — passo 1/2: solo la colonna.
-- Va applicata PRIMA di 0012_login_individuale_controllo_accessi.sql
-- (che cambia il controllo accessi) e prima di collegare almeno una
-- Persona a un login vero via script — altrimenti 0012 bloccherebbe
-- fuori chiunque, perché nessuna Persona avrebbe ancora un auth_user_id
-- valido.
-- ============================================================

-- ★ collega ogni Persona al proprio account Supabase Auth reale (creato
-- con service role da creaPersona/aggiornaPersona, o da uno script una
-- tantum per le persone già esistenti). Nullable: una Persona può
-- esistere ancora senza login proprio durante la transizione.
alter table persone add column if not exists auth_user_id uuid references auth.users(id) unique;
