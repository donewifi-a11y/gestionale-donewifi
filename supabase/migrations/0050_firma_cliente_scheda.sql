-- ★ NUOVA — richiesta esplicita: la firma disegnata su schermo per il
-- cliente nella Scheda di Installazione/Lavorazione viene sostituita da
-- un'approvazione via codice OTP inviato per email (più solida come
-- prova: il tecnico è presente di persona mentre il cliente legge il
-- codice dalla propria casella e lo conferma, invece di un semplice
-- disegno che chiunque potrebbe tracciare per lui). Un link di
-- approvazione via email resta come alternativa, ma solo se il tecnico la
-- autorizza esplicitamente (es. cliente senza connessione per ricevere
-- l'OTP sul posto) — non è mai una scelta del cliente stesso.
--
-- Tabella dedicata invece di riusare token_approvazione: lì il token è
-- pensato per essere consumato una volta sola via link cliccato in
-- autonomia dal cliente; qui invece è un codice a 6 cifre verificato in
-- tempo reale sul dispositivo del tecnico, con tentativi limitati e
-- scadenza breve — forma diversa, tabella diversa.
create table if not exists otp_firma_scheda (
  id uuid primary key default gen_random_uuid(),
  appuntamento_id uuid not null references appuntamenti(id) on delete cascade,
  email text not null,
  codice_hash text not null,
  tentativi int not null default 0,
  creato_il timestamptz not null default now(),
  scaduto_il timestamptz not null,
  verificato_il timestamptz
);

-- ★ nessuna policy RLS: si legge/scrive solo da Server Action con service
-- role (staff già verificato attivo lì) — stessa logica già usata per
-- token_approvazione (0013_portale_approvazione.sql).
alter table otp_firma_scheda enable row level security;

-- ★ firma_cliente_url resta (nullable, non toccata): le schede già
-- salvate col disegno restano leggibili esattamente come prima. I 3 campi
-- nuovi restano tutti null per quelle righe storiche — `firma_cliente_metodo`
-- null è il modo per distinguere "vecchia scheda, firma disegnata" da
-- "nuova scheda, firma via email".
alter table schede_lavoro add column if not exists firma_cliente_metodo text check (firma_cliente_metodo in ('otp_email', 'link_email'));
alter table schede_lavoro add column if not exists firma_cliente_email text;
alter table schede_lavoro add column if not exists firma_cliente_verificato_il timestamptz;

-- ★ estende token_approvazione (già usato per contratto/intervento/
-- preventivo) con un quarto riferimento possibile, per il link di
-- approvazione via email di fallback della firma scheda. A differenza
-- degli altri tre, qui la scheda potrebbe non esistere ancora nel momento
-- in cui si invia il link (si salva solo al submit finale del wizard):
-- si referenzia l'appuntamento, non la scheda — la route di approvazione
-- cercherà la scheda per appuntamento_id quando il cliente clicca.
alter table token_approvazione add column if not exists appuntamento_id uuid references appuntamenti(id) on delete cascade;

alter table token_approvazione drop constraint if exists token_approvazione_un_riferimento;
alter table token_approvazione add constraint token_approvazione_un_riferimento check (
  (ticket_id is not null)::int + (segnalazione_id is not null)::int + (preventivo_id is not null)::int + (appuntamento_id is not null)::int = 1
);

alter table token_approvazione drop constraint if exists token_approvazione_origine_check;
alter table token_approvazione add constraint token_approvazione_origine_check check (
  origine in ('intervento', 'contratto', 'preventivo', 'firma_scheda')
);
