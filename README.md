# Gestionale Done Wifi — nuova piattaforma (Next.js + Supabase)

Nucleo essenziale in costruzione: login/permessi, Ticket, Segnalazione → Richiesta Dati → Contratto.
Sostituisce progressivamente il gestionale precedente (Google Apps Script), che resta online.

## Setup (prima volta)

1. **Crea un progetto Supabase** su [supabase.com](https://supabase.com) (piano gratuito va bene per iniziare).
2. **Applica lo schema**: apri l'SQL Editor del progetto Supabase e incolla, in ordine, il
   contenuto di `supabase/migrations/0001_init.sql`, `0002_storage.sql`, `0003_note_ticket.sql` e
   `0004_appuntamenti.sql`, eseguendo ognuno.
3. **Copia le credenziali**: Project Settings → API → copia `Project URL`, `anon public key`,
   `service_role key`.
4. **Configura le variabili d'ambiente**: copia `.env.local.example` in `.env.local` e compila
   con i 3 valori sopra.
5. **Crea il primo utente staff** (a mano, solo per il primissimo accesso — dopo si usa la pagina
   "Utenti" nel gestionale):
   - Authentication → Users → Add user (email + password) nel pannello Supabase.
   - Copia l'`id` (UUID) generato.
   - Nell'SQL Editor: `insert into staff (id, email, area_accesso, permessi) values ('<uuid>', '<email>', 'Tutto', '{}');`
6. **Avvia in locale**:
   ```
   npm install
   npm run dev
   ```
   Apri `http://localhost:3000` → reindirizza a `/login`.

## Struttura

- `src/app/login` — login (pagina pubblica).
- `src/app/(app)` — area autenticata (shell con barra in alto + logout); tutte le rotte qui dentro
  richiedono login, imposto dal proxy (`src/proxy.ts`, equivalente del controllo che faceva
  `doGet()` nel gestionale precedente).
- `src/lib/supabase/` — client Supabase (browser, server, service-role per l'API pubblica).
- `src/app/richiesta-dati/[id]` — pagina pubblica (nessun login) dove il cliente inserisce i dati
  e carica i documenti dopo una Segnalazione; invia a `src/app/api/richiesta-dati` (route
  server-side con service role, che collega i dati alla Segnalazione in modo affidabile).
- `supabase/migrations/0001_init.sql` — schema del database (staff, tickets, segnalazioni,
  richieste_clienti, storico).
- `supabase/migrations/0002_storage.sql` — bucket Storage privato per i documenti del cliente.
- `supabase/migrations/0003_note_ticket.sql` — log testuale di note/aggiornamenti sui Ticket.
- `supabase/migrations/0004_appuntamenti.sql` — appuntamenti/installazioni (Calendario).
- `src/app/(app)/utenti` — Gestione Utenti (visibile solo ad area_accesso `Tutto`/`Admin`): crea
  accessi via `auth.admin.createUser` (service role, solo server-side), attiva/disattiva, cambia
  ruolo.
- `src/app/(app)/calendario` — agenda appuntamenti, collegabili a un Ticket.
- `src/app/(app)/dashboard` — KPI e distribuzione Ticket/Segnalazioni per stato, carico per tecnico.
- `src/app/(app)/archivio` — Ticket chiusi/annullati e Segnalazioni trasmesse, ricerca, sola lettura.
- `src/app/(app)/clienti` — registro clienti ricavato aggregando i Ticket per nome/telefono.

## Stato attuale

✅ Login, logout, guardia di accesso (rotte autenticate vs. pubbliche).
✅ Ticket: lista con filtri (stato/categoria/priorità/reparto + "solo i miei", ricordati per
  browser), creazione, cambio stato/presa in carico/avanzamento rapido dalla card, note e
  aggiornamenti testuali nel dettaglio.
✅ Segnalazioni: bacheca a 4 colonne (Da Contattare/In Contatto/Gestione Cliente/Trasmessa),
  creazione, cambio stato, invio del link Richiesta Dati via WhatsApp/Email/copia link con
  anteprima del messaggio, "Trasmetti per l'installazione" → crea il Ticket collegato.
✅ Modulo pubblico Richiesta Dati (dati fiscali/pagamento + upload documenti) collegato
  automaticamente alla Segnalazione d'origine.
✅ Gestione Utenti: creazione/attivazione/disattivazione/cambio ruolo, senza più bisogno di SQL a
  mano dopo il primo utente.
✅ Calendario: agenda appuntamenti/installazioni, raggruppata per giorno, collegabili a un Ticket
  e assegnabili a un tecnico.
✅ Dashboard: Ticket urgenti/non assegnati, appuntamenti di oggi, distribuzione Ticket e
  Segnalazioni per stato, carico di lavoro per tecnico.
✅ Archivio: Ticket Completato/Annullato e Segnalazioni Trasmesse, elenco cronologico ricercabile.
✅ Clienti: registro clienti (nome/telefono/indirizzo) con storico ticket, ricavato dai Ticket
  esistenti — nessuna tabella nuova.
⏳ Build di produzione verificata in locale; test end-to-end manuale (creare una Segnalazione →
  Gestione Cliente → compilare Richiesta Dati → Trasmetti → controllare il Ticket) ancora da fare
  con dati reali.

Fuori scope per ora (fasi successive): Storico Modifiche (UI), Lavorazione/Vista Tecnico,
notifiche Telegram, export PDF.