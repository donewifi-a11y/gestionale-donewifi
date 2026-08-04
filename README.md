# Gestionale Done Wifi — nuova piattaforma (Next.js + Supabase)

Nucleo essenziale in costruzione: login/permessi, Ticket, Segnalazione → Richiesta Dati → Contratto.
Sostituisce progressivamente il gestionale precedente (Google Apps Script), che resta online.

## Setup (prima volta)

1. **Crea un progetto Supabase** su [supabase.com](https://supabase.com) (piano gratuito va bene per iniziare).
2. **Applica lo schema**: apri l'SQL Editor del progetto Supabase e incolla, in ordine, il
   contenuto di `supabase/migrations/0001_init.sql`, `0002_storage.sql`, `0003_note_ticket.sql`,
   `0004_appuntamenti.sql`, `0005_persone.sql`, `0006_persone_accesso.sql`,
   `0007_appuntamenti_google.sql`, `0008_sicurezza_persone.sql`, `0009_persone_email.sql` e
   `0010_rapportini_tariffe_richieste.sql`, `0013_portale_approvazione.sql` e
   `0014_ricavi_ticket.sql`, `0015_sottocategoria_ticket.sql`, `0016_clienti_attivi.sql` e
   `0017_note_calendario.sql`, `0018_dettagli_extra_ticket.sql`, `0019_permessi_granulari.sql`,
   `0020_promozioni_tariffe.sql`, `0021_chat_interna.sql`, `0022_chat_letture_presenza.sql`,
   `0023_clienti_esterni_aruba.sql`, `0024_fatture_esterne_aruba.sql`, `0025_seed_tariffe.sql`,
   `0026_clienti_attivi_da_fatturazione.sql`, `0027_completa_tariffe.sql` e
   `0028_tutte_le_tariffe.sql`, `0029_tariffe_iva.sql`, `0030_statistiche_generali_aruba.sql`,
   `0031_fatturato_per_periodo.sql`, `0032_tariffe_dettaglio_prezzi.sql`,
   `0033_tariffe_pubblica_attivazione.sql`, `0034_blinda_grant_funzioni_definer.sql`,
   `0035_eliminazione_tariffe_solo_admin.sql`, `0036_verifica_blindatura_password.sql` e
   `0037_tipo_servizio_appuntamento.sql`, `0038_schede_lavoro.sql` e
   `0039_fix_ricalcola_clienti_attivi.sql`, `0040_gps_installazione.sql` e
   `0041_materiali_categoria_prezzi.sql`, eseguendo ognuno.
   **`0011` e `0012` (login individuale) vanno applicate con cautela — vedi sezione dedicata
   sotto**, non di seguito come le altre: `0012` da sola blocca l'accesso a chiunque se applicata
   prima di aver collegato almeno una Persona a un login vero.
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

## Anagrafica Clienti (Aruba)

L'anagrafica clienti reale vive nel database MySQL del sito pubblico (mydone.it, hosting Aruba),
non nel gestionale. Il database **non è raggiungibile direttamente** da Vercel/da fuori: Aruba
richiede una whitelist di IP per l'accesso remoto, incompatibile con gli IP dinamici di una
funzione serverless. La soluzione è un piccolo **ponte PHP** ospitato sullo stesso hosting Aruba
(dove il database *è* raggiungibile), che espone via HTTPS solo i campi necessari:

- File: `ponte-anagrafica.php`, caricato via FTP in `/www.mydone.it/partner/` (fuori da git — è
  PHP, non fa parte di questo progetto Next.js; una copia di riferimento non è versionata qui,
  se va rifatto il codice è nella cronologia di questa conversazione/chiedere a Claude).
- Protetto da un token segreto in query string (`?secret=...`), non da login — è pubblicamente
  raggiungibile ma inutile senza il token.
- Modalità default: restituisce `{ clienti: [...], anagrafiche: [...] }` da `md_archivio_clienti`
  (telefono, stato contratto, profilo internet) e `anagrafiche` (dati fiscali, usata solo per
  completare ragione sociale/P.IVA quando mancano in `md_archivio_clienti`), uniti per codice
  fiscale.
- `?tabella=fatture&offset=N&limite=M`: fatture paginate (59mila righe, troppe per una sola
  risposta) — `{ fatture: [...], totale, offset, limite }`.
- ★ **Nota encoding**: i dati sorgente sono UTF-8 salvati in colonne dichiarate con un charset
  diverso — connettersi in `utf8mb4` produce caratteri accentati storpiati ("PortabilitÃ " invece
  di "Portabilità", doppio-encoding). Il PHP corregge ogni valore con `iconv('UTF-8',
  'ISO-8859-1//IGNORE', ...)` dopo la lettura. Se in futuro compaiono di nuovo caratteri storpiati,
  il problema è lì, non nel codice Next.js.

Nel gestionale, `sincronizzaAnagraficaAruba()` e `sincronizzaFattureAruba()`
(`src/app/(app)/clienti-esterni/actions.ts`) chiamano il ponte e aggiornano rispettivamente
`clienti_esterni` e `fatture_esterne`. **Manuali (due pulsanti distinti, solo admin) invece di un
cron automatico**: il piano Vercel Hobby di questo progetto permette solo 2 cron job, già occupati
da `pulizia-documenti` e `promemoria-ticket` — due pulsanti separati (invece di uno solo) anche
per poter rilanciare solo quello lento (fatture, ~60mila righe) senza rifare anche l'anagrafica.
Variabili d'ambiente richieste: `ARUBA_BRIDGE_URL` (URL del ponte PHP) e `ARUBA_BRIDGE_SECRET` (il
token) — vedi `.env.local.example`. Le fatture hanno qualche doppione di (codice, numero) nella
sorgente: la sincronizzazione li deduplica prima di scrivere (tiene l'ultimo).

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
- **Login individuale (migrazioni `0011`/`0012`)** — sostituisce il modello "account condiviso +
  scelta Persona dopo il login" con un login vero per ciascuna Persona. `persone.auth_user_id`
  collega la Persona al suo account Supabase Auth reale; la funzione SQL `is_active_staff()` (letta
  da tutte le policy RLS del database) non guarda più `staff`, guarda `persone.auth_user_id =
  auth.uid()`. `creaPersona`/`aggiornaPersona` (`src/app/(app)/persone/actions.ts`) creano/
  aggiornano quell'account reale quando email e password sono entrambe presenti. Dopo un login
  riuscito, `selezionaPersonaDopoLogin` (`src/app/login/actions.ts`) seleziona subito quella
  Persona — non serve più il passaggio "Tu sei" per chi ha un accesso individuale.
  ⚠️ **Ordine di attivazione obbligatorio** (altrimenti si resta tutti fuori): 1) applicare
  `0011_persone_auth_user_id.sql` (aggiunge solo la colonna, innocua); 2) collegare almeno una
  Persona attiva a un vero `auth_user_id` (via `aggiornaPersona`/`creaPersona` dalla UI, oppure con
  uno script che usa `service.auth.admin.createUser` + un update mirato); 3) **solo dopo**,
  applicare `0012_login_individuale_controllo_accessi.sql`. Gli account condivisi (`staff`) restano
  nel database ma smettono di avere effetto sui permessi: possono ancora autenticarsi, ma senza una
  Persona collegata non superano più `is_active_staff()` e non vedono/scrivono nulla.
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
- `src/lib/email.ts` — email in uscita (chiusura Ticket, approvazione intervento, link Richiesta
  Dati) via SMTP delle caselle Aruba vere (nodemailer, non un servizio esterno) — ogni reparto ha
  le proprie credenziali (`SMTP_USER_<REPARTO>`/`SMTP_PASS_<REPARTO>`), così il cliente riceve
  davvero dall'indirizzo del reparto competente (`assistenza@`/`commerciale@`/`servizioclienti@`),
  con ripiego su `SMTP_USER`/`SMTP_PASS` se un reparto non ha una casella dedicata configurata;
  come Telegram/Google Calendar, se le credenziali mancano l'invio fallisce senza bloccare il
  resto del gestionale.
- `src/app/portale` — ultimo pezzo pubblico ancora sul vecchio gestionale Apps Script (Portale.html
  su `area.donewifi.it`), ora qui: il cliente apre un Ticket da solo (nome + telefono/email +
  categoria, honeypot anti-spam) oppure verifica lo stato di uno esistente (numero + telefono),
  senza login — via `src/app/api/portale/apri-ticket` e `.../verifica-stato` (service role).
- `src/app/approva/[token]` — conferma via email dell'intervento quando il tecnico risolve da
  remoto (niente firma su rapportino): `inviaEmailApprovazioneTicket` (dal dettaglio Ticket) genera
  un token monouso (`token_approvazione`, migrazione `0013`) e invia il link via Resend; il click
  del cliente scrive `tickets.confermato_cliente_il` e cancella il token.

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
✅ Email di chiusura automatica al cliente (SMTP Aruba, facoltativa).
✅ Login individuale (2026-07-31): ogni Persona può avere un accesso Supabase Auth reale
  (`persone.auth_user_id`), selezionato automaticamente al login — non serve più passare da "Tu
  sei" per il proprio account. Il controllo accessi dell'intero database (`is_active_staff()`) ora
  verifica questo, non più la tabella `staff` (rimasta solo per compatibilità/transizione).
✅ Portale clienti pubblico (`/portale`): apri un Ticket o verifica lo stato di uno esistente, senza
  login — ultimo pezzo pubblico migrato dal vecchio gestionale Apps Script.
✅ Approvazione via email (`/approva/[token]`): conferma di un intervento risolto da remoto, quando
  non c'è una firma su rapportino perché il tecnico non era di persona dal cliente.
✅ Cruscotti amministrazione (2026-07-31): la Dashboard generale ha una sezione, visibile solo a
  Tutto/Admin, con acquisizioni del mese (per tipologia cliente, andamento giornaliero), ricavi del
  mese per reparto e ticket completati per reparto — ex getDatiAnalyticsAmministrazione() del
  vecchio gestionale, semplificato (niente più foglio "Clienti Attivi" separato: le acquisizioni si
  leggono da `segnalazioni`, i ricavi dal nuovo campo `tickets.importo_fatturato`, compilato nel
  rapportino di chiusura). Ogni reparto ha anche una propria vista (`/dashboard/analisi-rete`,
  `/dashboard/commerciale`, `/dashboard/fatturazione`): ticket attivi/urgenti/non assegnati, carico
  per tecnico, completati e ricavi del mese — visibile a chi ha quel reparto o a Tutto/Admin.
✅ Mondo Ticket (Home, rinominata da "Centro Operativo"): KPI di urgenza (Urgenti/Non presi in
  carico/Aperti/Completati oggi), pannello "Serve attenzione ora", vista filtrata per reparto per
  chi non ha accesso Tutto/Admin, scorciatoia a Vista Tecnico per chi ha ticket assegnati oggi.
✅ Ticket — sottocategorie (14 voci puntuali ex vecchio gestionale, es. "Assistenza: Internet
  assente", `tickets.sottocategoria`, facoltative) e cambio reparto post-creazione dal dettaglio.
✅ Segnalazioni — il pulsante "Email" per il link Richiesta Dati ora invia davvero (SMTP Aruba, la
  casella vera `commerciale@donewifi.it`) invece di aprire il client di posta personale
  dell'operatore (`mailto:`) — stesso principio di `EMAIL_MITTENTE_REPARTI` del vecchio gestionale.
  Autocompletamento anche sul campo "Via" (precompila Comune/CAP quando disponibili) e link "vedi
  su mappa" sull'indirizzo nel dettaglio.
✅ Clienti — dati contrattuali (ex registro "Clienti Attivi" del vecchio gestionale): tariffa
  attiva (collegata al catalogo Tariffe), canone mensile, scadenza contratto, note, modificabili
  da Commerciale/Fatturazione/Admin (`clienti`, migrazione `0016`) — con badge "Scade tra Ngg"
  nell'elenco quando il contratto è entro 30 giorni dalla scadenza. L'elenco resta comunque
  derivato dai Ticket per chi non ha ancora un record proprio.
✅ Calendario — modifica/riprogrammazione di un appuntamento già creato (data/ora/durata/tecnico,
  con l'aggiornamento riflesso anche su Google Calendar), pulsante "Pianifica appuntamento" nel
  dettaglio Ticket (apre il form già precompilato invece di doverlo cercare a mano nel menu a
  tendina) e link "vedi su mappa" sull'indirizzo.
✅ Promemoria nel Calendario (`note_calendario`, migrazione `0017`): un appunto libero con una
  data ("richiamare il cliente X", "ordinare materiale per Y"), non legato per forza a un Ticket
  — appare nel Calendario insieme agli appuntamenti (evidenziato in rosso se scaduto) e ripreso in
  Mondo Ticket in un pannello dedicato quando è del giorno o scaduto, per non doverlo cercare.
✅ Vista Tecnico — nota rapida su ogni Ticket (senza aprire il dettaglio completo), pulsante
  WhatsApp accanto a Chiama (messaggio precompilato), sezione "Completati oggi" per una conferma
  visiva a fine giornata.
✅ Archivio — "Riapri" un Ticket chiuso per errore (torna a "Da gestire", loggato in storico),
  rapportino di chiusura e link contratto visibili direttamente qui invece che solo sulla bacheca
  Ticket attiva, filtro per intervallo di date accanto alla ricerca testuale.
✅ Campi dinamici per sottocategoria in Nuovo Ticket (ex CONFIG_CATEGORIE del vecchio gestionale,
  `src/lib/campi-ticket.ts`): scegliendo una sottocategoria (es. "Internet assente") compaiono le
  domande specifiche di quel caso — 11 delle 14 sottocategorie ne avevano (le altre 3 passavano
  già ai moduli pubblici già costruiti). Salvate in `tickets.dettagli_extra` (jsonb, migrazione
  `0018`), incluso un eventuale allegato (foto/PDF), mostrate nel dettaglio Ticket.
✅ Richieste Clienti — moduli pubblici riportati ai campi originali di RichiestaDati.html invece
  del singolo campo semplificato: Cambio IBAN (nome+CF+IBAN), Cambio Anagrafica (due checkbox
  indipendenti telefono/email, come nel vecchio gestionale), Trasferimento (nuovo indirizzo
  completo con autocomplete, piano/interno, data preferita), Subentro (tipologia Privato/Partita
  IVA con campi condizionali, metodo di pagamento con mandato SEPA per l'addebito IBAN, upload
  documento d'identità + tessera sanitaria). Tutto raccolto in modo generico in
  `richieste_clienti.dettagli`, nessuna nuova migrazione necessaria.
✅ Richiesta Dati pubblica — riportata ai campi originali di RichiestaDatiNuovoContratto.html:
  tipologia cliente Privato/Azienda con campi condizionali (ragione sociale, PEC, SDI, legale
  rappresentante per le aziende), telefono/email (mancavano del tutto prima), metodo di pagamento
  con mandato SEPA, e soprattutto **4 allegati distinti** (fronte/retro documento, fronte/retro
  tessera sanitaria) invece di un unico campo file generico che non lasciava capire quanti/quali
  documenti caricare. Le etichette dei dettagli raccolti (`src/lib/etichette-dettagli.ts`) sono
  ora leggibili nel gestionale invece del nome tecnico del campo.
✅ Sidebar riorganizzata a "mondi" (2026-08): invece di un'unica lista fino a 15 voci, un rail di
  tab laterali (Mondo Ticket / Mondo Business / Mondo Team) mostra solo le 4-7 voci di quello attivo
  — il mondo si apre da solo in base alla pagina corrente. Un mondo compare solo se l'utente ha
  almeno una voce da vederci dentro (`src/components/app-sidebar.tsx`).
✅ Mondo Team — Persone (2026-08): "Utenti" non è più in sidebar (resta raggiungibile su `/utenti`
  per chi la conosce già, l'accesso vero passa da Persone dal login individuale); avviso in cima
  all'elenco per le persone attive senza login individuale; pulsante "Reimposta password" nella
  scheda Persona per un admin (genera una password provvisoria, senza più bisogno di intervenire
  via script come per `fornitori@donewifi.it`); attività recente (ultime 10 voci di `storico`) e
  carico di lavoro (ticket attivi/completati questo mese) nella scheda, per non doverli dedurre
  dalle Dashboard di reparto (`src/app/(app)/persone/actions.ts`, `persone-board.tsx`).
✅ Permessi granulari e multi-reparto (2026-08, migrazione `0019`): `persone.area_accesso` (un solo
  valore che faceva sia da "livello" sia da "reparto") è sostituito da `persone.amministratore`
  (booleano — "Tutto" e "Admin" si comportavano già in modo identico ovunque, quindi unificati) e
  `persone.reparti` (lista — una Persona può ora appartenere a più di un reparto). Sidebar,
  Dashboard di reparto, filtro Ticket in Mondo Ticket e permesso di modifica su Clienti seguono
  tutti la nuova lista invece di un confronto a valore singolo (`personaVedeReparto()` in
  `src/lib/persona.ts`). Il form Persone ha ora una casella "Amministratore" + tre reparti
  spuntabili al posto del menu a tendina. Nessuna policy RLS coinvolta: il controllo restava già
  tutto lato applicazione. La pagina Utenti (legacy, superflua da quando esiste il login
  individuale) mantiene il suo vecchio `area_accesso` a valore singolo, non essendo più promossa.
✅ Mondo Business (2026-08): ripristinate funzioni del vecchio gestionale rimaste indietro nella
  migrazione. **Dashboard**: pannello "Statistiche per periodo" (chip Ultimi 7/30/90 giorni +
  intervallo personalizzato, `getStatistichePeriodo()` in `src/lib/analytics.ts`) con aperti/
  completati/urgenti e **SLA medio di risoluzione** per reparto e per priorità (ore da creazione a
  completamento, ex `getStatistichePeriodo()` del vecchio gestionale); pulsante "Esporta PDF" (stampa
  browser, sidebar nascosta in stampa). **Tariffe**: sezione **Promozioni** ricostruita da zero (era
  assente — tabella `promozioni`, migrazione `0020`): sconto %/fisso, mesi omaggio o attivazione
  gratuita, piani applicabili multipli, periodo di validità con stato Attiva/Programmata/Scaduta
  calcolato dalle date, codice promo facoltativo, avviso se una tariffa ha più promo attive insieme;
  pulsante "Duplica" per clonare un piano esistente. **Richieste Clienti**: vista passata da lista a
  bacheca a 3 colonne con lo stato intermedio "In Verifica" (tra "Da Lavorare" e "Lavorata",
  nessuna migrazione necessaria — `stato` era già testo libero); il collegamento al Ticket
  d'origine (già in `richieste_clienti.ticket_id`) ora è visibile e cliccabile nel dettaglio.
✅ Mondo Ticket (2026-08): altri tre ripristini dal confronto col vecchio gestionale. **Segnalazioni**:
  "Trasmetti per l'installazione" ora è bloccato davvero (non solo un avviso testuale) finché mancano
  i dati del cliente (tipologia/profilo internet, arrivati dal form pubblico Richiesta Dati) o il
  contratto firmato — evita di avviare un'installazione con una pratica incompleta. **Ticket**:
  "Pianifica appuntamento" non porta più via al Calendario — mostra direttamente nel dettaglio gli
  slot già occupati nei prossimi 14 giorni e un mini-form "Assegna e fissa" che crea l'appuntamento
  sul posto, tecnico e indirizzo già precompilati dal ticket (`getSlotOccupatiProssimi()` in
  `calendario/actions.ts`). **Clienti**: riepilogo in cima alla pagina — clienti totali, nuovi questo
  mese, andamento ultimi 6 mesi — calcolato dalla prima attività di ciascun cliente nei Ticket,
  nessuna tabella nuova.
✅ Chat interna (2026-08, migrazione `0021`): widget flottante in basso a destra, visibile su tutte
  le pagine autenticate, con messaggi diretti 1-a-1 e un gruppo automatico per ciascun reparto
  (Analisi Rete/Commerciale/Fatturazione — la lista membri si calcola da `persone.reparti`, nessuna
  tabella di iscrizione da tenere allineata). Messaggi in tempo reale via **Supabase Realtime**
  (prima volta usato in questo progetto — `messaggi_chat` aggiunta alla pubblicazione
  `supabase_realtime`), allegati (bucket `documenti`, stesso giro service-role/URL firmata del
  resto del gestionale). **Qui, a differenza del resto dell'app, il controllo d'accesso è reale a
  livello di database (RLS)**, non solo applicativo: i messaggi sono dati privati, quindi non basta
  filtrarli nell'interfaccia — funzione SQL `persona_corrente_id()` (`auth.uid()` → riga `persone`)
  usata dalle policy su `conversazioni`/`messaggi_chat`. Nessun badge "non letti" e nessuna notifica
  Telegram in questo primo giro (scope deciso così esplicitamente).
✅ Chat — stato "Letto" e presenza online (2026-08, migrazione `0022`): nelle dirette, sotto
  l'ultimo messaggio inviato compare "Consegnato" o "Letto" a seconda che l'altra persona abbia
  aperto la conversazione dopo quel messaggio (`conversazioni_letture`, aggiornata in tempo reale
  quando l'altro apre/tiene aperto il thread). Pallino verde/grigio online-offline accanto a ogni
  persona nell'elenco contatti e nell'intestazione del thread, tramite la **Presence** di Supabase
  Realtime (effimera — nessuna tabella, "online" finché una scheda del gestionale resta aperta).
  Per i gruppi reparto, niente indicazione "letto da" in questo giro (avrebbe richiesto una UI
  "letto da N/M" più complessa — rimandato).
✅ Anagrafica Clienti (Aruba) (2026-08, migrazione `0023`): pagina in Mondo Business (`/clienti-esterni`,
  visibile a Commerciale/Fatturazione/Admin) con 3908 clienti importati dal database del sito
  pubblico — telefono, indirizzo, stato contratto, profilo internet, dati fiscali. Pulsante
  "Sincronizza ora" (solo admin, manuale — vedi sezione dedicata sopra sul perché non è un cron
  automatico) che rilegge tutto dal ponte PHP su Aruba. Ogni cambio di profilo internet rilevato da
  una sincronizzazione all'altra viene registrato in `clienti_esterni_storico_profilo` (trigger
  SQL, parte da zero da questa data — il database sorgente non conservava uno storico). Sola
  lettura dal gestionale: la fonte di verità resta Aruba.
✅ Scheda cliente unificata + Fatture (2026-08, migrazione `0024`): ogni cliente in Anagrafica
  Clienti apre una scheda dedicata (`/clienti-esterni/[id]`) con dati anagrafici, contratto e
  storico profili, **58972 fatture importate** (`fatture_esterne`, pulsante "Sincronizza fatture"
  separato — 59mila righe, troppe per un solo giro, paginato lato ponte PHP a blocchi di 5000) con
  totale fatturato/insoluti a colpo d'occhio, e i Ticket del gestionale collegati allo stesso
  cliente (abbinati per telefono, ultime 9 cifre — non c'è un CF su ogni Ticket per un abbinamento
  più preciso).
✅ Backfill dati reali da Aruba (2026-08, migrazioni `0025`-`0027`): **Tariffe** popolato con 21
  famiglie commerciali reali (dai profili grezzi in Aruba, raggruppati — es. "30hw Portabilità",
  "30HW portabilità", "30 Hw_2023" sono lo stesso piano; escluse le promo stagionali scadute come
  Black Friday/Xmas/Summer, che non hanno senso in un catalogo di piani correnti), senza prezzo
  mensile (da compilare a mano, non deducibile con certezza dalle fatture). **Dashboard**: "Ricavi
  del mese" ora dalle fatture vere (`fatture_esterne`) invece di `tickets.importo_fatturato` (quasi
  sempre vuoto); il pannello "per reparto" resta dai Ticket/rapportini, rietichettato per chiarezza.
  **Anagrafica Clienti**: pannello "Fatture insolute" (prima non esisteva alcun modo di vederle).
  **Clienti (Mondo Ticket)**: box "Da Anagrafica Aruba" quando un cliente è riconosciuto per
  telefono, accanto ai dati contrattuali manuali (canone/scadenza — non deducibili da Aruba).

  ★ **"Cliente attivo" ridefinito** (migrazione `0026`): il flag `contrattoattivo` di Aruba si è
  rivelato inaffidabile (2909 righe segnate attive, ma solo ~1800 clienti fatturati di recente — un
  confronto con l'utente ha confermato che il numero reale doveva stare tra 1800 e 2000). Analisi
  sulla data dell'ultima fattura per cliente: il conteggio si appiattisce nettamente dopo 60-90
  giorni (ciclo di fatturazione mensile/bimestrale), quindi **"attivo" ora significa "fatturato
  negli ultimi 90 giorni"** (`clienti_esterni.attivo`, colonna calcolata da `ricalcola_clienti_attivi()`,
  richiamata automaticamente ad ogni sincronizzazione — il vecchio flag Aruba resta come
  `contratto_attivo`, solo per riferimento). Risultato: **1773 clienti unici attivi**.

  ★★ **Due bug reali trovati e corretti in questo giro, entrambi sullo stesso tema — righe vs
  persone/dati completi:**
  1. Supabase limita ogni risposta a 1000 righe di default — con 3908 clienti importati, l'elenco
     Anagrafica Clienti e il calcolo del fatturato mensile (oltre 1000 fatture in certi mesi) ne
     mostravano/sommavano silenziosamente solo 1000. Corretto con `fetchTuttiClientiEsterni()`
     (`src/lib/clienti-esterni.ts`) e `sommaImportoFattureDa()` (`src/lib/analytics.ts`), entrambi
     paginati con `.range()`. **Qualunque nuova query su una tabella che può superare 1000 righe deve
     usare questo pattern.**
  2. La stessa prima versione della KPI "Clienti attivi" contava le **righe** con `attivo=true`
     (2688) invece delle **persone uniche** (1773) — 288 clienti hanno più di un contratto attivo
     insieme (es. più installazioni), quindi comparivano più volte. La KPI ora deduplica per
     CF/PIVA prima di contare.

✅ Fatture escluse se non di un cliente nostro (2026-08): 1181 fatture su 58972 (€ 518.837 totali)
  non avevano nessun CF/PIVA corrispondente in `clienti_esterni` — non falsi negativi di formato
  (verificato anche normalizzando maiuscole/spazi), ma nominativi realmente estranei all'anagrafica:
  in parte ex clienti mai rimossi da Aruba, in parte un'altra linea di business (ospitalità
  torri/ripetitori per radio — Radio Dimensione Suono, Radio Maria, TIM, EI Towers) mischiata per
  errore nella stessa tabella `fatture` di Aruba. Rimosse una tantum dal database (58972 → 57791) e
  **escluse da ora in poi** in `sincronizzaFattureAruba()` (confronta contro l'elenco clienti noti
  prima di scrivere, altrimenti riapparirebbero al prossimo "Sincronizza fatture"). Effetto sui
  numeri: fatturato del mese da € 113.296 a **€ 51.843** (le grandi fatture torri pesavano molto
  più del previsto), fatture insolute da 736 a 652, clienti attivi invariato (1773 — quelle fatture
  non contribuivano comunque, non avendo un cliente da abbinare).
✅ Catalogo Tariffe completo — tutti i 153 nomi (2026-08, migrazione `0028`): su richiesta esplicita
  dell'utente, oltre alle 21 famiglie raggruppate (`0025`/`0027`) sono state importate anche tutte
  le varianti grezze distinte trovate in Aruba, comprese promo stagionali/edizioni annuali (Black
  Friday, Xmas, Summer, Epic, Saldi Done...) — **164 tariffe totali**, tutte senza prezzo. Scelta
  deliberata di non consolidare: l'utente preferisce vederle tutte e occuparsi lui stesso di
  prezzi/consolidamento dall'interfaccia "Tariffe" (già supporta modifica/eliminazione per riga).
✅ IVA per Tariffa (2026-08, migrazione `0029`): ogni Tariffa ora ha `iva_inclusa` (default true) —
  quando si inserisce il prezzo mensile si sceglie se è già IVA inclusa (22%, aliquota unica per
  questi servizi) o al netto, con anteprima live di entrambi i valori nel form. Ovunque il prezzo è
  mostrato (elenco Tariffe, form pubblico Richiesta Dati) si vede sempre il totale IVA inclusa,
  calcolato con `prezziNettoLordo()` (`src/lib/types.ts`) indipendentemente da come è stato inserito.
✅ Dashboard — sezione "Anagrafica Clienti (Aruba)" (2026-08): nuovo pannello nella Dashboard
  generale (`getDatiAnagraficaAruba()` in `src/lib/analytics.ts`) con dati reali invece che dedotti
  dai Ticket: clienti attivi (deduplicati per CF/PIVA), fatture insolute (numero + importo),
  andamento del fatturato reale ultimi 6 mesi (grafico a barre) e distribuzione dei clienti attivi
  per profilo (top 8). Un solo giro paginato su `clienti_esterni` per ricavare sia il conteggio
  clienti sia la distribuzione profili, invece di due scansioni separate della tabella.
  `maxDuration = 30` sulla pagina (più query paginate di quante ne servano di norma).
✅ Dashboard — "Totali generali & Rendimenti" (2026-08, migrazione `0030`): fatturato storico totale
  (€ 2.977.426 su 57791 fatture), clienti in tutta la storia (2690), insoluto totale, e una riga di
  "rendimenti": % di clienti ancora attivi sul totale mai avuto, % di fatture incassate, valore
  medio fattura, ricavo medio mensile per cliente attivo (ARPU). Calcolati con una singola funzione
  SQL aggregata (`statistiche_generali_aruba()`) invece di scaricare 57mila+ fatture via rete per
  sommarle in JS — 690ms invece di una scansione paginata completa.
✅ Tariffe — listino prezzi reale (2026-07, migrazione `0032`): importato il listino interno
  fornito dall'utente (IVA esclusa) con prezzo, periodo di validità, eventuale promo (prezzo
  standard di rientro dopo la promo), vincolo contrattuale e periodicità di fatturazione
  (`promo`, `prezzo_post_promo`, `durata_vincolo`, `periodicita_fatturazione`, `valido_dal`,
  `valido_al` su `tariffe`). Match per nome tariffa normalizzato (case/spazi/trattini ignorati);
  quando un codice ha più righe con periodi di validità diversi (aumenti di prezzo nel tempo),
  si sceglie quella valida oggi, altrimenti la più recente. 159 tariffe già presenti aggiornate
  con il prezzo reale + 34 nuove inserite (vecchi profili Satellite/ADSL/Fibra presenti nel
  listino ma non tra i profili correnti dei clienti Aruba) — 198 tariffe totali, 193 con prezzo,
  solo 5 rimaste senza corrispondenza nel listino (nomi "base" senza edizione specifica, es.
  "Business 100" senza "- ed 2024/2026").
✅ Dashboard — fatturato per periodo con crescita/decrescita (2026-07, migrazione `0031`): la
  sezione "Statistiche per periodo" (stesso selettore 7/30/90gg + intervallo libero già in uso per
  le statistiche ticket/SLA) ora mostra anche fatturato, numero fatture e clienti attivi del
  periodo scelto, ciascuno con la percentuale di crescita/decrescita rispetto al periodo
  precedente di uguale durata, più fatture insolute nel periodo e i profili con più fatture (top
  8). Calcolato con due funzioni SQL (`statistiche_fatturato_periodo()`, `profili_per_periodo()`)
  chiamate due volte (periodo corrente + periodo precedente) invece di scaricare le fatture via
  rete. Verificato contro produzione: ultimi 30gg € 51.746 (+1,2%), 997 fatture (+13,9%), 947
  clienti attivi nel periodo (+12,6%).
✅ Tariffe — non più sottoscrivibili senza sparire, in pagina separata (2026-07, migrazione
  `0033`): la pagina Tariffe mostra solo le tariffe "Attive" (proposte ai nuovi clienti), con un
  link in fondo verso `/tariffe/non-sottoscrivibili` — pagina dedicata con lo stesso elenco/toggle
  ma per le tariffe disattivate (restano salvate, con prezzo e storico, per chi ce l'ha già).
  Componenti condivisi tra le due pagine (`RigaTariffa`, `FormTariffa` esportati da
  `tariffe-board.tsx`, riusati da `tariffe-archivio-board.tsx`). Toggle rapido a icona su ogni riga
  (`impostaSottoscrivibileTariffa()`) senza aprire il form.
✅ Tariffe — pubblica vs solo trattativa diretta + costo di attivazione (2026-07, migrazione
  `0033`): una tariffa attiva può non comparire nella documentazione inviata al cliente (form
  pubblico "Richiesta Dati") pur restando sottoscrivibile — nuovo campo `pubblica` (default true),
  toggle rapido a icona (occhio) sulla riga (`impostaPubblicaTariffa()`), filtro
  `.eq("pubblica", true)` aggiunto in `src/app/richiesta-dati/[id]/page.tsx` accanto al filtro
  `attivo`. Aggiunto anche `prezzo_attivazione` (costo una tantum, separato dal canone mensile) nel
  form Tariffa.
✅ Controllo d'oro (2026-07) — audit di sicurezza e coerenza su tutto il gestionale (RLS, uso
  service role, route pubbliche, secrets, sync Aruba, query non paginate). RLS/secrets/sync
  risultati puliti. Bug reali trovati e corretti:
  - 4 funzioni "URL firmata documento" (`urlAllegatoChat`, `urlDocumentoRichiesta`, `urlContratto`,
    `urlDocumentoRapportino`) controllavano solo che ci fosse una sessione valida, non che lo staff
    fosse ancora attivo (`persone.attivo`) — un dipendente disattivato ma con sessione ancora aperta
    poteva ottenere comunque URL firmate verso contratti/rapportini/allegati, perché sotto si passa
    alla service role che bypassa la RLS. Ora tutte usano `getPersonaCorrente()` (controlla
    `attivo`); `urlAllegatoChat` verifica in più l'appartenenza alla conversazione.
  - 3 query senza `.range()` non ancora coperte dal fix del limite delle 1000 righe (stesso bug già
    corretto due volte su `clienti_esterni`/`fatture_esterne`): `getRiepilogoInsoluti()`
    (`clienti-esterni/actions.ts`), il caricamento ticket di `/clienti` e i conteggi ticket/
    segnalazioni della Dashboard — tutte e tre ora paginano.
  - Ricerca globale e ricerca clienti nel form Ticket (`ricercaGlobale()`, `cercaClientiEsistenti()`)
    interpolavano il testo di ricerca senza escaping nella sintassi filtro `.or()` di PostgREST:
    una virgola o parentesi nel testo poteva alterare la combinazione dei filtri. Ora il testo viene
    ripulito da `,()` prima di essere usato.
  - Comparatore di ordinamento non valido in `getDatiReparto()` (`analytics.ts`) — non confrontava
    mai `b`, quindi l'ordine dei ticket non urgenti nella lista "attivi" restava indefinito.
  Segnalati ma non risolti (richiedono una decisione o un intervento fuori dal codice):
  `CRON_SECRET` va verificata impostata sull'ambiente Vercel di produzione (se assente, le route
  cron restano raggiungibili senza autenticazione); nessun rate limiting su
  `/api/portale/verifica-stato` e `/api/portale/apri-ticket`.
✅ `npm run lint` a zero errori (2026-08): i 10 errori pre-esistenti (`react-hooks/set-state-in-effect`
  in `calendario-board.tsx`, `segnalazioni-board.tsx`, `tickets-board.tsx` — sincronizzare stato da
  URL/localStorage in un `useEffect`, un pattern legittimo qui: derivare durante il render
  romperebbe l'idratazione SSR per le letture da `localStorage`) più 4 errori che il primo giro di
  audit non aveva mostrato per intero (`Date.now()` impuro in un Server Component, virgolette non
  escapate in `vista-tecnico/page.tsx`, un'altra istanza dello stesso pattern URL→stato in
  `calendario-board.tsx`) sono stati commentati/corretti caso per caso invece di essere ignorati in
  blocco — ognuno con una riga di commento che spiega perché l'effetto è corretto lì.
✅ Empty state nella Kanban Ticket e nei moduli Dashboard (2026-08): quando una colonna della
  Kanban (`tickets-board.tsx`) o un pannello a barre della Dashboard non ha righe da mostrare, ora
  compare un piccolo testo centrato e in grigio chiaro invece di uno spazio vuoto — messaggio
  specifico per contesto (es. "Nessun ticket in verifica al momento", "Nessuna fattura nel periodo
  selezionato") invece di un generico "Nessun ticket.". I pannelli "Profili con più fatture nel
  periodo" e "Clienti attivi per profilo" prima sparivano del tutto se vuoti — ora restano visibili
  con il loro empty state, così la sezione non "salta" a seconda dei dati.
✅ Formattazione valuta standardizzata (2026-08): nuova `formattaValuta()` (`src/lib/types.ts`),
  un unico `Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' })` invece di
  "€ " + `toLocaleString()` ripetuto a mano — applicata alla tabella Fatture della scheda cliente
  Aruba (`clienti-esterni/[id]/page.tsx`: totale fatturato, totale insoluto, importo di ogni riga),
  colonna Importo allineata a destra con cifre tabulari.
✅ Componente `StatusBadge` per i badge di stato (2026-08): nuovo `src/components/status-badge.tsx`
  con un'unica mappa stato→colori Tailwind (Da gestire/In lavorazione/In attesa/Completato/
  Annullato, Urgente/Normale/Bassa, stati Segnalazioni/Appuntamenti, Pagata/Insoluta,
  Attivo/Non attivo, Programmata/Scaduta) — prima ogni componente aveva la sua combinazione di
  classi ripetuta a mano, con lo stesso stato colorato in modo leggermente diverso da un punto
  all'altro. Applicato alla card ticket della Kanban (badge priorità) e al badge "Annullato" nel
  dettaglio ticket (`tickets-board.tsx`), e al badge di stato appuntamento nel Calendario
  (`calendario-board.tsx`). Stato non mappato → grigio neutro invece di rompere il rendering.
✅ Skeleton loader per la Dashboard (2026-08): la Dashboard (`/dashboard` e `/dashboard/[reparto]`)
  resta un Server Component — legge da Supabase direttamente durante il render, come tutte le
  altre pagine del gestionale, invece di introdurre un hook client-side con fetch verso API route
  dedicate (valutato e scartato: architettura diversa dal resto del progetto per un guadagno
  minimo, dato che qui i dati sono già pronti al primo render). Aggiunti `dashboard/loading.tsx` e
  `dashboard/[reparto]/loading.tsx`, mostrati automaticamente da Next.js (Suspense di routing)
  finché i dati non sono pronti, con sagome grigie animate (`src/components/ui/skeleton.tsx`) che
  ricalcano la struttura reale della pagina — al posto dei numeri a 0 visibili per un istante prima
  che arrivassero i dati veri.
✅ Controllo d'oro esteso a tutto il gestionale (2026-08) — audit sistematico (non a campione) su
  quattro fronti in parallelo: paginazione/query, autorizzazione di ogni Server Action, le 33
  migrazioni SQL/RLS, logica di business. Trovati e corretti:
  - **Critico** — `imposta_password_persona()` (migrazione 0006, `security definer`) era concessa
    a `authenticated` senza NESSUN controllo interno su chi chiama: qualunque utente loggato (anche
    non admin) poteva invocarla via RPC con l'id di un'ALTRA persona — incluso un admin — e
    resettarne la password/PIN del selettore "Tu sei", impersonandola. Il controllo "solo admin"
    esisteva solo lato applicazione (`verificaAdmin()` in `persone/actions.ts`), mai imposto dal
    database — e l'app non ha mai avuto bisogno del grant a `authenticated` (chiama la funzione
    sempre tramite la service role). Migrazione `0034`: revocato il grant, concesso solo a
    `service_role`. Stessa blindatura per `ricalcola_clienti_attivi()` (impatto minore: nessuna
    fuga di dati, solo un ricalcolo pesante invocabile da chiunque invece che solo dall'admin).
  - 2 funzioni che passano alla service role (bypassa la RLS) con lo stesso controllo insufficiente
    già trovato e corretto nell'audit precedente per le "URL firmate": `caricaContrattoSegnalazione()`
    e `completaTicketConRapportino()` verificavano solo un cookie persona valido, non `attivo` —
    ora usano `getPersonaCorrente()`. (`inviaAllegatoChat()`, segnalata dall'audit, verificato che è
    già al sicuro: il controllo di appartenenza alla conversazione passa dal client normale, quindi
    dalla RLS reale.)
  - 6 query senza `.range()` non ancora coperte dai fix precedenti, sullo stesso bug (troncamento
    silenzioso a 1000 righe): Archivio (ticket chiusi + segnalazioni trasmesse, senza limite
    temporale — il caso più a rischio in assoluto), la Kanban Ticket principale, la Kanban
    Segnalazioni, Richieste Clienti, e `getStatistichePeriodo()` (periodo scelto liberamente
    dall'utente in Dashboard). Volumi attuali ancora piccoli (1 ticket, 3 segnalazioni in
    produzione: il gestionale è appena partito) quindi nessun dato è mai stato davvero troncato —
    fix preventivo, stesso principio già applicato altrove nel progetto.
  - Eliminare una Tariffa o una Promozione era permesso a qualsiasi membro dello staff attivo, sia
    in app che via RLS (scelta della migrazione 0010/0020 originale) — su decisione esplicita
    dell'utente, ristretto a solo Admin: migrazione `0035` toglie la policy DELETE per il client
    normale (stesso approccio già usato per `persone`), `eliminaTariffa()`/`eliminaPromozione()`
    verificano `personaHaAccessoAdmin()` e passano dalla service role; il pulsante Elimina è
    nascosto in UI ai non-admin.
  - Verificato pulito (nessuna azione necessaria): logica di business (`analytics.ts`, definizione
    "cliente attivo", calcolo IVA, coerenza `pubblica`/`attivo` sulle Tariffe — nessun bug di
    correttezza trovato); copertura RLS su tutte le ~20 tabelle; nessuna policy duplicata/conflittuale;
    nessuna colonna/tabella referenziata prima di essere creata nelle 33 migrazioni.
  - Segnalato ma non risolto (rischio teorico, non un bug): un vincolo `unique` aggiunto in `0008`
    su una tabella già popolata — se all'epoca del deploy esistevano già righe duplicate la
    migrazione sarebbe fallita; non verificabile a posteriori e comunque già applicata con successo
    in produzione, note per migrazioni future dello stesso tipo. ~15 funzioni di lettura verificano
    solo `getPersonaCorrenteId()` (senza `attivo`) o nessun controllo applicativo, ma usano tutte il
    client normale: protette in tempo reale dalla RLS (`is_active_staff()` controlla `attivo` ad
    ogni query), non un buco sfruttabile — a differenza dei casi con service role, dove l'app era
    l'unica barriera.
✅ Fix critico: quasi tutte le rotte pubbliche erano bloccate dal proxy di autenticazione (2026-08):
  scoperto lavorando sull'esposizione del Portale su `area.donewifi.it` — `src/proxy.ts` elencava
  come pubbliche solo `/login` e `/richiesta-dati`, quindi un visitatore SENZA login veniva
  rimandato a `/login` anche su Portale clienti (`/portale` + `/api/portale/*`), Disdetta,
  Richiesta Cliente, Approvazione intervento via email, Privacy — e persino sui cron job
  (`/api/cron/*`, che Vercel Cron chiama senza sessione utente: probabilmente non hanno mai
  eseguito con successo). Di fatto quasi tutte le funzionalità "senza login" costruite in questa
  sessione erano irraggiungibili dal pubblico a cui erano rivolte. Aggiunte tutte le rotte mancanti
  a `ROTTE_PUBBLICHE`, verificato con curl (prima 307 verso /login, ora 200/405 corretti) che ogni
  rotta pubblica sia raggiungibile e che `/tickets` (interna) resti protetta.
✅ Portale clienti su `area.donewifi.it` (2026-08): su questo host la radice `/` mostra subito il
  Portale (`/portale`) invece della home interna — un cliente non deve conoscere l'URL `/portale`.
  Routing per host in `src/proxy.ts` (`DOMINI_PORTALE`), verificato con `curl -H "Host: ..."`.
  **Serve ancora, fuori dal codice**: aggiungere `area.donewifi.it` come dominio custom del
  progetto su Vercel e puntare un record DNS (CNAME) a Vercel dal pannello del registrar.
✅ Portale — telefono ed email obbligatori (2026-08): nel form "Apri un Ticket" del Portale
  clienti, prima bastava uno dei due (telefono O email); ora sono entrambi obbligatori — validati
  sia in `portale-tabs.tsx` (client) sia in `api/portale/apri-ticket/route.ts` (server, quella che
  conta davvero: l'endpoint è pubblico e chiamabile a prescindere dal form).
✅ Tipo di servizio sull'appuntamento — Nuova installazione vs Lavorazione tecnica (2026-08,
  migrazione `0037`): quando si pianifica un appuntamento a Calendario (sia dal Calendario stesso,
  sia dal pulsante "Pianifica appuntamento" dentro un Ticket), ora si sceglie anche il tipo di
  servizio — nuovo campo `appuntamenti.tipo_servizio` (enum, default `Lavorazione tecnica`). È
  quello che l'installatore vede subito nella sua scheda in Vista Tecnico (badge accanto al
  titolo), oltre che nell'elenco appuntamenti del Calendario — così sa se deve fare una prima
  attivazione o un intervento su un impianto già attivo prima ancora di aprire i dettagli. Colori
  aggiunti alla mappa condivisa `StatusBadge` invece di uno stile a parte.
✅ Schede di lavoro — Installazione vs Lavorazione tecnica (2026-08, migrazione `0038`): ex
  `Installazione.html`/`InterventoLoco.html` del vecchio gestionale, tornate come due form
  scelti automaticamente in Vista Tecnico dal `tipo_servizio` dell'appuntamento (migrazione 0037)
  quando l'installatore preme "Segna completato" — niente più due pulsanti/pagine separate da
  scegliere a mano.
  - **Scheda Installazione**: struttura esterna, cablaggio, dati radio/CPE, collaudo (ping/down/
    up), materiali extra, foto (struttura esterna + router/apparati interni), doppia firma
    (cliente + tecnico) — `src/components/schede/scheda-installazione-form.tsx`.
  - **Scheda Lavorazione Tecnica**: interventi rapidi a chip (stesse etichette del vecchio
    sistema), materiali, esito (Risolto/Parziale/In attesa/Non risolto), firma cliente —
    `src/components/schede/scheda-lavorazione-form.tsx`.
  - **Catalogo Materiali** (`/materiali`, nuova voce sidebar): prezzo, unità di misura, comodato
    d'uso gratuito — stesso pattern di Tariffe, condiviso dalle due schede tramite
    `SelettoreMateriali` (calcolo netto/IVA inclusa con `formattaValuta()`/`ALIQUOTA_IVA`
    esistenti, niente duplicazione).
  - Salvare una scheda (`salvaSchedaLavoro()`) completa in un solo passaggio sia l'appuntamento
    sia, se collegato, il Ticket (stato → Completato, evento Google Calendar aggiornato, email di
    chiusura al cliente) — stesso comportamento del vecchio gestionale. **Sostituisce** il
    rapportino generico solo quando il Ticket ha un appuntamento collegato (decisione esplicita
    dell'utente); un Ticket chiuso senza passare da un appuntamento continua a usare il
    rapportino generico esistente — mai entrambi sullo stesso Ticket.
  - Vista di sola lettura stampabile (`SchedaVista`, stesso principio di `RapportinoVista`: niente
    generazione PDF lato server, "Stampa/Salva PDF" del browser) mostrata nel dettaglio Ticket al
    posto del rapportino quando esiste una scheda.
  - Opzioni delle select della Scheda Installazione (supporto/cavo/CPE/router) sono un elenco
    fisso in `OPZIONI_INSTALLAZIONE` (con sempre "Altro" a fondo lista) invece di una pagina di
    amministrazione dedicata — cambiano raramente, non giustificavano altra UI per ora.
✅ Test sistematico di tutto il gestionale (2026-08) — nessun browser disponibile in sessione,
  quindi test automatizzato invece che a occhio: raggiungibilità/protezione di ogni rotta (tutte le
  ~20 protette bloccate correttamente per utenti non loggati, tutte le ~7 pubbliche raggiungibili),
  validazione degli endpoint pubblici (`/api/portale/*`, con ticket di prova creato e poi rimosso),
  ogni funzione SQL/RPC (`statistiche_generali_aruba`, `statistiche_fatturato_periodo`,
  `profili_per_periodo`, `ricalcola_clienti_attivi`) e ogni tabella chiave verificate contro
  produzione. Trovato e corretto un bug reale:
  - **`ricalcola_clienti_attivi()` falliva ad ogni chiamata** (`UPDATE requires a WHERE clause` —
    una protezione del database contro gli UPDATE non filtrati, probabilmente attivata dopo che la
    funzione fu scritta; l'UPDATE su tutte le righe di `clienti_esterni` è intenzionale, non un
    errore). L'errore veniva scartato in silenzio in `sincronizzaAnagraficaAruba()`/
    `sincronizzaFattureAruba()` (`clienti-esterni/actions.ts`): il flag "cliente attivo" mostrato
    in tutta l'app aveva smesso di aggiornarsi dopo ogni sincronizzazione, senza errori visibili.
    Corretto con `where true` (migrazione `0039`, stesso comportamento, soddisfa la protezione) e
    l'errore ora torna al chiamante invece di sparire. Stesso fix di robustezza applicato a
    `reimpostaPasswordPersona()` (`persone/actions.ts`): l'errore sulla sincronizzazione del PIN
    "Tu sei" ora torna come avviso invece di sparire.
  - ⚠️ **Incidente durante il test**: nel verificare `imposta_password_persona()`, una query senza
    filtro esplicito ha chiamato la funzione su una Persona presa a caso con una password di prova,
    sovrascrivendone il PIN "Tu sei" reale — non è possibile determinare quale delle Persone sia
    stata toccata né recuperare il PIN precedente (salvato solo come hash). Segnalato all'utente;
    da verificare con il team e reimpostare da `/persone` se necessario.
✅ Posizione GPS precisa nella Scheda Installazione (2026-08, migrazione `0040`): il campo
  "Posizione" esistente era solo testo libero (es. "Balcone, tetto") — aggiunto un pulsante "Rileva
  posizione GPS" (`navigator.geolocation`) che cattura lat/lng/precisione dal telefono
  dell'installatore al momento della compilazione, con link diretto a Google Maps sia nel form sia
  nella vista di sola lettura della scheda salvata. Facoltativo, non blocca il salvataggio se il
  browser nega il permesso o non lo supporta.
✅ Catalogo Materiali — categoria, descrizione, prezzi Privato/Business (2026-08, migrazione
  `0041`): il listino non è più solo "materiali fisici per installazioni" ma un listino
  servizi/prodotti completo (trasferimenti, attivazioni, variazioni, interventi tecnici, WLINK,
  materiali, router/switch/AP, CPE) — nuovi campi `categoria` (raggruppa la lista, con datalist
  delle categorie già usate) e `descrizione` facoltativa. Regola prezzi: il prezzo salvato è
  sempre quello per un cliente **Privato** (IVA inclusa); un cliente **Business** paga lo stesso
  importo trattato come imponibile + IVA 22% aggiunta in fattura — un solo prezzo per riga, non
  due colonne (`prezzoPerTipoCliente()` in `src/lib/types.ts`). `SelettoreMateriali` (usato dalle
  Schede) ha un toggle Privato/Business che decide quale dei due prezzi finisce nella riga
  aggiunta. Importati i 40 materiali/servizi del listino reale fornito dall'utente.
✅ Calendario — grafica molto più semplice, viste Giorno/Settimana/Mese (2026-08): sostituita
  l'unica lista cronologica infinita con tre viste scelte dall'URL (`?vista=giorno|settimana|mese`,
  stesso pattern GET/link della Dashboard invece di stato client), con navigazione ← [periodo] →
  e "Oggi". **Giorno**: la stessa lista di righe di prima, ma per un solo giorno. **Settimana**: 7
  colonne Lun–Dom con appuntamenti/promemoria compatti, clic per aprire. **Mese**: griglia
  calendario con pallini numerati (appuntamenti/promemoria) per giorno, clic su un giorno per
  aprirlo in vista Giorno. `calendario/page.tsx` calcola il range da interrogare in base alla
  vista scelta (solo quel giorno, la settimana, o l'intera griglia del mese comprese le code dei
  mesi adiacenti) invece di scaricare sempre "da 7 giorni fa in poi" senza limite superiore.
  Creazione/modifica appuntamento, promemoria e completamento invariati (stessi Sheet/azioni).
✅ Calendario — importa anche gli eventi già su Google "Done | Appuntamenti" (2026-08): finora
  `src/lib/google-calendar.ts` era solo in scrittura (ogni Appuntamento creato qui diventava un
  evento Google, ma non il contrario). Nuova `listaEventiGoogleCalendario()` legge dallo stesso
  calendario gli eventi nel range visualizzato e li mostra nelle tre viste insieme agli
  Appuntamenti veri — badge tratteggiato "Google", sola lettura (niente tipo_servizio/ticket
  collegato, non modificabili da qui), con link per aprirli su Google Calendar. Gli Appuntamenti
  già creati dal gestionale (che finiscono anche loro su quello stesso calendario) vengono esclusi
  dalla lettura via `google_event_id`, altrimenti comparirebbero due volte. Nessuna migrazione:
  stesse credenziali già usate per la scrittura (`GOOGLE_SERVICE_ACCOUNT_EMAIL/_PRIVATE_KEY`,
  `GOOGLE_CALENDAR_ID`); se non configurate il Calendario funziona comunque, semplicemente senza
  eventi Google (stesso comportamento "non blocca mai" già in uso per la scrittura).
✅ Mondo Ticket riorganizzato per settore (2026-08): la striscia unica di KPI e il pannello "Serve
  attenzione ora" aggregati su tutta l'azienda diventano una colonna per settore (Analisi Rete/
  Commerciale/Fatturazione, `REPARTI_ELENCO` di `analytics.ts`) — ognuna con i propri Urgenti/Non
  presi in carico/Aperti/Completati oggi e i propri ticket che richiedono attenzione, invece di un
  totale unico che mischiava i tre reparti. Chi ha un solo settore vede solo la sua colonna, un
  admin le vede tutte affiancate (`grid-cols-3`). Segnalazioni/Calendario/Vista Tecnico restano
  moduli condivisi sotto ("Strumenti condivisi"): non hanno un reparto proprio nei dati. Ambito
  volutamente limitato alla home — sidebar e altre pagine invariate (scelta esplicita dell'utente
  tra le opzioni proposte).
✅ Sidebar riorganizzata: nuovo "Mondo Operazioni" (2026-08): Calendario e Materiali erano finiti
  sotto "Mondo Ticket" solo perché aggiunti di recente, pur non essendo flusso ticket — richiesto
  esplicitamente dall'utente dopo averlo notato nell'app reale. Nuovo mondo dedicato
  ("Mondo Operazioni", icona chiave inglese) con solo Calendario e Materiali. "Clienti" si sposta
  da Mondo Ticket a Mondo Business, accanto ad "Anagrafica Clienti" — stesso posto concettuale
  (entrambe anagrafiche cliente) anche se dati diversi (una dai Ticket, l'altra da Aruba). Mondo
  Ticket resta con solo il flusso vero e proprio: Mondo Ticket, Ticket, Segnalazioni, Vista
  Tecnico, Archivio.
✅ Vista Tecnico — il tecnico può aprire da solo un Ticket (2026-08): pulsante "Nuovo Ticket" in
  cima a Vista Tecnico con due sole scelte, pensate per il campo invece del form generico completo
  di `/tickets/nuovo` — "Nuovo contratto" (categoria Commerciale, reparto Commerciale, avvia poi un
  appuntamento di tipo "Nuova installazione") o "Intervento in loco" (categoria Assistenza, reparto
  Analisi Rete, appuntamento "Lavorazione tecnica"); stesse categoria/sottocategoria del form
  normale, quindi il ticket è indistinguibile da uno creato dall'ufficio. Il ticket creato si
  autoassegna subito al tecnico corrente (`tecnico_assegnato`, nessuna migrazione: colonna già
  esistente) e la Sheet passa senza uscire alla pianificazione dell'appuntamento, riusando
  `PianificaAppuntamento` di `tickets-board.tsx` (esportato, non più locale al file) con
  `tipo_servizio` già preselezionato in base alla scelta — da lì il flusso è quello già esistente:
  l'appuntamento pianificato compare in Vista Tecnico, "Segna completato" apre la Scheda giusta
  (Installazione o Lavorazione tecnica, migrazione 0038) che chiude appuntamento e ticket insieme.
  `creaTicket()` accetta ora un `tecnicoAssegnato` opzionale e ritorna la riga ticket completa
  (prima solo `id, numero`) per poter passare subito al passo di pianificazione senza una query in
  più.
✅ Revisione tipi di Ticket — collegati i due sistemi scollegati (2026-08): confrontando tutte le 14
  sottocategorie (campi extra interni di `campi-ticket.ts` contro le 5 "pratiche" pubbliche di
  `richieste-cliente-config.ts`) sono emerse incongruenze mai notate prima, corrette qui:
  - **Nomi allineati**: sottocategoria "Trasferimento impianto" → **"Trasferimento"**, "Cambio
    anagrafico" → **"Cambio Anagrafica"** — ora coincidono esattamente col nome della pratica
    pubblica corrispondente (prima erano quasi identici ma diversi, facile scegliere quello
    sbagliato). Rinominata solo la lista opzioni: i Ticket già creati mantengono il vecchio testo
    salvato, nessuna migrazione necessaria (campo testo libero, non un enum).
  - **Pannello "Invia una pratica al cliente" ora si preseleziona da solo**: nuova mappa
    `PRATICA_PER_SOTTOCATEGORIA` in `tickets-board.tsx` — se la sottocategoria del Ticket aperto è
    Trasferimento/Subentro/Cambio IBAN/Cambio Anagrafica/Disdetta, la pratica giusta è già scelta
    (e marcata "consigliata" nel menu) invece di partire vuota; prima lo staff doveva sapere a
    memoria quale delle 5 pratiche corrispondesse. Aggiunto anche `key={ticket.id}` su
    `DettaglioTicket` così lo stato del pannello non resta quello del Ticket precedente se se ne
    apre un altro senza chiudere la Sheet.
  - **3 sottocategorie senza campi propri** (Trasferimento, Subentro, Cambio IBAN — tutta la
    raccolta dati passa dal link pubblico) ora mostrano un `info` esplicito invece di apparire
    semplicemente vuote: "invia la pratica pubblica X dal dettaglio del Ticket".
  - **Upgrade/Downgrade collegato al catalogo Tariffe reale**: il "Nuovo profilo desiderato" leggeva
    6 nomi scritti a mano nel codice (`Connect 30/50/100`, `Business 30/50/100`), scollegati dalle
    tariffe vere gestite in Mondo Business. Nuova `listaNomiTariffeAttive()` (`tickets/actions.ts`)
    legge i nomi distinti delle tariffe `attivo = true` (8 in produzione oggi) e li usa come opzioni;
    la vecchia lista resta come fallback solo se il caricamento fallisce o il catalogo è vuoto.
✅ Richiesta Dati — nuovo step "Scegli il tuo piano" prima dei dati anagrafici (2026-08): il form
  pubblico era un'unica pagina con "Profilo internet" come tendina anonima in mezzo a CF/IBAN/
  documenti. Ora è in 2 passi: `RichiestaDatiFlow` (`src/components/richiesta-dati/`) mostra prima
  `ConfiguratorePiano` — Tipologia Cliente, profilo internet (tariffe `pubblica=true` filtrate per
  tipologia), router (Incluso / Tp-link EX141 44,99€ / Tp-link EX520v 74,99€) ed extender mesh
  opzionale (Tp-link HX141, 46,99€), con riepilogo live di canone mensile e costo una tantum
  (attivazione + apparati, stessa regola Privato/Business di `prezzoPerTipoCliente()`) — poi, solo
  dopo "Conferma e continua", il form esistente con anagrafica/pagamento/documenti, che mostra il
  piano scelto in un riepilogo con link "Cambia" invece di richiederlo di nuovo. Router/extender
  vengono dal catalogo Materiali già esistente (categoria "ROUTER, EXTENDER, POWER LINE, SWITCH E
  AP", solo le voci Tp-link — verificato in produzione: EX141/HX141/EX520v), non una lista nuova.
  Nessuna migrazione: router/extender scelti finiscono in `richieste_clienti.dettagli` (jsonb) come
  gli altri campi extra, la route `/api/richiesta-dati` non è stata toccata (cattura già in automatico
  ogni campo del FormData non riservato).
✅ Flusso Segnalazione → Installazione — 4 correzioni dalla revisione end-to-end (2026-08):
  - **Gate di "Trasmetti per l'installazione" spostato lato server**: il controllo (dati cliente
    completi + contratto caricato) viveva solo nel pulsante disabilitato in React —
    `trasmettiPerInstallazione()` ora rifiuta la trasmissione anche se chiamata direttamente,
    unica fonte di verità. Verificato contro produzione: nessuna Segnalazione già "Trasmessa"
    sarebbe stata bloccata dal nuovo controllo.
  - **`tipo_servizio` preselezionato su "Nuova installazione"** quando si pianifica l'appuntamento
    di un Ticket nato da una Segnalazione (`ticket.segnalazione_id` valorizzato) — prima il menu
    partiva sempre su "Lavorazione tecnica" come per qualunque altro Ticket, rischiando la Scheda
    sbagliata sul campo se chi pianificava non se ne accorgeva.
  - **Bacheca Segnalazioni, colonna "Gestione Cliente"**: le pratiche con dati/documenti già
    ricevuti dal cliente salgono in cima (badge verde "Dati ricevuti") invece di restare mescolate
    e scoprirlo solo aprendo la card; quelle ancora in attesa da ≥3 giorni dall'invio del link
    (`documenti_richiesti_at`) mostrano un avviso "in attesa da Ng" sullo stesso stile già in uso
    per Da Contattare/In Contatto — nessuno stato nuovo, nessuna migrazione, solo segnali visivi.
  - **Reparto alla trasmissione, da fisso a scelto**: `trasmettiPerInstallazione()` accetta ora un
    parametro `reparto` (default `"Analisi Rete"`, invariato per il caso normale), scelto da un
    piccolo select comparso sopra "Trasmetti per l'installazione" — prima era cablato nel codice
    senza modo di derogare per un'eccezione.
  - **Tracciabilità del contratto resa visibile**: "chi ha caricato quale contratto e quando" era
    già in `storico` (voce "Contratto caricato" con `operatore_id`), solo mai mostrato nella scheda
    della Segnalazione — bisognava aprire l'Archivio a parte. Nuova `getUltimoCaricamentoContratto()`
    lo recupera (join `storico.operatore_id → persone.nome`) e lo mostra sotto il contratto insieme
    a un avviso esplicito: "upload manuale del PDF già firmato, nessuna firma elettronica integrata
    nel gestionale" — non finge una firma elettronica che non c'è, chiarisce cosa il sistema
    garantisce davvero. Una vera firma elettronica (verifica legale di chi firma) richiederebbe un
    fornitore esterno a pagamento: scelta del cliente, non una correzione di codice — non implementata.
✅ Controllo d'oro — tutti i 13 punti (codice) corretti (2026-08): 4 audit paralleli in sola lettura su
  tutto il gestionale (sicurezza/permessi, integrità dati/query, moduli non ancora rivisti, regressioni
  recenti) hanno trovato 14 punti; tutti quelli risolvibili da codice sono stati corretti in un solo giro:
  - **Sicurezza**: `creaTicket()` controllava solo il cookie di sessione, non se la Persona fosse
    ancora `attivo`, prima di usare la service role per l'upload di un allegato — stesso bug già
    corretto altrove, qui rimasto scoperto (fix: `getPersonaCorrente(supabase)` invece di
    `getPersonaCorrenteId()`). Vista Tecnico aveva lo stesso rischio nel suo nuovo flusso
    "Nuovo Ticket" self-service, risolto transitivamente dallo stesso fix (chiama `creaTicket()`).
    `/api/cron/*` ora **fallisce chiuso** (401) in produzione se `CRON_SECRET` non è impostato, invece
    di lasciar passare la richiesta — **verificare che `CRON_SECRET` sia impostato su Vercel prima del
    prossimo deploy, altrimenti i due cron (pulizia documenti, promemoria ticket) si disattivano**.
    `/api/portale/verifica-stato` (numero ticket + telefono, unico punto pubblico con ID indovinabile)
    ha ora un rate limit in memoria per IP (8 tentativi/5 minuti — non perfetto su serverless, si azzera
    ad ogni cold start, ma alza comunque il costo di un tentativo automatizzato senza bisogno di
    infrastruttura esterna). Token di approvazione intervento (`/api/approva/[token]`) ora scade dopo
    30 giorni se mai usato (prima: valido per sempre).
  - **Integrità dati**: `salvaSchedaLavoro()` non controllava l'errore dell'update sul Ticket prima di
    scrivere lo storico e mandare l'email di chiusura al cliente — un fallimento silenzioso poteva far
    dire "intervento concluso" al cliente mentre il Ticket restava al vecchio stato. `getDatiAmministrazione()`/
    `getDatiReparto()` (`src/lib/analytics.ts`, nuovo helper `fetchTuttoPaginato()`) e `getFattureCliente()`
    (`clienti-esterni/actions.ts`) non paginavano — stesso bug del limite 1000 righe già corretto più
    volte in questo progetto, stragglers rimasti in Dashboard Amministrazione e nello storico fatture
    di un singolo cliente.
  - **Dati d'ingresso**: Materiali e Tariffe accettavano prezzi negativi (solo `min="0"` lato HTML,
    aggirabile) — validazione server-side aggiunta in entrambi gli `actions.ts` (verificato: 0 prezzi
    negativi già in produzione, nessun dato da correggere a mano).
  - **Sincronizzazione Aruba**: un fallimento a metà upsert (nessuna transazione, a blocchi) lasciava
    dati anagrafica/fatture parzialmente aggiornati con solo un errore generico come segnale — i
    messaggi d'errore ora dicono esplicitamente quante righe sono state scritte prima dell'interruzione
    e che i dati sono parzialmente aggiornati, mostrati in giallo invece che come testo neutro.
  - **Chiarezza per chi legge la Dashboard**: il pannello "Ricavi da rapportino per reparto" (quasi
    sempre vicino a zero per come è popolato, mai stato pensato come fatturato reale) ora ha una nota
    esplicita che rimanda a "Ricavi del mese" per il numero vero.
  - **Coerenza dati**: nuova migrazione `0042_backfill_sottocategorie_rinominate.sql` per i Ticket
    creati prima del rinomino "Trasferimento impianto"/"Cambio anagrafico" di ieri (verificato: 0 righe
    da aggiornare in produzione oggi, ma da applicare comunque per correttezza/ambienti futuri).
  - **UX**: il percorso rapido "Nuovo Ticket" di Vista Tecnico avvisa (sia subito dopo la creazione sia
    riaprendo il Ticket, nuovo componente `CampiMancanti` in `tickets-board.tsx`, generico per
    qualunque sottocategoria) quando mancano campi obbligatori — vedi sotto, per "Nuovo contratto"/
    "Intervento in loco" non dovrebbe più succedere. `RichiestaDatiFlow` non smonta più
    `RichiestaDatiForm` quando si torna a "Scegli il tuo piano" — prima "Cambia" perdeva
    CF/telefono/IBAN già scritti dal cliente.
  - **Non nel codice**: "vera" firma elettronica del contratto (richiede un fornitore esterno a
    pagamento, decisione del cliente non del codice — la tracciabilità di chi/quando è comunque ora
    visibile, vedi sopra).
✅ Vista Tecnico "Nuovo Ticket" raccoglie davvero i campi obbligatori (2026-08, seguito del controllo
  d'oro): il percorso rapido creava il Ticket con `dettagliExtra: {}`, saltando Tipologia
  Cliente/indirizzo di attivazione/ripetitore/velocità massima ("Nuovo contratto") o
  disponibilità/data preferita ("Intervento in loco") — l'ufficio doveva accorgersene aprendo il
  Ticket e completarli a mano, il banner `CampiMancanti` li segnalava ma non li raccoglieva.
  `NuovoTicketTecnico` ora renderizza dinamicamente `CONFIG_SOTTOCATEGORIE[tipo].campi` (stessa
  configurazione del form completo `/tickets/nuovo`, stesso pattern select/text/textarea/file),
  valida i campi obbligatori prima di inviare e passa `dettagliExtra` compilato a `creaTicket()` —
  il Ticket creato dal campo è ora identico, dati compresi, a uno creato dall'ufficio. Il banner
  `CampiMancanti` resta come rete di sicurezza generica (altre sottocategoria, o eventuali gap
  futuri), non serve più localmente qui.
⏳ Build di produzione verificata in locale; test end-to-end manuale (creare una Segnalazione →
  Gestione Cliente → compilare Richiesta Dati → Trasmetti → controllare il Ticket, e il nuovo
  rapportino di chiusura) ancora da fare con dati reali.

Fuori scope per ora: Storico Modifiche (UI, non prioritario per ora). I contratti si continuano a
generare sul gestionale esterno esistente — qui si carica solo il PDF già pronto (vedi sopra),
niente generazione automatica.

Con Portale e Approvazione migrati, il vecchio gestionale Apps Script non ha più flussi pubblici
esclusivi (restano solo `approvaEmail`/`Portale`/`RichiestaDati`/ecc. come fallback per i link già
inviati ai clienti prima di questa migrazione) — valutare in futuro se e quando reindirizzare
anche `area.donewifi.it` a questo gestionale, una volta esauriti i link vecchi in circolazione.