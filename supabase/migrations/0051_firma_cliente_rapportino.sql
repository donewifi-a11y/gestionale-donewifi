-- ★ NUOVA — richiesta esplicita: "aggiorna tutte le parti rimaste
-- obsolete" dopo il giro OTP sulla Scheda di Installazione/Lavorazione
-- (migrazione 0050). Trovato un secondo punto con lo stesso identico
-- problema mai aggiornato: il Rapportino di chiusura Ticket
-- (rapportini_intervento, src/components/tickets/rapportino.tsx) — usato
-- quando un Ticket si completa direttamente, non tramite una Scheda legata
-- a un appuntamento — aveva ancora la firma disegnata su schermo
-- (FirmaPad). Stesso meccanismo OTP/link qui, generalizzato: la tabella
-- OTP ora referenzia un appuntamento O un ticket (mai entrambi), non solo
-- un appuntamento come prima — da qui il rename.
alter table otp_firma_scheda rename to otp_firma_cliente;

alter table otp_firma_cliente alter column appuntamento_id drop not null;
alter table otp_firma_cliente add column if not exists ticket_id uuid references tickets(id) on delete cascade;

alter table otp_firma_cliente drop constraint if exists otp_firma_cliente_un_riferimento;
alter table otp_firma_cliente add constraint otp_firma_cliente_un_riferimento check (
  (appuntamento_id is not null)::int + (ticket_id is not null)::int = 1
);

-- ★ stesso trattamento di schede_lavoro (migrazione 0050): firma_url resta
-- intatto per i rapportini già salvati col disegno, i 3 campi nuovi
-- restano null su quelle righe storiche.
alter table rapportini_intervento add column if not exists firma_metodo text check (firma_metodo in ('otp_email', 'link_email'));
alter table rapportini_intervento add column if not exists firma_email text;
alter table rapportini_intervento add column if not exists firma_verificato_il timestamptz;

-- ★ il link di fallback per il Rapportino riusa token_approvazione.ticket_id
-- (già esistente, usato finora solo per origine 'intervento' — la
-- conferma di un intervento risolto da remoto, concetto diverso da questo:
-- qui il tecnico è stato di persona, serve solo la firma del cliente).
alter table token_approvazione drop constraint if exists token_approvazione_origine_check;
alter table token_approvazione add constraint token_approvazione_origine_check check (
  origine in ('intervento', 'contratto', 'preventivo', 'firma_scheda', 'firma_rapportino')
);
