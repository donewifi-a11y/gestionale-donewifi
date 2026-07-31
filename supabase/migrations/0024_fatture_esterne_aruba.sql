-- Fatture importate dallo stesso database Aruba di clienti_esterni
-- (0023) — 59mila righe, dal 2020 in poi. Stessa logica: sola lettura dal
-- gestionale, si aggiorna solo tramite il ponte PHP su Aruba.

create table if not exists fatture_esterne (
  id bigint generated always as identity primary key,
  codice text not null,
  numero text not null,
  emissione date,
  scadenza date,
  importo numeric(10,2),
  pagata boolean,
  partita_iva text,
  codice_fiscale text,
  nominativo text,
  tipo_pagamento text,
  aggiornato_il timestamptz not null default now(),
  unique (codice, numero)
);

create index if not exists fatture_esterne_codice_fiscale on fatture_esterne (codice_fiscale);
create index if not exists fatture_esterne_partita_iva on fatture_esterne (partita_iva);
create index if not exists fatture_esterne_scadenza on fatture_esterne (scadenza);

alter table fatture_esterne enable row level security;

drop policy if exists "staff attivo legge fatture_esterne" on fatture_esterne;
create policy "staff attivo legge fatture_esterne" on fatture_esterne for select using (is_active_staff());

-- ★ nessuna policy insert/update per "authenticated": si scrive solo dalla
-- sincronizzazione manuale (service role).
