-- ============================================================
-- FIX — 0072 non bastava: dopo averla applicata, l'UPDATE si comporta
-- correttamente (verificato con un nuovo test reale) ma l'INSERT resta
-- bloccato per un Ticket di reparto diverso dal proprio, identico a prima.
--
-- Spiegazione più probabile: 0072 faceva `drop policy if exists "staff
-- attivo scrive tickets"` — un nome preciso. Se il drift storico ha
-- aggiunto una SECONDA policy di INSERT sotto un nome diverso (specie se
-- RESTRICTIVE, non PERMISSIVE: le policy restrictive si combinano in AND
-- con tutte le altre, non in OR — bastano una permissiva corretta e una
-- restrittiva col controllo di reparto per bloccare comunque tutto),
-- 0072 l'ha lasciata intatta perché il nome non combaciava.
--
-- Qui non si indovina il nome: si elimina DINAMICAMENTE ogni policy di
-- INSERT esistente su "tickets", permissiva o restrittiva che sia, e se
-- ne crea una sola, pulita. Stesso trattamento anche per UPDATE, per
-- sicurezza, anche se il test più recente la dava già corretta dopo 0072.
-- ============================================================

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'tickets' and cmd = 'INSERT'
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

create policy "staff attivo scrive tickets" on tickets
  for insert with check (is_active_staff());

create policy "staff vede e aggiorna tickets del proprio reparto" on tickets
  for update using (persona_vede_ticket(reparto, tecnico_assegnato));

-- Verifica di controllo — dopo aver incollato ed eseguito questo file,
-- esegui anche questa query da sola: deve restituire ESATTAMENTE una riga
-- per INSERT e una per UPDATE. Se ne trovi di più, c'è ancora una policy
-- nascosta da qualche altra parte (es. su un ruolo diverso da "authenticated"),
-- non coperta da questo file.
-- select policyname, cmd, permissive, roles, qual, with_check
-- from pg_policies where schemaname = 'public' and tablename = 'tickets';
