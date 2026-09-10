-- ============================================================
-- FIX — bug reale segnalato: "non è possibile aprire i ticket per i
-- diversi reparti da alcuni account" (Antonietta/Fatturazione, poi
-- confermato più ampio). Il fix del cookie "Tu sei" (2026-09-10) non
-- bastava: verificato con test reali contro produzione (persona/utente
-- Supabase Auth usa e getta, dati puliti subito dopo) che le policy DI
-- SCRITTURA su "tickets" in produzione richiedono `reparto = ANY(reparti)`
-- — anche per INSERT — nonostante 0001_init.sql le definisca come
-- `with check (is_active_staff())` (nessun controllo di reparto) e
-- 0048_tickets_visibilita_per_reparto.sql dica esplicitamente "Nessuna
-- modifica alle policy di insert/update: restano aperte a qualunque staff
-- attivo". Le policy vive in produzione sono quindi diverse da quelle
-- tracciate nelle migrazioni — un drift, non un bug di questo codice —
-- probabilmente una correzione manuale fatta una volta in Supabase Studio
-- e mai riportata in una migrazione.
--
-- Confermato con 3 test reali (persona/utente disponibili solo per la
-- durata del test):
--   • persona reparto=[Fatturazione], INSERT reparto="Analisi Rete" → RLS bloccata.
--   • stessa persona, INSERT reparto="Fatturazione" (il proprio) → OK.
--   • stessa persona, UPDATE su un Ticket di reparto="Analisi Rete" → 0 righe
--     modificate, NESSUN errore restituito (PostgREST non segnala un UPDATE
--     filtrato a 0 righe come errore) — il "chiudi Ticket" di Fatturazione
--     falliva silenziosamente allo stesso modo.
--   • persona amministratore=true, reparti=[] → INSERT ovunque OK (il bypass
--     amministratore nella policy attuale funziona già).
--
-- Richiesta esplicita del titolare: "che possa aprire i ticket anche per
-- altri reparti ma può operare solo su quelli del suo reparto. come per
-- gli altri si possono aprire i ticket per tutti ma operare solo per
-- quelli del proprio settore" — creazione libera per chiunque sia staff
-- attivo, operare (aggiornare/chiudere) solo sui Ticket che si è già in
-- grado di vedere (persona_vede_ticket, 0048: proprio reparto, oppure
-- assegnato direttamente a sé, oppure amministratore).
-- ============================================================

drop policy if exists "staff attivo scrive tickets" on tickets;
create policy "staff attivo scrive tickets" on tickets
  for insert with check (is_active_staff());

drop policy if exists "staff attivo aggiorna tickets" on tickets;
create policy "staff vede e aggiorna tickets del proprio reparto" on tickets
  for update using (persona_vede_ticket(reparto, tecnico_assegnato));
