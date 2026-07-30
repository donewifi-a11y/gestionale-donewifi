-- Promozioni/sconti sulle Tariffe (ex sezione "Promo" di Commerciale.html,
-- mai arrivata nel nuovo gestionale — la pagina Tariffe qui aveva solo il
-- listino base). Lo stato (Attiva/Programmata/Scaduta) non si salva: si
-- ricalcola sempre dalle date, come nel vecchio gestionale.

create table if not exists promozioni (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('Sconto % / mese', 'Sconto fisso / mese', 'Mesi omaggio', 'Attivazione gratuita')),
  valore numeric,
  tariffe_ids uuid[] not null default '{}',
  da date not null,
  a date not null,
  codice text,
  creato_il timestamptz not null default now()
);

alter table promozioni enable row level security;
drop policy if exists "staff attivo legge promozioni" on promozioni;
create policy "staff attivo legge promozioni" on promozioni for select using (is_active_staff());
drop policy if exists "staff attivo scrive promozioni" on promozioni;
create policy "staff attivo scrive promozioni" on promozioni for insert with check (is_active_staff());
drop policy if exists "staff attivo aggiorna promozioni" on promozioni;
create policy "staff attivo aggiorna promozioni" on promozioni for update using (is_active_staff());
drop policy if exists "staff attivo elimina promozioni" on promozioni;
create policy "staff attivo elimina promozioni" on promozioni for delete using (is_active_staff());
