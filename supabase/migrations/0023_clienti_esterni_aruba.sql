-- Anagrafica clienti importata dal database Aruba (md_archivio_clienti +
-- anagrafiche, unite per CF/PIVA), sincronizzata una volta al giorno da un
-- cron via un piccolo "ponte" PHP ospitato sullo stesso hosting Aruba
-- (il database Aruba non è raggiungibile direttamente da qui). Fonte di
-- verità = Aruba: il gestionale la legge soltanto, non la modifica mai a
-- mano — ogni scrittura verrebbe persa alla sincronizzazione successiva.

create table if not exists clienti_esterni (
  id integer primary key,
  nome text,
  cognome text,
  ragionesociale text,
  codice_fiscale text,
  partita_iva text,
  email text,
  telefono text,
  indirizzo text,
  numero_civico text,
  cap text,
  comune text,
  provincia text,
  codice_gestionale text,
  id_contratto text,
  contratto_attivo boolean,
  profilo_internet text,
  aggiornato_il timestamptz not null default now()
);

create index if not exists clienti_esterni_codice_fiscale on clienti_esterni (codice_fiscale);
create index if not exists clienti_esterni_partita_iva on clienti_esterni (partita_iva);
create index if not exists clienti_esterni_telefono on clienti_esterni (telefono);

-- ★ il database sorgente non conserva uno storico dei profili passati:
-- questo trigger inizia a registrarlo da ora, ad ogni sincronizzazione che
-- rileva un profilo diverso dall'ultimo salvato — qualunque cosa aggiorni
-- la riga (non solo il cron), per non doverci pensare altrove.
create table if not exists clienti_esterni_storico_profilo (
  id uuid primary key default gen_random_uuid(),
  cliente_esterno_id integer not null references clienti_esterni(id) on delete cascade,
  profilo_precedente text,
  profilo_nuovo text,
  rilevato_il timestamptz not null default now()
);

create or replace function log_cambio_profilo_cliente_esterno() returns trigger as $$
begin
  if new.profilo_internet is distinct from old.profilo_internet then
    insert into clienti_esterni_storico_profilo (cliente_esterno_id, profilo_precedente, profilo_nuovo)
    values (old.id, old.profilo_internet, new.profilo_internet);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_log_cambio_profilo on clienti_esterni;
create trigger trg_log_cambio_profilo
  before update on clienti_esterni
  for each row execute function log_cambio_profilo_cliente_esterno();

alter table clienti_esterni enable row level security;
alter table clienti_esterni_storico_profilo enable row level security;

drop policy if exists "staff attivo legge clienti_esterni" on clienti_esterni;
create policy "staff attivo legge clienti_esterni" on clienti_esterni for select using (is_active_staff());

drop policy if exists "staff attivo legge storico profilo" on clienti_esterni_storico_profilo;
create policy "staff attivo legge storico profilo" on clienti_esterni_storico_profilo for select using (is_active_staff());

-- ★ nessuna policy insert/update per "authenticated": la tabella si scrive
-- solo dal cron di sincronizzazione, con la service role.
