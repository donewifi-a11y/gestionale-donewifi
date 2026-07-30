-- ============================================================
-- Login individuale per Persona — passo 2/2: cambia cosa vuol dire
-- "accesso valido".
--
-- ★★★ APPLICARE SOLO DOPO aver collegato ALMENO UNA Persona attiva a un
-- auth_user_id reale (0011 + script di collegamento) — altrimenti questa
-- migrazione blocca fuori dal gestionale chiunque, nessuno escluso.
-- ============================================================

-- ★ FIX CONCETTUALE — questa funzione decideva l'accesso guardando la
-- tabella "staff" (l'account condiviso). Da qui in poi un accesso valido
-- è un accesso Persona individuale: la ridefiniamo per controllare
-- "persone" invece — tutte le policy RLS esistenti la richiamano già per
-- nome, quindi ereditano il nuovo comportamento senza doverle riscrivere
-- una per una.
create or replace function is_active_staff() returns boolean as $$
  select exists (
    select 1 from persone where auth_user_id = auth.uid() and attivo = true
  );
$$ language sql stable security definer;
