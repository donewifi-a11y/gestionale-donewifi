# Gestionale Done Wifi — nuova piattaforma (Next.js + Supabase)

Nucleo essenziale in costruzione: login/permessi, Ticket, Segnalazione → Richiesta Dati → Contratto.
Sostituisce progressivamente il gestionale precedente (Google Apps Script), che resta online.

## Setup (prima volta)

1. **Crea un progetto Supabase** su [supabase.com](https://supabase.com) (piano gratuito va bene per iniziare).
2. **Applica lo schema**: apri l'SQL Editor del progetto Supabase e incolla, in ordine, il
   contenuto di `supabase/migrations/0001_init.sql`, `0002_storage.sql`, `0003_note_ticket.sql`,
   `0004_appuntamenti.sql`, `0005_persone.sql`, `0006_persone_accesso.sql`,
   `0007_appuntamenti_google.sql`, `0008_sicurezza_persone.sql`, `0009_persone_email.sql` e
   `0010_rapportini_tariffe_richieste.sql`, eseguendo ognuno.
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
- `src/app/(app)/calendario` + `src/lib/google-calendar.ts` — agenda appuntamenti, collegabili a un
  Ticket; ogni appuntamento viene anche creato/aggiornato/annullato su un calendario Google
  condiviso tramite un account di servizio (nessun login Google per persona). Se le variabili
  `GOOGLE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`/`GOOGLE_CALENDAR_ID` non sono
  configurate, il Calendario funziona lo stesso, solo senza la sincronizzazione.
- `src/app/(app)/dashboard` — KPI e distribuzione Ticket/Segnalazioni per stato, carico per tecnico.
- `src/app/(app)/archivio` — Ticket chiusi/annullati e Segnalazioni trasmesse, ricerca, sola lettura.
- `src/app/(app)/clienti` — registro clienti ricavato aggregando i Ticket per nome/telefono.
- `src/app/(app)/vista-tecnico` — vista mobile-first: solo gli appuntamenti di oggi e i Ticket
  assegnati all'utente collegato, con "Chiama" e avanzamento stato a un tocco.
- `src/app/(app)/persone` + `src/lib/persona.ts` — quando più persone reali condividono lo stesso
  login (Gmail comuni), "staff" (l'account) non basta più a distinguere chi fa cosa: "persone" è
  il registro del team, e un cookie (`persona_id`, un anno, impostato dal selettore "Tu sei" in
  fondo alla sidebar) porta quella scelta sia ai Server Component sia alle Server Action. Tutte le
  colonne che tracciano un individuo (assegnazione Ticket, autore di una nota, chi ha creato una
  Segnalazione/Appuntamento, `storico.operatore_id`) ora fanno riferimento a `persone(id)`, non
  più a `staff(id)`. Ogni persona ha anche un proprio `area_accesso` (il permesso di gestire
  Utenti/Persone segue questo, non più quello dell'account condiviso) e una password facoltativa —
  se impostata, il selettore "Tu sei" la richiede prima di cambiare persona. L'hash della password
  (`persone.password_hash`) non è mai leggibile dal client: viene letto/scritto solo dentro le
  funzioni Postgres `security definer` `imposta_password_persona`/`verifica_password_persona`
  (migrazione `0006_persone_accesso.sql`), e ogni query dell'app seleziona colonne esplicite,
  mai `select *`, su `persone`.
- `src/app/(app)/tickets` + `src/components/tickets/rapportino.tsx` — passare un Ticket a
  Completato apre il rapportino di chiusura (esito, lavori svolti, materiali, foto, firma cliente
  su canvas) invece di un semplice conferma/annulla; niente generazione PDF lato server, il
  rapportino resta un record leggibile a schermo con un pulsante "Stampa / Salva PDF" (il browser
  genera il PDF). Disponibile sia dal dettaglio Ticket sia da Vista Tecnico.
- `src/app/(app)/tariffe` — catalogo tariffe (CRUD, visibile a Commerciale/admin), usato dallo step
  "scegli il tuo piano" nel modulo pubblico Richiesta Dati quando il tipo è Nuovo Contratto.
- `src/app/(app)/richieste-clienti` + `src/app/richiesta-cliente/[tipo]` — le 4 pratiche cliente
  (Cambio IBAN, Cambio Anagrafica, Trasferimento, Subentro) hanno un form pubblico dedicato
  (`/richiesta-cliente/cambio-iban` ecc., inviabile da un Ticket via WhatsApp/Email/copia link) e
  una bacheca staff filtrata per reparto (Fatturazione: IBAN/Anagrafica; Commerciale:
  Trasferimento/Subentro), sullo stesso modello già usato da Richiesta Dati — tutte scrivono nella
  stessa tabella `richieste_clienti`.
- `src/app/disdetta` — pagina pubblica con le istruzioni per disdire il contratto (Raccomandata
  A/R o PEC, checklist, fac-simile testo), inviabile da un Ticket come le altre pratiche.
- `src/app/privacy` — informativa privacy pubblica, linkata dal checkbox di consenso nei form
  pubblici (Richiesta Dati e Richieste Cliente).
- `src/lib/validazione.ts` — validazione formale (checksum, non solo formato) di Codice Fiscale,
  Partita IVA, IBAN ed Email, usata sia lato client sia nelle route pubbliche che ricevono i dati.
- `src/components/ricerca-globale.tsx` — barra di ricerca in sidebar su Ticket e Segnalazioni
  insieme (cliente o numero); apre direttamente la scheda trovata via `?aperto=<id>`.
- `src/components/condivisi/indirizzo-autocomplete.tsx` — suggerimenti indirizzo mentre si scrive
  (OpenStreetMap/Nominatim, nessuna chiave API) nel form Nuovo Ticket.
- `src/app/(app)/tickets/nuovo` — cercando un nome/telefono già presente tra i Ticket esistenti,
  suggerisce il cliente e precompila telefono/email/indirizzo.
- `src/app/api/cron/pulizia-documenti`, `src/app/api/cron/promemoria-ticket` + `vercel.json` — due
  cron job giornalieri: il primo elimina (dopo 30 giorni, come da Informativa Privacy) i documenti
  caricati dai clienti nelle Richieste Clienti già lavorate; il secondo avvisa via Telegram il
  reparto competente per i Ticket ancora "Da gestire" da oltre 24h. Protetti da `CRON_SECRET`
  quando è impostata (Vercel la invia in automatico).
- `src/lib/email.ts` — email di chiusura al cliente quando un Ticket passa a Completato via
  rapportino, tramite Resend (`RESEND_API_KEY`); come Telegram/Google Calendar, se non configurata
  l'invio viene saltato senza bloccare nulla.

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
  e assegnabili a un tecnico, sincronizzati su un calendario Google condiviso.
✅ Dashboard: Ticket urgenti/non assegnati, appuntamenti di oggi, distribuzione Ticket e
  Segnalazioni per stato, carico di lavoro per tecnico.
✅ Archivio: Ticket Completato/Annullato e Segnalazioni Trasmesse, elenco cronologico ricercabile.
✅ Clienti: registro clienti (nome/telefono/indirizzo) con storico ticket, ricavato dai Ticket
  esistenti — nessuna tabella nuova.
✅ Vista Tecnico: schermata mobile con solo appuntamenti di oggi e Ticket assegnati all'utente,
  chiamata e avanzamento stato a un tocco.
✅ Contratto: caricamento del PDF (generato altrove) sulla Segnalazione durante Gestione Cliente,
  visibile poi anche sul Ticket collegato — bucket privato, link di visualizzazione firmato.
✅ Notifiche Telegram: stesso bot e stessi 3 gruppi reparto del vecchio gestionale (`src/lib/telegram.ts`),
  un solo avviso attivo — al reparto Commerciale quando un cliente invia la Richiesta Dati —
  stessa scelta deliberata già fatta nel sistema precedente. Richiede `TELEGRAM_BOT_TOKEN` tra le
  variabili d'ambiente (vedi `.env.local.example`).
✅ Persone: registro del team indipendente dai login condivisi, con selettore "Tu sei" in sidebar —
  assegnazioni, note e "solo i miei/le mie" ora seguono la persona reale, non l'account Gmail
  condiviso usato per accedere. Ogni persona ha un proprio livello di accesso (da cui dipende chi
  vede Utenti/Persone), un'email di contatto facoltativa (indipendente dall'email del login
  condiviso) e una password facoltativa richiesta al cambio persona.
✅ Google Calendar: ogni Appuntamento viene creato/aggiornato/annullato su un calendario Google
  condiviso tramite un account di servizio (`src/lib/google-calendar.ts`).
✅ Revisione di sicurezza (2026-07-29): il cookie `persona_id` è ora firmato (HMAC, `src/lib/persona.ts`)
  — prima bastava modificarlo dai DevTools del browser per "diventare" un'altra persona, password
  inclusa, senza che il server se ne accorgesse. La tabella `persone` non ha più policy RLS di
  scrittura per il ruolo `authenticated` (solo le Server Action con service role possono scriverci,
  dopo aver verificato il livello della persona corrente — prima chiunque poteva assegnarsi
  `area_accesso = 'Tutto'` con una chiamata REST diretta). La pagina Utenti ora legge con la service
  role invece che con RLS (prima mostrava sempre e solo il proprio account, mai gli altri login
  condivisi). `tickets.segnalazione_id` ha un vincolo di unicità contro un doppio Ticket se
  "Trasmetti" viene inviato due volte molto ravvicinate.
✅ Rapportino di chiusura intervento: esito, lavori svolti, materiali, foto e firma cliente quando
  un Ticket passa a Completato (dal dettaglio Ticket o da Vista Tecnico), con vista stampabile.
✅ Tariffe: catalogo gestito da Commerciale/admin, usato nello step "scegli il tuo piano" del
  modulo pubblico Richiesta Dati.
✅ Richieste Clienti: Cambio IBAN, Cambio Anagrafica, Trasferimento, Subentro — form pubblici
  dedicati inviabili da un Ticket, bacheca staff filtrata per reparto.
✅ Disdetta: pagina pubblica con le istruzioni ufficiali, inviabile da un Ticket.
✅ Informativa Privacy pubblica, linkata dai form pubblici con consenso obbligatorio.
✅ Validazione formale (checksum) di Codice Fiscale/Partita IVA/IBAN/Email nei form pubblici.
✅ Ricerca globale in sidebar su Ticket e Segnalazioni.
✅ Autocompletamento indirizzo e autofill cliente esistente in Nuovo Ticket.
✅ Automazioni: pulizia documenti clienti scaduti ed avviso ticket fermi, via Vercel Cron.
✅ Email di chiusura automatica al cliente (Resend, facoltativa).
⏳ Build di produzione verificata in locale; test end-to-end manuale (creare una Segnalazione →
  Gestione Cliente → compilare Richiesta Dati → Trasmetti → controllare il Ticket, e il nuovo
  rapportino di chiusura) ancora da fare con dati reali.

Fuori scope per ora: Storico Modifiche (UI, non prioritario per ora). I contratti si continuano a
generare sul gestionale esterno esistente — qui si carica solo il PDF già pronto (vedi sopra),
niente generazione automatica.