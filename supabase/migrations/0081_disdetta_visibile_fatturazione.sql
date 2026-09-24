-- non cancellare questa riga di commento

-- ============================================================
-- FIX — richiesta esplicita: "per i ticket di disdetta e ritiro, gli
-- stessi devono rimanere visibili e editabili anche dal reparto
-- fatturazione". Un Ticket di Disdetta nasce in reparto "Fatturazione",
-- ma fissaDataDismissioneDisdetta() (tickets/actions.ts) lo riassegna a
-- "Analisi Rete" per il ritiro apparati (vedi migrazione 0074) — da quel
-- momento persona_vede_ticket() (migrazione 0048) nascondeva il Ticket a
-- chi è SOLO Fatturazione (non anche Analisi Rete/admin/assegnatario
-- diretto): non un problema di UI, un vero blocco RLS in lettura E
-- scrittura, verificato sui dati reali (vedi query di controllo in fondo).
--
-- Estende persona_vede_ticket() con un terzo parametro (sottocategoria
-- della riga): un Ticket di Disdetta resta visibile/editabile anche da chi
-- ha "Fatturazione" tra i propri reparti, indipendentemente da dove sia
-- stato spostato il reparto responsabile — stessa idea già in uso per
-- l'assegnatario diretto (id = tecnico_riga), qui applicata al reparto
-- "di origine" invece che alla persona.
--
-- Come già in 0073 (stesso drift storico osservato: policy vive in
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

drop function if exists persona_vede_ticket(area_accesso, uuid);

create function persona_vede_ticket(reparto_riga area_accesso, tecnico_riga uuid, sottocategoria_riga text) returns boolean as $$
  select exists (
    select 1 from persone
    where auth_user_id = auth.uid()
      and attivo = true
      and (
        amministratore = true
        or reparto_riga = any(reparti)
        or id = tecnico_riga
        or (sottocategoria_riga = 'Disdetta' and 'Fatturazione' = any(reparti))
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
-- per SELECT e una per UPDATE (stesso controllo già usato in 0073).
-- select policyname, cmd, permissive, roles, qual, with_check
-- from pg_policies where schemaname = 'public' and tablename = 'tickets';
