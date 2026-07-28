# Gestionale Done Wifi — nuova piattaforma (Next.js + Supabase)

Nucleo essenziale in costruzione: login/permessi, Ticket, Segnalazione → Richiesta Dati → Contratto.
Sostituisce progressivamente il gestionale precedente (Google Apps Script), che resta online.

## Setup (prima volta)

1. **Crea un progetto Supabase** su [supabase.com](https://supabase.com) (piano gratuito va bene per iniziare).
2. **Applica lo schema**: apri l'SQL Editor del progetto Supabase e incolla il contenuto di
   `supabase/migrations/0001_init.sql`, poi esegui. Fai lo stesso con
   `supabase/migrations/0002_storage.sql` (crea il bucket privato per i documenti caricati dai
   clienti nel modulo Richiesta Dati).
3. **Copia le credenziali**: Project Settings → API → copia `Project URL`, `anon public key`,
   `service_role key`.
4. **Configura le variabili d'ambiente**: copia `.env.local.example` in `.env.local` e compila
   con i 3 valori sopra.
5. **Crea il primo utente staff** (finché non c'è una UI di Gestione Utenti, a mano):
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

## Stato attuale

✅ Login, logout, guardia di accesso (rotte autenticate vs. pubbliche).
✅ Ticket: lista con filtri (stato/categoria/priorità/reparto + "solo i miei", ricordati per
  browser), creazione, cambio stato da drawer.
✅ Segnalazioni: bacheca a 4 colonne (Da Contattare/In Contatto/Gestione Cliente/Trasmessa),
  creazione, cambio stato, link "Richiesta Dati" da inviare al cliente, "Trasmetti per
  l'installazione" → crea il Ticket collegato.
✅ Modulo pubblico Richiesta Dati (dati fiscali/pagamento + upload documenti) collegato
  automaticamente alla Segnalazione d'origine.
⏳ Build di produzione verificata in locale; test end-to-end manuale (creare una Segnalazione →
  Gestione Cliente → compilare Richiesta Dati → Trasmetti → controllare il Ticket) ancora da fare
  con dati reali.

Fuori scope per ora (fasi successive): Dashboard/analytics, Clienti Attivi, Archivio, Storico
Modifiche, Gestione Utenti (UI), Calendario/Installazioni, Lavorazione/Vista Tecnico, notifiche
Telegram, invio WhatsApp, export PDF.