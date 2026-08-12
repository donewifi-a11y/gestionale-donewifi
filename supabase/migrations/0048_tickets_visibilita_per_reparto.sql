-- ============================================================
-- FIX SICUREZZA — la policy di lettura sui Ticket ("staff attivo legge
-- tickets") controllava solo che la persona fosse un membro dello staff
-- attivo, MAI il reparto: chiunque loggato vedeva TUTTI i ticket, anche
-- quelli riservati a un reparto diverso dal proprio (es. Fatturazione
-- vedeva i ticket di Analisi Rete). Da qui in poi si vede un Ticket solo
-- se: si è amministratore, il reparto del Ticket è tra i propri reparti,
-- oppure il Ticket è assegnato proprio a sé (caso raro di assegnazione
-- fuori reparto, non deve sparire per il tecnico assegnato).
--
-- Nessuna modifica alle policy di insert/update: restano aperte a
-- qualunque staff attivo (creare/riassegnare un Ticket in un altro
-- reparto resta un'operazione valida, come già oggi con
-- cambiaRepartoTicket()) — qui si restringe solo la LETTURA.
-- ============================================================
create or replace function persona_vede_ticket(reparto_riga area_accesso, tecnico_riga uuid) returns boolean as $$
  select exists (
    select 1 from persone
    where auth_user_id = auth.uid()
      and attivo = true
      and (amministratore = true or reparto_riga = any(reparti) or id = tecnico_riga)
  );
$$ language sql stable security definer;

drop policy if exists "staff attivo legge tickets" on tickets;
create policy "staff vede tickets del proprio reparto" on tickets
  for select using (persona_vede_ticket(reparto, tecnico_assegnato));
