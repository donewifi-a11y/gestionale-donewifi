-- non cancellare questa riga di commento

-- ============================================================
-- FIX — richiesta esplicita: "l'utente antonietta non vede il cliente
-- marcarini, la posa, puoi verificare" — verificato: Antonietta Favre è
-- staff interno con un solo reparto, "Fatturazione"; il Ticket #29
-- "Alessandro Marcarini" (installazione completata il 2026-10-05) è
-- reparto "Analisi Rete", sottocategoria "Pianificazione installazione" —
-- persona_vede_ticket() (migrazione 0081) nascondeva il Ticket a chi è
-- SOLO Fatturazione, stesso identico blocco RLS già risolto UNA VOLTA per
-- le Disdette ("per i ticket di disdetta e ritiro, gli stessi devono
-- rimanere visibili e editabili anche dal reparto fatturazione") ma mai
-- esteso alle installazioni — Fatturazione ha lo stesso bisogno di vedere
-- una posa per poterla fatturare.
--
-- Estende la whitelist di sottocategorie già introdotta in 0081 da sola
-- ("Disdetta") a tre valori: "Disdetta", "Pianificazione installazione",
-- "Nuovo contratto" (le due sottocategorie di nuova attivazione, scelta
-- esplicita dell'utente — non solo "Pianificazione installazione" del
-- caso segnalato, anche "Nuovo contratto" per coerenza).
--
-- Come già in 0073/0081 (stesso drift storico osservato: policy vive in
-- produzione possono non coincidere col nome tracciato qui) — si eliminano
-- DINAMICAMENTE tutte le policy SELECT/UPDATE esistenti su "tickets" prima
-- di ricrearle, invece di indovinare un nome fisso.
-- ============================================================

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'tickets' and cmd = 'SELECT'
  loop
    execute format('drop policy %I on tickets', pol.policyname);
  end loop;

  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'tickets' and cmd = 'UPDATE'
  loop
    execute format('drop policy %I on tickets', pol.policyname);
  end loop;
end $$;

drop function if exists persona_vede_ticket(area_accesso, uuid, text);

create function persona_vede_ticket(reparto_riga area_accesso, tecnico_riga uuid, sottocategoria_riga text) returns boolean as $$
  select exists (
    select 1 from persone
    where auth_user_id = auth.uid()
      and attivo = true
      and (
        amministratore = true
        or reparto_riga = any(reparti)
        or id = tecnico_riga
        or (
          sottocategoria_riga in ('Disdetta', 'Pianificazione installazione', 'Nuovo contratto')
          and 'Fatturazione' = any(reparti)
        )
      )
  );
$$ language sql stable security definer;

create policy "staff vede tickets del proprio reparto" on tickets
  for select using (persona_vede_ticket(reparto, tecnico_assegnato, sottocategoria));

create policy "staff vede e aggiorna tickets del proprio reparto" on tickets
  for update using (persona_vede_ticket(reparto, tecnico_assegnato, sottocategoria));

notify pgrst, 'reload schema';

-- Verifica di controllo — dopo aver incollato ed eseguito questo file,
-- esegui anche questa query da sola: deve restituire ESATTAMENTE una riga
-- per SELECT e una per UPDATE (stesso controllo già usato in 0073/0081).
-- select policyname, cmd, permissive, roles, qual, with_check
-- from pg_policies where schemaname = 'public' and tablename = 'tickets';
