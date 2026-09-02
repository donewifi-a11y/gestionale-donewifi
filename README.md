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
✅ Promemoria automatico per Richiesta Dati senza risposta (2026-08): dalla revisione del flusso
  Segnalazione→Installazione era emerso che nessun promemoria fosse collegato all'invio della
  Richiesta Dati — una pratica "Gestione Cliente" con link mandato ma senza risposta del cliente
  restava silenziosa finché uno staff non se ne accorgeva scorrendo la bacheca (il badge "in attesa
  da Ng" è solo visivo). Il piano Vercel di questo progetto è Hobby (limite 2 cron job, già entrambi
  occupati da `pulizia-documenti` e `promemoria-ticket`) — niente terzo cron: il controllo si
  aggiunge dentro `promemoria-ticket` (`src/app/api/cron/promemoria-ticket/route.ts`), che ora
  interroga anche `segnalazioni` (stato `Gestione Cliente`, `dati_ricevuti_at` nullo,
  `documenti_richiesti_at` più vecchio di 3 giorni — stessa soglia del badge nella bacheca) e manda
  un avviso Telegram al reparto Commerciale con l'elenco. Verificato contro produzione: la query
  intercetta correttamente le 2 pratiche reali già ferme dal 2026-07-30.
✅ Backup database automatico via GitHub Actions (2026-08): verificato nel pannello Supabase — progetto
  sul piano **Free**, "Last backup: No backups", nessuna rete di sicurezza attiva sui dati reali
  (Ticket, Segnalazioni, Anagrafica Aruba, fatture, persone...). Niente cron Vercel (limite 2 sul
  piano Hobby, già occupati) e nessun upgrade Supabase richiesto: nuovo workflow
  `.github/workflows/backup-database.yml`, gira ogni notte alle 03:00 UTC (gratuito su GitHub
  Actions), fa un `pg_dump` dello schema `public` (via **Session pooler**, l'unica connessione diretta
  compatibile IPv4 — i runner GitHub non hanno IPv6, la connessione "Direct" di Supabase avrebbe
  richiesto l'add-on IPv4 a pagamento) e carica il dump compresso come artifact con 90 giorni di
  retention. Fallisce esplicitamente (non silenziosamente) se il dump è sospettosamente piccolo
  (&lt;1000 byte, probabile errore di connessione/permessi) — GitHub avvisa via email di default sui
  workflow falliti. Richiede il secret `SUPABASE_DB_URL` nel repository GitHub (Settings → Secrets and
  variables → Actions), impostato manualmente dall'utente il 2026-08-05 (mai passato per il codice o
  per `.env.local` — solo il secret GitHub lo conosce). **Cosa non copre**: i file caricati su Supabase
  Storage (contratti PDF, foto documenti d'identità, foto/firme rapportini) non sono righe di
  database — `pg_dump` non li tocca, restano protetti solo dall'infrastruttura Supabase stessa.
  **Per ripristinare** un dump: `gunzip -c backup-donewifi-AAAA-MM-GG.sql.gz | psql "$SUPABASE_DB_URL"`
  (scaricando prima l'artifact dalla tab Actions del repository). **Da riprendere**: il primo run è
  fallito due volte (password non percent-encoded nel secret, poi da verificare) — messo in pausa su
  richiesta esplicita per passare ai to-do personali, da chiudere in un secondo momento.
✅ To-do personali (2026-08): un "angolo" privato per ciascuna Persona, richiesto esplicitamente —
  cose da fare proprie, non legate a Ticket/Segnalazioni/Calendario e non condivise con nessun altro.
  Stesso pattern architetturale della chat interna, e soprattutto **RLS reale** sulla nuova tabella
  `todo_personali` (migrazione `0043_todo_personali.sql`, da applicare via SQL Editor) invece del
  solito controllo solo applicativo: riusa la stessa `persona_corrente_id()` già definita per la chat
  (migrazione `0021`), nessuna nuova funzione. Un utente non può vedere né toccare i to-do di un altro
  nemmeno interrogando
  la tabella direttamente via REST — dati personali, stesso livello di protezione dei messaggi chat.
  Niente Realtime qui (a differenza della chat): un solo proprietario per lista, basta un refresh dopo
  ogni azione. Azioni: `getTodoPersonali`/`creaTodoPersonale`/`completaTodoPersonale`/
  `eliminaTodoPersonale` (`src/app/(app)/todo/actions.ts`).
✅ Chat e To-Do: da pulsanti flottanti a riquadri + pop-up richiamabile (2026-08, seguito immediato):
  "troppi pulsanti in giro", segnalato esplicitamente — prima chat e to-do erano due pulsanti circolari
  sempre visibili, uno per angolo, su ogni pagina. Refactor: il contenuto di entrambi è stato estratto
  dal proprio widget flottante in un componente puro riutilizzabile (`ChatPanel`/`TodoPanel`, prop
  `variant: "popup" | "riquadro"`), usato in due punti diversi:
  - **Riquadri fissi in home** (`src/app/(app)/page.tsx`, "Mondo Ticket"): chat e to-do compaiono per
    intero, sempre visibili, appena sotto i Promemoria — non serve più aprire nulla per vederli.
  - **Pop-up richiamabile da ogni sezione**: due pulsanti compatti in fondo alla sidebar ("Chat" /
    "To-Do", sopra il selettore Persona) al posto dei due FAB permanenti — aprono lo stesso pannello
    come overlay, uno alla volta (nuovo stato condiviso in `AppShell`, `src/components/app-shell.tsx`,
    che ora sostituisce il rendering diretto di sidebar+contenuto+widget in `layout.tsx`). Chiuso di
    default, compare solo quando richiamato, invece di occupare permanentemente un angolo dello
    schermo su ogni pagina.
  Nessuna migrazione, nessuna modifica ai dati — solo dove/come viene mostrato lo stesso contenuto.
✅ FIX — crash aprendo la chat dopo il refactor sopra (2026-08, segnalato dall'utente con screenshot
  console): `ChatPanel` può ora essere montata due volte insieme (riquadro fisso in home + pop-up),
  ma il client Realtime di Supabase deduplica i canali per nome — la seconda istanza otteneva lo
  stesso canale di presenza `presenza-online` già sottoscritto dalla prima, e chiamarci sopra
  `.on("presence", ...)` dopo `.subscribe()` lancia un errore fatale che mandava in crash l'intera
  pagina ("This page couldn't load"). Fix: la sottoscrizione di presenza si fa ora una sola volta,
  in un `OnlineProvider` condiviso (`src/components/chat/online-context.tsx`, montato in
  `AppShell`) — le due `ChatPanel` leggono lo stato online da lì invece di iscriversi ciascuna per
  conto proprio. Stesso rischio, individuato preventivamente e corretto, anche sul canale
  messaggi per-conversazione: se la stessa conversazione viene aperta in entrambe le istanze, il
  nome del canale include ora un suffisso univoco per istanza (`useId()`) così il client non le
  fonde in una sola sottoscrizione — lì, a differenza della presenza, ogni istanza vuole restare
  indipendente, non condivisa.
✅ Chat e To-Do — dalla revisione funzionale richiesta esplicitamente, prodotto completato (2026-08):
  - **Stato condiviso tra riquadro e pop-up** (il problema di fondo dietro quasi tutti gli altri):
    nuovi `ChatDataProvider`/`TodoDataProvider` (montati una sola volta in `AppShell`, come
    `OnlineProvider`) invece di ogni istanza con il proprio stato locale — completare un to-do o
    leggere un messaggio in un punto si riflette subito ovunque, nessun disallineamento.
  - **Badge non letti/da fare sui due pulsanti in sidebar**: il conteggio to-do (perso nel passaggio
    dal vecchio pulsante flottante) è tornato, e la chat ne ha uno nuovo (prima non esisteva alcun
    indicatore di messaggi non letti).
  - **Chat: elenco "conversazioni" invece di solo "a chi scrivo"** — `getContattiChat()`
    (`src/app/(app)/chat/actions.ts`) calcola ora anche anteprima dell'ultimo messaggio, orario e
    conteggio non letti per ciascun contatto/gruppo (3 query, aggregate in JS — volume del team
    troppo piccolo per giustificare una funzione SQL dedicata), e l'elenco si ordina non letti prima,
    poi per recenza, chi non ha mai scritto per ultimo. Verificato lo shape delle query contro i dati
    reali di produzione (5 conversazioni, 4 messaggi).
  - **To-Do: modifica testo** (nuova `modificaTodoPersonale()`) — prima un refuso richiedeva
    cancellare e riscrivere, ora c'è una matita che apre modifica inline.
  - **To-Do: conferma prima di eliminare** — il cestino chiede conferma invece di cancellare subito.
✅ Controllo d'oro #2 — software/UX/UI, tutti i 19 punti corretti (2026-08): 3 audit paralleli (qualità
  codice/architettura, flussi UX end-to-end, coerenza UI/design system — quest'ultima solo a livello
  di codice, nessun browser disponibile) hanno trovato 19 punti; tutti corretti in un solo giro.
  - **`alert()` → toast**: 14 popup nativi del browser (il peggiore: 4 nella chat da sola) sostituiti
    da un `ToastProvider`/`useToast()` condiviso (`src/components/ui/toast.tsx`, montato in
    `AppShell`) — non bloccante, coerente con lo stile di errore inline già in uso ovunque altro.
  - **Riquadri Chat/To-Do**: altezza `h-[min(…, Nvh)]` invece di fissa in pixel — non tagliano più su
    schermi bassi/orizzontali.
  - **Dashboard per reparto**: aggiunto lo stesso avviso "non è il fatturato reale" già presente sulla
    Dashboard generale ma dimenticato qui.
  - **~15 azioni di sola lettura**: errore Supabase non più scartato in silenzio (loggato lato
    server) — un guasto reale non sembra più "nessun dato".
  - **Cast non tipizzati**: `getRapportinoTicket`/`getSchedaLavoroPerTicket` dichiarano ora il tipo di
    ritorno vero (i 3 cast `as` nei chiamanti sono spariti, non più necessari); i due `as unknown as`
    sui join Supabase (contratto Segnalazione, pagina Approva) sostituiti da un'interfaccia dichiarata
    esplicitamente invece di "fidati e basta".
  - **Calendario**: nuovo `raggruppaPerGiorno()` condiviso + `useMemo` in VistaSettimana/VistaMese —
    non rifiltrano più l'intero array ad ogni cella/render.
  - **Filtri persistiti**: nuovo hook `usePersistedState()` (`src/lib/use-persisted-state.ts`) al
    posto della stessa logica localStorage duplicata quasi identica in tickets-board.tsx e
    segnalazioni-board.tsx (i commenti si citavano a vicenda riconoscendolo).
  - **URL firmate**: nuovo `urlFirmataDocumento()` (`src/lib/documenti.ts`) al posto dello stesso
    `createSignedUrl(percorso, 3600)` incollato in 5 file di azioni diverse.
  - **Dashboard**: "Ticket Urgenti"/"Non assegnati" mostrano ora anche la percentuale sugli attivi
    (es. "13% degli attivi") — niente storico salvato da confrontare con ieri, ma un contesto onesto
    con i dati già disponibili invece di un confronto storico inventato.
  - **Persone vs Utenti**: le due pagine ora si rimandano a vicenda con una nota, invece di
    sovrapporsi senza nessun collegamento.
  - **Chat**: stato online/offline ora anche in testo visibile (prima solo colore + `title`, che sui
    telefoni non compare mai).
  - **Chat/To-Do**: bozza non inviata salvata in sessionStorage — chiudere il pop-up per sbaglio non
    perde più il testo scritto (stesso principio di WhatsApp Web, non un popup di conferma in più).
  - **Home**: i due riquadri con `bg-gray-50` fisso ora usano `bg-muted` (segue la modalità scura).
  - **Tariffe**: placeholder del prezzo corretto a `77.87` (il campo accetta solo il punto).
  - **Persone/Utenti**: il campo password nei form ora è `type="password"`, non più in chiaro.
  - **Sidebar**: pulsanti Chat/To-Do più grandi, sfondo pieno invece di solo bordo, etichetta
    "Strumenti" — prima 11px e facili da non notare.
  - **Colori WhatsApp**: consolidati in `src/lib/colori-brand.ts` invece di 3 hex letterali duplicati.
✅ Configuratore piano e Richiesta Dati — revisione (2026-08-05): il router non ha più l'opzione
  "Incluso nel canone" (non esiste davvero un router gratuito nei piani attuali), è preselezionato
  sul più economico e ogni modello mostra una didascalia ("Router Standard"/"Router PRO") e alcune
  caratteristiche tecniche (`infoRouter()` in `configuratore-piano.tsx`). La tariffa Buy & Go (a
  consumo, senza canone fisso) non mostra più "€0,00/mese": mostra invece la sua `descrizione`
  ("Tariffa a consumo, pensata per le seconde case"). Il modulo Dati e documenti ha ora quasi tutti
  i campi obbligatori (telefono, email, PEC/SDI/legale rappresentante per le aziende, intestatario
  IBAN se diverso, tessera sanitaria fronte/retro) — restano facoltative solo le Note — e una nuova
  sezione "Indirizzo di installazione" precompilata dai dati della Segnalazione ma modificabile dal
  cliente per farla riverificare prima dell'installazione (aggiorna `segnalazioni.via/civico/comune/cap`
  se cambiato, stesso principio già usato per telefono/email).
✅ Richiesta Dati — allegati più veloci e leggeri (2026-08-05): le foto di documento/tessera
  sanitaria (spesso 4-8MB dirette da fotocamera) vengono ridimensionate lato client (max 1920px sul
  lato lungo, JPEG qualità 0.8, `comprimiImmagine()` in `richiesta-dati-form.tsx`) prima di essere
  caricate — tenuto l'originale solo se la compressione non porta a un file più piccolo (PDF, o
  immagini già leggere). I 4 allegati vengono inoltre caricati in parallelo invece che uno alla
  volta. Corretto anche il crash "Unexpected token 'R' ... is not valid JSON" che capitava
  inviando 4 foto ad alta risoluzione: era la pagina d'errore HTML di Vercel per corpo della
  richiesta troppo grande (limite ~4.5MB) — i file ora vengono caricati dal browser direttamente su
  Supabase Storage con un signed upload URL invece di passare per il corpo della richiesta.
✅ Segnalazioni — flusso a step (2026-08-05): i 4 pulsanti di stato (cliccabili tutti insieme, in
  qualunque ordine) sono sostituiti da un indicatore di avanzamento in sola lettura più un solo
  pulsante con l'azione del passo attuale ("Ho contattato il cliente" → "Avvia Gestione Cliente"),
  con un link "Torna a…" per correggere un errore. Il pannello Contratto compare solo da Gestione
  Cliente in poi, "Trasmetti per l'installazione" solo a Gestione Cliente — prima comparivano
  sempre, anche prima di aver contattato il cliente. Nuovo avviso nella Chat interna (oltre al
  Telegram già esistente) quando arrivano dati/documenti dal cliente: va nel gruppo Commerciale
  (visto anche dagli amministratori), inviato da una Persona dedicata "Sistema" (creata inattiva,
  quindi mai selezionabile come assegnatario in nessun form — `src/lib/chat.ts`, chiamato da
  `api/richiesta-dati/route.ts`). Il pannello Contratto ora compare solo dopo che il cliente ha
  inviato la Richiesta Dati (o se un contratto era già stato caricato in precedenza) — prima
  bastava arrivare a "Gestione Cliente", anche senza dati/documenti ricevuti. I documenti allegati
  dal cliente ("Dati ricevuti dal cliente") sono ora apribili con un pulsante invece di comparire
  solo come testo (tipo/nome) senza modo di vederli davvero — stesso pattern già usato in Richieste
  Clienti (`urlContratto()`, generica nonostante il nome, riusata qui).
✅ "Dati ricevuti dal cliente" — completo e raggruppato (2026-08-06): Tipologia Cliente e Profilo
  Internet scelto (salvati sulla Segnalazione, prima mai mostrati qui) e l'indirizzo di
  installazione (via/civico/comune/CAP, prima assente da questo pannello) ora compaiono; 4 campi
  che uscivano con il nome tecnico invece di un'etichetta (`router`, `extenderMesh`,
  `costoMensile`, `costoUnaTantum`) e il valore grezzo "on" del mandato SEPA (ora "Sì") sono
  sistemati in `etichette-dettagli.ts`. L'elenco piatto (ordine di invio del form) è diventato
  gruppi per come si cerca in pratica un dato (Piano scelto/Anagrafica/Contatti/Pagamento/Note,
  indirizzo su una riga sola con link mappa, un "Altro" di sicurezza per eventuali campi futuri non
  ancora previsti). Ogni riga si copia con un click (icona che compare solo al passaggio del
  mouse) — pensato per chi da qui deve poi ritrasferire questi dati a mano nel contratto.
  Presentate 4 alternative grafiche (elenco verticale, card a griglia, tabella compatta, riepilogo
  con sezioni a comparsa); scelta la card a griglia — "Piano scelto" e indirizzo a tutta larghezza
  in alto (i dati consultati più spesso), il resto affiancato 2 card per riga.
✅ Eliminazione Ticket/Segnalazioni, solo amministratore (2026-08-06): pulsante "Elimina" nel
  dettaglio (non renderizzato affatto per chi non è admin, controllo comunque ripetuto lato server
  in `eliminaTicket()`/`eliminaSegnalazione()`) — nessuna delle due tabelle aveva policy RLS di
  delete, quindi la cancellazione vera passa dalla service role dopo la verifica admin, stesso
  principio già usato per le Persone. Eliminare un Ticket scioglie prima i riferimenti che non
  hanno `ON DELETE CASCADE/SET NULL` (`note_calendario`, `richieste_clienti.ticket_id`) e riporta
  a "Gestione Cliente" l'eventuale Segnalazione d'origine invece di lasciarla bloccata su
  "Trasmessa" puntando a un Ticket sparito; il resto (note, rapportini, approvazioni, appuntamenti,
  schede di lavoro) è già a posto via cascade/set null nello schema. Eliminare una Segnalazione è
  bloccato se esiste già un Ticket collegato ("Elimina prima il Ticket collegato (#N)" invece del
  messaggio grezzo della FK Postgres); le Richieste Clienti legate vengono rimosse insieme.
  Verificato end-to-end contro il database di produzione con righe di prova create e ripulite.
✅ FIX — pannello laterale (Sheet) non scorreva (2026-08-06): mancava un `overflow-y` sul
  contenitore condiviso da tutti i pannelli laterali dell'app (Ticket, Segnalazioni, Persone,
  Clienti, Tariffe, Materiali, Calendario, ecc. — `src/components/ui/sheet.tsx`); un dettaglio più
  alto dello schermo restava tagliato al bordo della finestra senza modo di raggiungere il resto.
  Diventato più evidente ora che il dettaglio Ticket/Segnalazione ha più sezioni/pulsanti (card
  dati cliente, indicatore di avanzamento, pulsante Elimina). Lo scroll è sul contenuto, non su
  tutto il pannello, così la X per chiudere resta sempre raggiungibile in alto a destra invece di
  scorrere via insieme al resto.
✅ FIX — testo/dati che uscivano dal pannello laterale (2026-08-07): nomi file lunghi (foto da
  smartphone tipo "1785936327735-IMG_...jpg") e valori lunghi (CF, indirizzo) spingevano la riga
  oltre il bordo del pannello, portandosi dietro l'intera pagina in scroll orizzontale invece di
  restare dentro il foglio. Causa: un figlio flex/grid non si restringe mai sotto la dimensione
  "naturale" del suo contenuto per default (`min-width: auto`) — servisse `min-w-0` esplicito a
  ogni livello della catena (dal contenitore dello Sheet fino alla singola riga) perché `truncate`
  avesse un effetto reale invece di limitarsi a tagliare senza ellissi. Sistemato nel pannello
  "Dati ricevuti dal cliente" (Segnalazioni), nell'elenco documenti di Richieste Clienti, e nel
  contenitore condiviso di ogni Sheet dell'app (`src/components/ui/sheet.tsx`) come rete di
  sicurezza per il resto dei pannelli.
✅ "Dati ricevuti dal cliente" — mai più un dato troncato (2026-08-07): il fix precedente
  (troncamento con "…") nascondeva comunque dati veri quando il pannello era stretto — un Codice
  Fiscale ridotto a una sola lettera. Rifatto completamente: via la griglia a 2 colonne (le card
  fianco a fianco non lasciavano spazio sufficiente al valore quando l'etichetta era già lunga di
  suo), ogni campo ora è etichetta sopra/valore sotto — stesso linguaggio dei campi
  Telefono/Indirizzo già in cima allo stesso pannello — e il valore va a capo se serve invece di
  tagliarsi. Stessa correzione sui nomi documento (`break-all`, i nomi generati con timestamp non
  hanno spazi dove andare a capo) qui e nell'elenco documenti di Richieste Clienti. Confrontate 3
  alternative in un artifact con i dati veri dello screenshot dell'utente prima di scegliere questo
  layout.
✅ Dettaglio Segnalazione — da pannello laterale a dialog centrale a tab (2026-08-07): anche a una
  colonna sola, ~370px restavano stretti per un'anagrafica Business completa. Il dettaglio è ora un
  dialog centrale largo (~672px, `sm:max-w-2xl`) invece del pannello agganciato al bordo destro
  (`Dialog`/`DialogContent` al posto di `Sheet`/`SheetContent` — prima non ancora usati in nessuna
  altra schermata). "Dati ricevuti dal cliente" è diviso in 3 tab (Anagrafica · Piano e pagamento ·
  Documenti) invece di restare tutto impilato in verticale — indicatore di avanzamento, pulsante
  dell'azione corrente, invio modulo dati, Contratto, Trasmetti ed Elimina restano sempre visibili
  fuori dalle tab. Stesso fix di scroll già fatto per lo Sheet (`src/components/ui/dialog.tsx`:
  altezza massima 85vh, scroll sul contenuto non su tutto il dialog, X sempre raggiungibile) esteso
  qui. Scelto dopo un confronto in artifact tra 4 impostazioni (popup largo, popup a tab, pannello
  laterale allargato, pagina dedicata).
✅ "Dati ricevuti dal cliente" — tab riordinate come il gestionale contratti esterno (2026-08-07):
  da 3 a 4 tab (Anagrafica · Indirizzo e pagamento · Documenti · Piano scelto), nell'ordine in cui
  questi stessi dati vanno ricopiati a mano in service.done.cst98.com/Contratto/cliente.aspx per
  compilare il contratto — anagrafica/contatti, poi indirizzo e IBAN (RID), poi documenti. Il
  profilo/apparati scelti (prima la prima tab) non hanno un campo corrispondente in quella
  schermata — si usano in un passaggio successivo del gestionale contratti — quindi ora sono
  l'ultima tab invece della prima.
✅ FIX — dialog Segnalazione "difficile da leggere" scorrendo (2026-08-07): la X per chiudere
  restava fissa in alto ma il titolo no — scorrendo il dialog, nome/indirizzo del cliente
  sparivano e al loro posto compariva qualunque campo si trovasse in quel momento in cima al
  contenuto (es. il valore dell'Email da solo, senza etichetta, proprio accanto alla X), dando
  l'impressione di un'interfaccia rotta. L'intestazione ora è `sticky top-0`: resta sempre
  visibile durante lo scroll. Tolta anche la duplicazione di Telefono/Email appena arrivano i dati
  dal cliente — comparivano identici sia in cima al dialog sia nella tab Anagrafica → Contatti.
✅ Richiesta Dati e Segnalazioni — riconferma dati, saldo alla posa, aggiornamento live, approvazione
  contratto (2026-08-08, richiede la migrazione `0044_realtime_segnalazioni_approvazione_contratto.sql`
  da eseguire a mano su Supabase SQL Editor): il riepilogo costi (configuratore piano e "Il tuo
  piano" nel form) indica ora che l'importo una tantum va saldato al momento della posa. Il cliente
  riconferma anche Nome e Cognome (nuovi campi obbligatori per i Privati, precompilati dal nome
  scritto in Segnalazione ma correggibili) oltre a email/indirizzo già riconfermabili — se diversi
  da quanto scritto dallo staff, `segnalazioni.nome` viene aggiornato di conseguenza (route
  `api/richiesta-dati`). La bacheca Segnalazioni si aggiorna da sola (Supabase Realtime su
  `segnalazioni`/`richieste_clienti`, stesso principio già usato per la Chat) quando arrivano
  dati/documenti dal cliente, incluso il dialog già aperto — prima serviva un refresh manuale.
  "Trasmetti per l'installazione" ora richiede anche l'approvazione del contratto da parte del
  cliente, non basta più averlo caricato: un pulsante "Invia contratto al cliente per approvazione"
  manda un link monouso via email (stesso meccanismo già usato per l'approvazione dell'intervento
  sui Ticket, migrazione 0013 — `token_approvazione` generalizzata con `origine`/`segnalazione_id`
  invece di crearne una copia), il cliente legge il PDF e approva su `/approva/[token]`; data/ora
  dell'approvazione sono salvate su `segnalazioni.contratto_approvato_cliente_il` e tracciate in
  Storico Modifiche come prova. Verificato end-to-end contro il database di produzione dopo
  l'esecuzione della migrazione 0044 (righe di prova create e ripulite: approvazione contratto e
  approvazione intervento Ticket, per verificare che il vincolo di esclusività sulla
  `token_approvazione` generalizzata non rompesse il flusso esistente).
✅ FIX — dialog che richiedeva scroll orizzontale (2026-08-08): un contenuto interno più largo del
  dialog (dettaglio Segnalazione a tab) non veniva contenuto — mancava `overflow-x` sia sul
  contenitore che scorre di `Dialog`/`Sheet` (`src/components/ui/dialog.tsx`, `sheet.tsx`) sia,
  come rete di sicurezza più a monte, su `html`/`body` (`globals.css`): un elemento troppo largo in
  qualunque punto della pagina poteva far comparire uno scrollbar orizzontale su tutta la finestra.
  Ora la pagina non scorre mai in orizzontale — chi trabocca si taglia o va gestito con
  `overflow-x-auto` sul proprio contenitore, non trascina più l'intera finestra.
✅ Contratto pronto — avviso anche ad Analisi Rete (2026-08-08): il pulsante "Invia contratto al
  cliente per approvazione" (rinominato "Contratto pronto — invia per approvazione") ora avvisa
  anche il reparto Analisi Rete nella Chat interna, non solo il cliente via email — così chi
  pianifica le installazioni può iniziare a organizzarsi in parallelo all'attesa della conferma del
  cliente, invece di scoprire la pratica solo quando arriva "Trasmetti" (`inviaMessaggioChatSistema()`,
  stesso meccanismo già usato per l'avviso di arrivo dati/documenti al reparto Commerciale).
✅ Calendario — telefono cliccabile e indirizzo che apre Maps (2026-08-08): nella card
  dell'appuntamento (Vista Giorno) e nel pannello "Modifica Appuntamento" ora compare anche il
  telefono del cliente (dal Ticket collegato), cliccabile per chiamare direttamente (`tel:`); prima
  non c'era per niente. L'indirizzo, che nel pannello di modifica era solo un campo di testo senza
  modo di aprirlo, ha ora accanto un pulsante che apre Google Maps — stesso trattamento già dato
  agli indirizzi nella card della Vista Giorno e (ora anche) negli eventi letti da Google Calendar.
✅ Email in uscita per reparto — verificato + notifica in Chat sulle risposte (2026-08-10): il
  meccanismo che manda ogni email cliente dalla casella del reparto giusto (Commerciale/
  Fatturazione/Assistenza) esisteva già (`src/lib/email.ts`, `CASELLE_REPARTI`) — verificato che
  ogni invio verso il cliente nel codice passa già il `reparto` corretto. Mancavano solo le
  credenziali `SMTP_USER_COMMERCIALE`/`SMTP_PASS_COMMERCIALE` (Fatturazione e Assistenza erano già
  configurate). Nuovo: quando un cliente **risponde** a una di queste email, il reparto competente
  ne viene avvisato nella Chat interna (`src/lib/imap.ts`, `controllaNuoveEmail()` — IMAP, stesse
  credenziali già usate per SMTP, nessun segreto nuovo). Tiene traccia per casella dell'ultimo UID
  già controllato (migrazione `0045_controllo_risposte_email.sql`) così non ri-notifica due volte
  la stessa email, e al primo avvio memorizza solo la posizione attuale invece di notificare
  l'intera cronologia esistente — verificato contro le caselle reali di Fatturazione e Assistenza.
  Route `api/cron/controlla-risposte-email`: **non** nel Cron nativo di Vercel (piano Hobby, i 2
  cron già occupati da pulizia documenti/promemoria ticket) — va richiamata da un servizio esterno
  (es. cron-job.org) ogni 5-10 minuti con lo stesso header `Authorization: Bearer $CRON_SECRET`
  già usato dagli altri cron. Credenziali Commerciale configurate e verificate (SMTP + IMAP contro
  la casella reale) sia in locale che su Vercel; posizione iniziale già registrata per tutte e 3 le
  caselle (migrazione 0045 eseguita) così il primo controllo non notifica l'intera cronologia
  esistente. Resta da collegare il servizio cron esterno.
✅ Segnalazioni — Tipologia Cliente già dalla creazione (2026-08-10): prima si scopriva se un
  cliente era Privato o Azienda solo quando arrivava la Richiesta Dati (a volte giorni dopo). Il
  form "Nuova Segnalazione" ha ora lo stesso toggle 👤/🏢 già usato altrove — una prima stima di chi
  prende la chiamata, non vincolante: se il cliente sceglie diversamente nel configuratore piano
  della Richiesta Dati, quel valore prevale (stesso principio già in uso per telefono/email/
  indirizzo/nome). Visibile come badge sulla card della bacheca e nel dettaglio della pratica.
✅ Segnalazioni — Email obbligatoria (2026-08-10): senza email non si può mandare la Richiesta Dati
  via email né, a valle, le comunicazioni successive che richiedono l'email del cliente
  (approvazione contratto). Il form "Nuova Segnalazione" ora la richiede (validazione formale
  client-side, ripetuta anche nell'azione server `creaSegnalazione()` come le altre).
✅ Segnalazioni — Audit adversariale della gating "Trasmetti" (2026-08-10): rilettura mirata a
  cercare bug logici in tutto il flusso di approvazione del contratto ha trovato 3 problemi reali,
  ora corretti: (1) sostituire un contratto già approvato ("Sostituisci") lasciava intatti
  `contratto_approvato_cliente_il`/`contratto_inviato_approvazione_il` — l'interfaccia continuava a
  mostrare "approvato" riferendosi al file vecchio, con "Trasmetti" sbloccato per un PDF mai visto
  dal cliente; ora ogni nuovo caricamento azzera entrambi i campi. (2) Il controllo server di
  `trasmettiPerInstallazione()` (che si dichiara "unica fonte di verità") non verificava affatto
  l'approvazione del cliente, solo tipologia/profilo/PDF presente — allineato allo stesso controllo
  già presente lato interfaccia. (3) Il pannello di caricamento contratto compariva solo se il
  cliente aveva già inviato la Richiesta Dati o esisteva già un contratto: una pratica arrivata a
  "Gestione Cliente" senza che il cliente compili mai il form pubblico restava senza alcun modo di
  caricare un contratto — vicolo cieco rimosso, il pannello ora compare in base allo stato della
  pratica, non alla presenza della Richiesta Dati. Fix (1) verificato con uno script contro dati
  reali (creazione/verifica/pulizia di una segnalazione di prova).
✅ Stato Sistema (2026-08-10): nato dall'incidente di oggi — `CRON_SECRET` incollato nel campo
  "Note" invece che "Value" su Vercel ha reso una rotta cron silenziosamente disabilitata per
  giorni, senza che nulla nel gestionale lo segnalasse. Nuova pagina `/sistema` (menu Team, solo
  amministratori) con: checklist delle variabili d'ambiente critiche (presenti/mancanti/formato
  sospetto, mai i valori veri), stato delle integrazioni in uscita (Email/Telegram/Google
  Calendar — ultimo invio riuscito, ultimo errore, quanti errori nelle ultime 24h) e stato del
  controllo email in arrivo (IMAP, per casella). `src/lib/integrazioni-log.ts` +
  `integrazioni_log` (migrazione 0046) registrano ok/errore ad ogni tentativo — instrumentato in
  `inviaEmail()`, `inviaNotificaTelegram()` (corretto anche un bug qui: il risultato di `fetch()`
  non veniva mai controllato, un token Telegram scaduto veniva silenziosamente trattato come invio
  riuscito) e `creaEventoCalendario()`.
✅ Segnalazioni — Rilevamento duplicati (2026-08-10): "Nuova Segnalazione" non controllava mai se
  telefono/email corrispondevano a una pratica già esistente — un cliente che richiama, o due
  operatori che prendono la stessa chiamata, creavano un doppione scoperto solo per caso.
  `creaSegnalazione()` ora controlla prima di inserire e, se trova corrispondenze, le mostra come
  avviso (non blocco: può essere davvero un cliente diverso) con un pulsante "Crea comunque" per
  procedere consapevolmente.
✅ Promemoria approvazione contratto in sospeso (2026-08-10): un contratto inviato per approvazione
  (vedi sopra) poteva restare "in attesa" per sempre se il cliente non cliccava mai il link —
  scopribile solo aprendo ogni pratica una per una. Nuova rotta `/api/cron/promemoria-approvazione-
  contratto`, stesso schema di `controlla-risposte-email` (fuori dai 2 cron nativi di Vercel Hobby,
  richiede un job esterno tipo cron-job.org una volta al giorno): segnala in Chat al reparto
  Commerciale le pratiche in attesa da più di 3 giorni, un promemoria al massimo ogni 24h per
  pratica (`segnalazioni.ultimo_promemoria_approvazione_il`, migrazione 0046).
✅ Preventivi (2026-08-11): nuova sezione `/preventivi` (menu Business, Commerciale/Admin) —
  a differenza dei contratti (PDF pronto caricato a mano), il preventivo si compone dentro il
  gestionale: righe con quantità/prezzo scelte da Tariffe e Materiali (o voce libera), totale
  calcolato in automatico (server-side, mai fidandosi del totale mandato dal client). Da "Nuovo
  Preventivo" si può cercare e collegare un cliente già esistente (Segnalazione o Cliente Esterno
  Aruba — compare così nella sua scheda, vedi `getPreventiviCollegati()`) oppure scrivere un
  contatto nuovo a mano. Stesso meccanismo di approvazione via link email monouso già in uso per i
  contratti (`token_approvazione`, ora generalizzata a un terzo riferimento), ma con una differenza
  esplicitamente richiesta: il cliente può anche **rifiutare**, non solo approvare — l'unico dei tre
  casi con due esiti, la pagina pubblica mostra il preventivo per intero (righe/totale, niente PDF)
  con due pulsanti. Flusso completo (creazione/invio/approvazione/rifiuto/vincoli DB) verificato
  contro dati reali con script usa-e-getta. Migrazione 0047.
⏳ Build di produzione verificata in locale; test end-to-end manuale (creare una Segnalazione →
  Gestione Cliente → compilare Richiesta Dati → Trasmetti → controllare il Ticket, e il nuovo
  rapportino di chiusura) ancora da fare con dati reali.
✅ 4 bug segnalati dopo l'introduzione dei Preventivi (2026-08-11), tutti corretti:
  1. **FIX SICUREZZA** — la policy RLS di lettura sui Ticket controllava solo che si fosse staff
     attivo, mai il reparto: chiunque loggato vedeva i Ticket di TUTTI i reparti, non solo del
     proprio. Nuova funzione `persona_vede_ticket()` (migrazione 0048): si vede un Ticket da admin,
     se il proprio reparto coincide, o se si è il tecnico assegnato — nient'altro. Solo la lettura è
     ristretta, insert/update restano aperti a qualunque staff attivo (riassegnare un Ticket ad un
     altro reparto resta un'operazione valida).
  2. La sidebar sinistra non seguiva lo scroll verticale. Causa: il fix `overflow-x: hidden` su
     `html`/`body` (aggiunto in una sessione precedente contro lo scroll orizzontale) aveva un
     effetto collaterale della spec CSS — impostare un asse di overflow senza dichiarare l'altro fa
     sì che l'asse non dichiarato venga comunque calcolato `auto`, trasformando `html`/`body` nel
     proprio contenitore di scroll invece di lasciarlo al viewport, rompendo così il riferimento di
     `position: sticky` della sidebar. Corretto dichiarando esplicitamente `overflow-y: visible`.
  3. Il pulsante "Email" nel pannello "Invia una pratica al cliente" (Trasferimento/Subentro/Cambio
     IBAN/Cambio Anagrafica/Disdetta, `InvioLinkCliente`) apriva il client di posta locale
     dell'operatore (`mailto:`) invece di inviare davvero — a differenza di Richiesta Dati. Ora
     invia per davvero, dalla casella del reparto competente: Cambio IBAN/Cambio Anagrafica →
     Fatturazione, Trasferimento/Subentro/Disdetta → Commerciale/Fatturazione (stesso mapping già
     usato per le notifiche interne, `REPARTO_PER_TIPO_RICHIESTA`).
  4. Una volta pianificato l'appuntamento (Trasmetti → Ticket → Pianifica), non c'era alcun modo di
     aprire la Scheda di Installazione/Lavorazione dal Ticket o dal Calendario: solo il tecnico
     assegnato, da Vista Tecnico, il giorno stesso. Nuovo pannello "Apri scheda di lavoro" sia nel
     dettaglio Ticket sia nel dettaglio Appuntamento (stesso form già usato in Vista Tecnico,
     `getAppuntamentoAttivoPerTicket()`), utilizzabile da chiunque non solo dal tecnico assegnato.
✅ Revisione completa Schede di lavoro, Materiali e documenti Ticket (2026-08-11), da un secondo
  giro di proposte con artifact (opzioni A/B/C confrontate, l'utente ha scelto le consigliate):
  - **Schede di Installazione/Lavorazione a step** (`src/components/schede/scheda-wizard.tsx`): da
    un unico form lungo a passi in sequenza (Installazione: Struttura → Cablaggio → Radio/CPE →
    Materiali → Firme; Lavorazione: Interventi → Materiali → Esito → Firma), un pensiero alla volta
    invece di uno scroll infinito su smartphone. Tutti i campi sono ora stato controllato (non più
    `FormData` letta al submit) — necessario perché un passo nascosto smonta il proprio JSX, un
    input non controllato avrebbe perso il valore. Bozza salvata in `localStorage`
    (`src/lib/bozza-scheda.ts`, solo campi testuali/numerici — mai foto o firme) mentre si
    compila, per non perdere nulla se il tecnico perde la connessione a metà scheda sul campo. Le
    due Schede si aprono ora in un **popup centrale** (Dialog, non più Sheet laterale) da tutti e
    tre i punti d'accesso — Vista Tecnico, Ticket, Calendario — "visuale centrale" richiesta
    esplicitamente, coerente ovunque.
  - **Lista modelli CPE aggiornata** (`OPZIONI_INSTALLAZIONE.cpe`, `src/lib/types.ts`): Cambium,
    Albentia 150-Rs/150-15/250-Rs/250-15/350-Rs/350-15 al posto di Cambium Force 300/MikroTik SXTsq.
  - **Materiali "In Scheda di lavoro"** (migrazione 0049, `mostra_in_schede_lavoro`): schermata
    dedicata a due colonne (catalogo / selezionati, `selettore-visibilita-schede.tsx`) per scegliere
    quali materiali compaiono nel selettore delle Schede sul campo — indipendente da "attivo", che
    resta il permesso generale usato anche da Preventivi. Aggiornamento ottimistico con rollback in
    caso di errore. Default `true` per non far sparire nulla al primo deploy.
  - **Tab "Documenti" nel Ticket** (`tickets-board.tsx`): il dettaglio Ticket si divide ora in
    Dettagli / Documenti / Note — contratto, scheda/rapportino completati e moduli inviati dal
    cliente (Cambio IBAN/Anagrafica/Trasferimento/Subentro, prima assenti dal Ticket) sono ora tutti
    nella tab Documenti, con contatore. Nuova `getRichiesteClientiPerTicket()`.
  - **Notifica Chat con link diretto**: la route pubblica `/api/richiesta-cliente` ora avvisa anche
    in Chat (non solo Telegram) con un link diretto al Ticket. I messaggi di Chat contenenti URL
    sono ora linkificati automaticamente (`TestoMessaggio` in `chat-panel.tsx`) — miglioria che vale
    per qualunque notifica di sistema con link, non solo questa.
✅ **Rebrand con il logo vero** (2026-08-12): il gestionale non aveva mai usato il logo reale
  dell'azienda — solo un'icona WiFi generica (Lucide) su sfondo blu `#2A5FA8`, un colore senza
  alcun legame col marchio (nero + rosso, motivo ad archi di segnale). Anche il favicon era ancora
  quello di default di Next.js, mai sostituito. Proposta con artifact (due direzioni — rebrand
  completo vs ibrida col blu — scelto il rebrand completo) prima di implementare.
  - **Palette** (`globals.css`): `--primary` passa da `#2A5FA8` a `#CF000A` (rosso campionato
    direttamente dal file del logo, non stimato), la sidebar da blu-notte a quasi-nero `#141414`
    (stesso nero del wordmark). I neutri mantengono la stessa struttura di prima (lieve deriva di
    tinta verso il brand) solo con hue spostato da blu (255) a rosso caldo (30). Gli stati semantici
    (successo/avviso/critico) restano volutamente un rosso diverso (più aranciato) dal nuovo rosso
    di marchio, per non creare ambiguità tra "azione del brand" e "avviso" — sempre con icona.
  - **Varianti del logo generate** (`public/brand/`, script PowerShell + `System.Drawing`, colori
    campionati per scansione pixel dal PNG originale — non stimati): `logo-completo.png` (originale,
    per sfondi chiari: login, pagine pubbliche), `logo-bianco.png` (wordmark nero ricolorato in
    bianco, stesso disegno, per la sidebar/hero scure — il file fornito aveva solo la versione con
    testo nero, invisibile su sfondo scuro), `logo-marchio.png` (solo anello+archi+quadratino,
    ritagliato e mascherato — niente testo, per favicon e spazi compatti dove il wordmark sarebbe
    illeggibile).
  - **Favicon reale**: `src/app/icon.png` (convenzione Next.js App Router, auto-servito a tutte le
    dimensioni) — prima non era mai stato impostato.
  - **Punti di integrazione**: sidebar (desktop e header mobile), login, Portale Clienti, Richiesta
    Dati, le 4 Richieste Cliente pubbliche, Disdetta, Privacy, pagina di approvazione pubblica,
    intestazioni delle email automatiche.
✅ **Segnalazioni "a prova di scemo"** (2026-08-12): primo pezzo della revisione generale di
  leggibilità/semplicità/interattività (proposta con artifact, confermata) — 4 principi (un'azione
  alla volta, zero memoria richiesta, bersagli grandi, errore impossibile da ignorare) applicati a:
  - **Card della bacheca**: da 3-4 badge piccoli da leggere tutti insieme a **un solo segnale**, il
    più urgente tra quelli possibili (in attesa dati da troppo → "sollecita"; ferma da troppo →
    "contatta il cliente"; dati arrivati → "pronta per il contratto"), che dice anche cosa fare, non
    solo il problema. Nessun problema in corso → card pulita, senza badge.
  - **Un'unica azione, sempre in fondo al popup**: da 4 pulsanti diversi sparsi nel pannello
    (cambio stato, invio approvazione, trasmetti) — ognuno visibile solo in certe condizioni, da
    scoprire scorrendo — a una barra fissa in fondo, sempre nello stesso punto, calcolata in un
    solo posto (`azione`): mostra il pulsante del passo attuale, o spiega con una riga di testo
    perché al momento non c'è nulla da cliccare (es. "in attesa che il cliente compili il modulo").
    "Torna indietro" resta disponibile nella stessa barra.
✅ **Ticket "a prova di scemo"** (2026-08-12): secondo pezzo — stessi principi, adattati perché lo
  stato di un Ticket (a differenza di una Segnalazione) non è una progressione lineare — "In
  lavorazione"/"In attesa" possono alternarsi legittimamente più volte (es. attesa ricambi), quindi
  non esiste un'unica "azione successiva" da forzare in una barra fissa.
  - **Card della bacheca**: priorità e reparto non sono più due badge sempre visibili — un solo
    segnale quando serve (🔴 Urgente, o "Da gestire da troppi giorni"), il reparto scende a testo
    semplice sotto il nome (identificativo, non un avviso). La striscia colorata a sinistra
    continua a portare la priorità anche per i casi senza badge.
  - **Bersagli più grandi**: le icone "Prendi in carico"/"Avanza stato" sulla card passano da 24px a
    28px, più facili da centrare col dito su tablet.
  - **Aiuto contestuale**: una riga sotto "Invia una pratica al cliente" spiega cosa fa (manda un
    link a un modulo pubblico, i dati arrivano poi nella tab Documenti) — non era ovvio a chi non lo
    usa spesso.
✅ **Calendario — vista mensile riscritta** (2026-08-12): terzo pezzo — "la vista mensile è
  agghiacciante" (citazione), ogni cella mostrava solo il numero del giorno e 1-3 pallini con un
  conteggio, zero nomi/orari, un click obbligato per scoprire qualunque cosa. Proposta con artifact
  (3 alternative — chip evento / densità colore per tecnico / anteprima al click — confrontate),
  scelta "chip evento": ogni impegno diventa ora una striscia compatta orario+cliente dentro la
  cella (max 3 righe, poi "+N altri"), stesso principio di Google/Outlook e stesso ordine
  note→appuntamenti→eventi Google già usato in Vista Settimana, per coerenza tra le due viste.
✅ **Dashboard — KPI cliccabili** (2026-08-12): quarto pezzo — i 4 numeri in cima alla Dashboard
  (Ticket Urgenti, Non assegnati, Appuntamenti oggi, Ticket attivi) erano statici: per vedere la
  lista dietro al numero bisognava uscire e ricostruire il filtro a mano in Ticket/Calendario. Ora
  ogni card è un link che apre già la lista giusta — `Kpi` accetta un `href` opzionale; Ticket ha
  imparato a leggere `?priorita=`/`?nonAssegnati=1` dall'URL al primo caricamento (stesso principio
  del deep-link `?aperto=` già esistente) e applicarli come filtro. "Non assegnati" non esisteva
  nemmeno come filtro in Ticket: aggiunto un pulsante toggle apposta, accanto a "Solo i miei".

✅ **Sidebar riorganizzata in 5 mondi coerenti** (2026-08-13): "è caotico e non so mai dove trovare
  le sezioni" — "Mondo Business" era un cassetto con dentro 4 concetti diversi (analisi, vendita,
  cataloghi, anagrafiche) mescolati solo perché "non erano Ticket"; "Mondo Team" mischiava
  organico (Persone) e strumento tecnico (Stato Sistema). Proposto con artifact e confermato: ora
  ogni mondo risponde a una sola domanda — **Assistenza** ("sto lavorando una pratica?": Ticket,
  Vista Tecnico, Calendario, Materiali, Richieste Clienti, Archivio), **Vendita** ("sto vendendo?":
  Segnalazioni, Preventivi, Tariffe), **Clienti** ("chi è questo cliente?": Clienti, Anagrafica
  Clienti), **Analisi** ("come vanno le cose?": Dashboard generale + per reparto), **Team** (solo
  admin: Persone, Stato Sistema). Segnalazioni si sposta da "Ticket" a "Vendita" (è un contatto
  commerciale, non un ticket di assistenza); Richieste Clienti resta con Assistenza perché nasce
  quasi sempre da un Ticket esistente.
✅ **Home — pannello "Novità dai clienti"** (2026-08-13): Commerciale/Fatturazione/Admin non
  avevano modo di accorgersi in prima pagina quando un cliente inviava un modulo, approvava un
  contratto o rispondeva a un preventivo — bisognava andare a cercarlo settore per settore. Nuovo
  pannello in cima alla home (subito sotto l'intro, prima della griglia Ticket), visibile solo a
  chi ha competenza commerciale, che unisce 3 fonti in un unico elenco cliccabile ordinato per
  data: moduli clienti da lavorare (`richieste_clienti` in stato "Da Lavorare"), contratti appena
  approvati dal cliente e in attesa di trasmissione, preventivi approvati/rifiutati negli ultimi 7
  giorni. Ogni riga porta direttamente alla pratica (`/tickets?aperto=`, `/segnalazioni?aperto=`,
  `/preventivi?aperto=`), senza dover ricostruire a mano dove cercare.

✅ **Dettaglio Segnalazione — spinner/toast/tooltip espliciti** (2026-08-13): "Extreme Makeover
  Step 1" — primo giro di uno sprint dedicato a UX/UI. Il dialog di dettaglio aveva già la barra
  azione unica sticky in fondo (giro "a prova di scemo" precedente); questo passaggio ha aggiunto
  il feedback che mancava intorno a quell'azione: ogni pulsante mostra ora uno spinner (`Loader2`)
  mentre la Server Action è in corso invece di limitarsi a disabilitarsi in silenzio, e ogni esito
  (cambio stato, invio email, upload contratto, invio approvazione, trasmissione, eliminazione)
  passa anche dal toast di conferma, non solo dagli errori come prima. L'upload del contratto è
  diventato un `<form>` vero con Server Action (`caricaContrattoSegnalazione` chiamata dentro
  `action={...}`) invece di un `onChange` puro — la label che mostra "Caricamento..." legge il
  proprio stato da `useFormStatus()` invece di un booleano passato a mano, il file continua a
  inviarsi da solo alla selezione (`requestSubmit()`) senza un secondo click. Le altre azioni
  (cambio stato, trasmetti, elimina...) restano bottoni imperativi ma ognuna con la propria
  `useTransition()` indipendente, così lo spinner di "Elimina" non si accende insieme a quello di
  "Trasmetti". Aggiunto un componente `Tooltip` (nuovo, `src/components/ui/tooltip.tsx`, su Radix)
  per un paio di microcopy contestuali (Reparto installazione, Sostituisci contratto) dove il
  significato non era ovvio a chi non usa la pagina tutti i giorni. Bottone primario e "Elimina"
  portati a tocco più ampio (min. `h-11`), palette rosso brand esplicita
  (`#CF000A`/`#A30008`, con coppia `#E8555F`/`#c94750` per il tema scuro — stesso rosso già usato
  come `--primary` scuro in `globals.css`, non un semplice inverti-colore).

✅ **Dettaglio Ticket — stesso trattamento "Extreme Makeover"** (2026-08-13): secondo pezzo dello
  sprint, esteso dal Dettaglio Segnalazione al Dettaglio Ticket. Ogni azione (cambio stato, prendi
  in carico, cambio reparto, invio nota, invio email di approvazione, elimina, pianifica
  appuntamento) ha ora la propria `useTransition()` indipendente con spinner `Loader2` e un toast
  di conferma anche sul successo — prima "Prendi in carico"/"Elimina"/"Cambio stato" condividevano
  un unico booleano `inCorso`, per cui azioni indipendenti potevano accendersi a vicenda per
  errore. Estratto un componente condiviso `SuggerimentoCampo`
  (`src/components/ui/suggerimento-campo.tsx`, dall'omonimo helper locale già scritto per
  Segnalazioni) per due tooltip contestuali nuovi: "Reparto" (cosa succede a cambiarlo) e
  "Intervento risolto da remoto?" (cosa fa il link di approvazione via email). Bottoni critici
  ("Prendi in carico", "Elimina Ticket", invio nota, invio approvazione, "Assegna e fissa"
  appuntamento) portati a tocco più ampio (`min-h-11`).

✅ **Extreme Makeover esteso a tutto il gestionale** (2026-08-13): terzo pezzo, dopo Segnalazioni e
  Ticket — stesso standard applicato a **Preventivi** (dettaglio + "Nuovo Preventivo"),
  **Calendario** (nuovo/modifica appuntamento, nuovo promemoria, e toast anche sui toggle rapidi
  "segna completato"/"segna fatto"/elimina nota), **Vista Tecnico** (la schermata usata dai
  tecnici da smartphone sul campo: "Avanza", nota rapida e "Crea Ticket" ora hanno spinner e toast
  — qui conta doppio, su connessione debole un tap senza feedback viene facilmente ripetuto per
  errore), **Clienti** (dati contrattuali), **Persone** (crea/modifica/reimposta password),
  **Archivio** (riapri ticket) e **Richieste Clienti**, vista interna (cambio stato). Verificata
  anche l'Anagrafica Clienti esterna: è genuinamente di sola lettura (nessun componente client,
  dati sincronizzati da Aruba) — nessuna modifica necessaria lì. Aggiunto un tooltip anche al
  selettore "materiali visibili in scheda" (Materiali), l'unico punto rimasto senza spiegazione
  inline. Ogni azione scrivibile del gestionale ha ora lo stesso pattern: `useTransition()`
  indipendente per azione, spinner `Loader2`, toast di conferma anche sul successo.
✅ **Cron "promemoria-approvazione-contratto" configurato e verificato** (2026-08-13): un primo
  controllo sui dati reali era risultato non conclusivo (nessuna pratica aveva ancora mai raggiunto
  la soglia dei 72h per far scattare il sollecito). Job creato su cron-job.org
  (`https://gestione.donewifi.it/api/cron/promemoria-approvazione-contratto`, header
  `Authorization: Bearer $CRON_SECRET`, stesso schema di `controlla-risposte-email`), programmato
  una volta al giorno alle 9:00. "Execute now" confermato: `200 OK`,
  `{"ok":true,"sollecitate":0}` — la rotta risponde correttamente, resta da vedere il primo
  sollecito reale la prima volta che una pratica supererà le 72h di attesa.

✅ **"Trasmetti per l'installazione" — reparto automatico** (2026-08-13): il select "Reparto
  installazione" (con default già "Analisi Rete") chiedeva una scelta per un caso che nella pratica
  è sempre lo stesso — rimosso del tutto: il Ticket va sempre e automaticamente ad Analisi Rete.
  Per l'eccezione rara in cui serve un reparto diverso, si riassegna dopo dal dettaglio del Ticket
  (select "Reparto" già presente lì, con tooltip che spiega cosa fa — vedi voce Ticket qui sopra).

✅ **Firma cliente sulla Scheda — OTP email al posto del disegno su schermo** (2026-08-13):
  richiesta esplicita, con discussione su quale meccanismo fosse più solido come prova (nessuna
  delle due opzioni è una firma elettronica qualificata — stesso livello di ciò che il gestionale
  già usa per contratto/intervento/preventivo). Scelto **OTP via email** come metodo principale: il
  tecnico invia un codice a 6 cifre (scade in 10 minuti, 5 tentativi) al cliente, che lo legge
  dalla propria email e lo detta di persona — lega l'approvazione al momento esatto in cui il
  tecnico è fisicamente presente, prova più solida di un link cliccabile in autonomia in qualunque
  momento. **Link di approvazione via email** resta come fallback, ma richiede
  un'autorizzazione esplicita del tecnico (confirm dedicato, mai una scelta lasciata al cliente) —
  usa lo stesso schema già collaudato per contratto/intervento/preventivo
  (`token_approvazione`, ora esteso con `appuntamento_id` — migrazione `0050`). Nuova tabella
  `otp_firma_scheda` (codice hashato, non in chiaro). Entrambi i metodi sostituiscono `FirmaPad`
  solo per la firma del **cliente** — la firma del tecnico nella Scheda di Installazione resta
  disegnata su schermo, invariata. Le schede già salvate col disegno restano leggibili come prima
  (`firma_cliente_url` non toccato, i 3 campi nuovi restano null su quelle righe storiche).
  Migrazione `0050_firma_cliente_scheda.sql` eseguita e verificata in produzione: tabella
  `otp_firma_scheda` interrogabile, le 3 nuove colonne su `schede_lavoro` e `appuntamento_id` su
  `token_approvazione` presenti, inserimento/lettura/cancellazione di prova riusciti.

✅ **Firma cliente OTP estesa al Rapportino di chiusura Ticket** (2026-08-13): richiesta esplicita
  di ripulire "tutte le parti rimaste obsolete" dopo il giro OTP sulla Scheda (migrazione 0050) —
  trovato un secondo punto identico mai aggiornato: il **Rapportino di chiusura Ticket**
  (`rapportini_intervento`, usato quando un Ticket si completa direttamente, senza passare da un
  appuntamento/Scheda) aveva ancora la firma disegnata su schermo. Stesso meccanismo OTP/link
  generalizzato: `FirmaClienteScheda` ora prende un `riferimento` (`{tipo: "appuntamento"}` per la
  Scheda, `{tipo: "ticket"}` per il Rapportino) invece di un `appuntamentoId` fisso — le 4 azioni
  server (`getContattoPerFirmaCliente`, `inviaOtpFirmaCliente`, `verificaOtpFirmaCliente`,
  `inviaLinkFirmaCliente`) sono generalizzate allo stesso modo, un solo posto invece di duplicarle.
  Migrazione `0051_firma_cliente_rapportino.sql`: la tabella OTP (rinominata `otp_firma_scheda` →
  `otp_firma_cliente`, ora referenzia un appuntamento *o* un ticket) e `rapportini_intervento`
  estesa con `firma_metodo`/`firma_email`/`firma_verificato_il` (stesso schema di `schede_lavoro`,
  `firma_url` intatto per i rapportini storici col disegno). `/api/approva/[token]` gestisce anche
  il nuovo caso `firma_rapportino`. Migrazione `0051` eseguita e verificata in produzione: tabella
  rinominata interrogabile con entrambe le colonne, nuove colonne su `rapportini_intervento`
  presenti, inserimento/cancellazione di prova riusciti, e il vincolo "un riferimento solo" blocca
  correttamente un tentativo con appuntamento e ticket impostati insieme.

✅ **Audit UI/UX — 4 lacune reali risolte** (2026-08-13): richiesta esplicita di rivedere l'intera
  interfaccia "a prova di scemo ma smart e bella" — invece di proposte generiche, un controllo nel
  codice ha trovato 4 gap concreti mai affrontati nei giri precedenti (quelli avevano coperto
  interazione e affidabilità, non i momenti "vuoti"):
  - **Stati di caricamento**: solo la Dashboard aveva `loading.tsx` — le altre pagine restavano
    ferme senza segnale durante il fetch server-side. Aggiunti skeleton dedicati a Ticket,
    Segnalazioni, Calendario, Preventivi, Materiali, Clienti, Persone, Archivio, Vista Tecnico,
    Richieste Clienti (`src/components/ui/page-skeletons.tsx`, due mattoncini condivisi:
    intestazione + bacheca a colonne o lista).
  - **"Nessun risultato"**: 18 punti nel codice mostravano solo testo grigio, senza icona né un
    passo successivo proposto. Nuovo componente `StatoVuoto` (icona + testo + azione facoltativa),
    applicato dove aveva senso un'azione (Preventivi: "+ Nuovo Preventivo") e dove no, solo
    l'icona (filtri senza risultati, viste vuote — un archivio vuoto non ha un'azione da proporre).
  - **Ricerca globale senza scorciatoia**: esisteva già e funzionava, ma andava trovata col mouse.
    Aggiunta `⌘K`/`Ctrl K` (listener globale che porta il focus sull'input esistente, badge
    visibile per scoprirla) — pattern standard di ogni strumento "smart".
  - **Cambi tab/vista bruschi**: passare da Dettagli a Documenti su un Ticket (o tra i passi di una
    Scheda) sostituiva il contenuto di colpo. Dissolvenza breve (~200ms,
    `motion-safe:animate-in fade-in-0`) su Ticket, Segnalazioni e wizard Scheda — rispetta
    "riduci le animazioni" del sistema operativo.
  Nessuna di queste modifiche tocca dati o logica di business — solo interfaccia.

✅ **Elimina Richiesta Cliente (solo admin)** (2026-08-13): richiesta esplicita — mancava la
  possibilità di cancellare un modulo inviato dal cliente (Cambio IBAN/Anagrafica/Trasferimento/
  Subentro/Richiesta Dati), es. un test o un invio duplicato. Stesso schema già usato per
  `eliminaSegnalazione`: visibile solo agli amministratori (controllo anche lato server), conferma
  prima di procedere, spinner/toast, voce in Storico Modifiche. I file caricati dal cliente restano
  nello storage — la pulizia passa dal cron `pulizia-documenti` esistente, non da qui, stessa scelta
  già fatta per Segnalazioni. Migrazione `0052` eseguita e verificata in produzione: constraint
  `storico.origine` accetta `'richiesta_cliente'`, ciclo completo crea/elimina/verifica-assenza su
  una richiesta di prova riuscito.

✅ **4 bug reali segnalati dall'uso in produzione** (2026-08-13): riscontrati direttamente
  dall'utente su `gestione.donewifi.it`, non teorici.
  - **Sidebar che scompariva scorrendo**: `position: sticky` in un layout flex-row può perdere
    l'ancoraggio a seconda di come cresce il contenuto accanto (visto scorrendo Materiali, una
    lista lunga) — comportamento fragile da CSS a CSS. Passata a `position: fixed` (ancorata al
    viewport senza condizioni), `<main>` riserva lo spazio con `md:ml-72` invece di affidarsi allo
    spazio naturale del flex layout.
  - **Dettaglio Ticket illeggibile**: pannello laterale (Sheet) troppo stretto per la quantità di
    dati reali — passato a Dialog centrale, stessa larghezza/trattamento già usati per Segnalazioni.
  - **Pulsanti del codice OTP non cliccabili**: nel passo "Firme" della Scheda Installazione, la
    griglia a due colonne strette schiacciava input del codice e bottone "Verifica" fino a
    sovrapporli — impossibile da cliccare. Passato a colonna singola impilata (Firma cliente sopra,
    Firma tecnico sotto), niente più spazio insufficiente.
  - **Popup che si chiudevano cliccando fuori**: un click accidentale sull'overlay (o un Esc
    premuto per sbaglio a metà di un form a più passi) chiudeva tutto perdendo i dati inseriti.
    Dialog e Sheet (`src/components/ui/dialog.tsx`/`sheet.tsx`, quindi applicato ovunque nel
    gestionale) ora si chiudono solo dalla X in alto a destra o da un'azione esplicita del
    componente (Annulla, salvataggio riuscito) — mai da un click fuori o da Esc.

✅ **Lavorazioni Interne — nuova pagina, con assegnazione e promemoria** (2026-08-13): richiesta
  esplicita per il lavoro interno (non pratiche cliente), diviso in due categorie fisse — **Rete**
  (ponti radio, BS, postazioni) e **Ufficio** — assegnabili da un amministratore ad altro staff.
  Proposta con artifact (modello dati, canale del promemoria, dove nel menu, rapporto col To-Do
  personale), confermata con una correzione esplicita: **niente scadenza** — il promemoria si basa
  su quanto tempo la lavorazione resta ferma dalla creazione (2 giorni per il primo sollecito, non
  più di uno ogni 24h), stesso principio già in uso per "Ferma da Ng" in Segnalazioni/Ticket, non
  su una data limite.
  - Tabella nuova e separata da `todo_personali` (quello resta appunti privati leggeri, questo è
    lavoro formale del team con responsabile e chi l'ha assegnata) — migrazione `0053`.
  - Bacheca a colonne per stato (Da fare/In corso/Fatta), un tab per categoria — stesso linguaggio
    visivo di Ticket/Segnalazioni. Solo un amministratore può assegnarla a un'altra persona
    (chiunque può crearne una per sé); solo un amministratore vede tutte le lavorazioni di tutti
    (service role in pagina), un utente normale solo le proprie (RLS).
  - Nuova funzione `inviaMessaggioChatSistemaDiretto()` (`src/lib/chat.ts`) — messaggio diretto
    (DM) da "Sistema" a una persona precisa, non solo broadcast di reparto come
    `inviaMessaggioChatSistema()` esistente.
  - Cron `/api/cron/promemoria-lavorazioni`: chi la deve fare **e** chi l'ha assegnata ricevono un
    promemoria in Chat interna se resta ferma — stesso schema di `promemoria-approvazione-contratto`,
    va aggiunto come **terzo job esterno** su cron-job.org (i 2 slot nativi Vercel Hobby restano
    occupati da `pulizia-documenti`/`promemoria-ticket`).
  - "Team" nel menu laterale non è più "solo amministratori": ora tutti vedono "Lavorazioni
    Interne" (le proprie), Persone/Stato Sistema restano riservate agli admin.
  Migrazione `0053` eseguita e verificata in produzione: tabella interrogabile con tutte le
  colonne, vincoli su categoria/stato testati e funzionanti, ciclo completo
  crea/assegna-a-un-altro/completa/elimina riuscito. **Resta da configurare il terzo cron esterno**
  su cron-job.org (`/api/cron/promemoria-lavorazioni`) prima che i promemoria partano davvero.

✅ **Magazzino Materiali + Inventario Antenne** (2026-08-13): richiesta esplicita — "il conto si
  aggiorna quando i materiali sono inseriti nei lavori" + un avviso in caso di mancanza, più un
  inventario per MAC delle antenne divise per tipologia con le prenotazioni fatte in anticipo dal
  tecnico di Analisi Rete. Proposta con artifact (opzioni di layout per entrambe le sezioni),
  approvata sui consigliati.
  - `materiali_magazzino` guadagna `giacenza`/`soglia_minima`/`ultimo_avviso_il` (migrazione
    `0054`, tutte nullable: un materiale non tracciato resta solo voce di listino come prima).
    Nuova tab **Magazzino** in Materiali — badge OK/sotto soglia/esaurito, correzioni manuali
    riservate a un amministratore.
  - Scarico automatico solo dai materiali **strutturati** usati in una Scheda di
    Installazione/Lavorazione Tecnica salvata (`scaricaGiacenzaMateriali()`,
    `src/app/(app)/materiali/actions.ts`) — non da Preventivi (solo un'ipotesi di vendita) né dal
    Rapportino di chiusura Ticket (materiali a testo libero, non strutturati). Sotto soglia parte
    un avviso in Chat interna al reparto Analisi Rete, al massimo una volta ogni 24h per materiale.
  - Nuova tabella `antenne_inventario` (stessa migrazione `0054`): un pezzo per MAC, raggruppato
    per tipologia (stessa lista di `OPZIONI_INSTALLAZIONE.cpe`), stato Disponibile/Prenotata/
    Installata. Nuova tab **Antenne** in Materiali, con conteggio per tipologia. Censimento MAC e
    correzioni riservati a un amministratore; la prenotazione (impegnare un pezzo Disponibile per
    un Ticket, con ricerca per numero/cliente) è un gesto operativo di chiunque sia in Analisi
    Rete.
  - Riconciliazione automatica: alla Scheda di Installazione salvata, se il MAC compilato dal
    tecnico corrisponde a un pezzo censito, passa da solo a Installata
    (`riconciliaAntennaInstallata()`) — con avviso in Chat se risultava prenotato per un Ticket
    diverso da quello appena installato, invece di far quadrare i conti in silenzio.
  Migrazione `0054` eseguita e verificata in produzione: nuove colonne/tabella interrogabili,
  ciclo completo giacenza-imposta/scarica-ripristina riuscito, ciclo completo
  antenna-crea/prenota/installa/elimina riuscito, vincoli su stato e unicità MAC testati e
  funzionanti.

✅ **Audit di sicurezza/bug + rifinitura stile "Raffinato"** (2026-08-13): richiesta esplicita di
  una verifica accurata di tutto il gestionale, poi proposte di stile con artifact (3 direzioni:
  Raffinato/Editoriale/Console tecnica) — scelto **Raffinato** (evoluzione dello stile attuale,
  non uno stravolgimento).
  - **Bug trovati e corretti** (2): `cercaClientiPerPreventivo()` (`preventivi/actions.ts`) e
    `cercaTicketPerAntenna()` (`materiali/actions.ts`) passavano il testo di ricerca senza
    escaping dentro un filtro `.or()` di PostgREST — una virgola o parentesi nel testo digitato
    rompeva silenziosamente la ricerca. Stesso fix già esistente altrove (`ricerca/actions.ts`,
    `tickets/actions.ts`) applicato anche qui.
  - **Punto d'attenzione segnalato, non corretto** (rischio giudicato trascurabile): lo scarico
    automatico della giacenza Materiali (`scaricaGiacenzaMateriali()`) legge e scrive in due passi
    separati, non atomici — un doppio salvataggio nello stesso istante esatto sullo stesso
    materiale potrebbe in teoria perdere un decremento.
  - **Stile "Raffinato"** (`src/app/globals.css`): raggio angoli leggermente più stretto (`0.85rem`
    → `0.75rem`), ombre a più livelli ritinteggiate da un grigio-blu neutro a un bruno caldo
    coerente con la deriva di tinta 30° già scelta per sfondo/bordo, spaziatura lettere (`-0.01em`)
    aggiunta di default a tutti i titoli `h1`-`h4` (prima presente solo dove un componente
    dichiarava esplicitamente `tracking-tight`). Nessun componente riscritto: solo i token in
    `globals.css`, coerente ovunque nel gestionale senza toccare pagina per pagina.

✅ **Materiali della Scheda di lavoro — Comodato/Prodotto/Servizio + attivazione automatica**
  (2026-08-13): richiesta esplicita — il passo "Materiali" mescolava apparati installati
  gratuitamente (CPE, alimentatore...) con prodotti e servizi a pagamento, più un "Importo
  fatturato" scritto a mano scollegato dall'elenco. Proposta con artifact interattivo, approvata
  con una correzione esplicita: la classificazione si definisce **una volta per tutte nel catalogo
  Materiali**, non riga per riga nella Scheda.
  - `materiali_magazzino` guadagna `tipo_riga` ('Comodato'/'Prodotto'/'Servizio', migrazione
    `0055`) — unico campo che l'amministratore edita in Materiali da ora; `comodato_uso` resta in
    tabella ma è sempre derivato da `tipo_riga` lato server (mai più scritto a mano, non può più
    disallinearsi). Aggiunta anche `attivazione_predefinita` ('Privato'/'Business'/null): la riga
    marcata si aggiunge da sola nella Scheda per quel tipo cliente, con il prezzo preso così com'è
    (mai passato per `prezzoPerTipoCliente()` — **bug reale trovato nell'analisi**: una riga già a
    prezzo finale rischiava di subire l'IVA una seconda volta se il tecnico aveva anche
    l'interruttore Privato/Business impostato di conseguenza).
  - `SelettoreMateriali` (`src/components/schede/selettore-materiali.tsx`) riscritto: tre gruppi
    fissi (🟢 Comodato d'uso, 📦 Prodotti, 🛠️ Servizi) invece di un elenco unico. Il tipo cliente
    arriva precompilato dal Ticket collegato (`getTipologiaClientePerAppuntamento()`, nuova),
    resta comunque modificabile per i casi in cui il dato sul Ticket sia sbagliato/mancante.
  - "Importo totale fatturato" non è più un campo scritto a mano: `salvaSchedaLavoro()` lo calcola
    sempre come somma delle righe materiali (le righe in comodato pesano 0 da sole) — stessa
    "unica fonte di verità" già in uso per la firma cliente. Nuovo campo **Metodo di pagamento
    della posa** (Contanti/POS/Non riscosso, `schede_lavoro.metodo_pagamento_posa`).
  - Sistemato anche il catalogo reale nella stessa migrazione: le CPE installate (non le
    sostituzioni a pagamento) passano da a-pagamento a comodato d'uso, aggiunte Alimentatore/
    Griglia piccola/Griglia grande come nuove voci comodato, marcate ATTIVAZIONI/Privati e
    ATTIVAZIONI/Business come attivazione predefinita per il rispettivo tipo cliente.
  - Scoping esplicito: riguarda solo Scheda di Installazione/Lavorazione (`schede_lavoro`), non il
    Rapportino di chiusura Ticket — i suoi materiali restano testo libero non strutturato, stessa
    asimmetria già documentata per lo scarico automatico del magazzino.
  Migrazione `0055` eseguita e verificata in produzione: nuove colonne interrogabili, backfill del
  catalogo reale confermato riga per riga (CPE→comodato, nuove voci, attivazione predefinita),
  vincoli su `tipo_riga`/`attivazione_predefinita` testati e funzionanti, scrittura di
  `metodo_pagamento_posa` riuscita su una scheda reale.

✅ **Fix: notifiche Lavorazioni Interne invisibili in Chat** (2026-08-13): bug reale segnalato
  dall'utente — assegnare una Lavorazione Interna a un'altra persona manda un DM automatico dalla
  persona "Sistema" (`inviaMessaggioChatSistemaDiretto()`), ma "Sistema" è sempre `attivo=false` per
  disegno (non selezionabile in nessun form). `getContattiChat()` (`src/app/(app)/chat/actions.ts`)
  filtrava l'elenco contatti a `attivo=true`: il badge "non letti" in Chat saliva comunque (calcolato
  da tutte le conversazioni viste dalla RLS, non filtrate), ma la conversazione con "Sistema" non
  compariva mai nell'elenco — un contatore che cresce senza modo di aprire la notifica. Corretto
  includendo un contatto inattivo nell'elenco quando ha già una conversazione esistente (non
  ingombra comunque la lista "a chi scrivo" per staff disattivato senza storico). Verificato contro
  un caso reale in produzione: una Lavorazione assegnata il 13/08 risultava effettivamente invisibile
  prima del fix.

✅ **Email ai clienti riscritte (identità visiva + tono coerente)** (2026-08-14): richiesta
  esplicita — "sono alquanto tristi". Proposta con artifact (diagnosi + anteprime reali),
  approvata: tono sempre "Gentile" (prima mischiato con "Ciao" a seconda della funzione), firma
  per reparto invece del generico "Done Wifi", footer con i dati aziendali, numero di telefono
  fornito dall'utente (0165 1825169).
  - `src/lib/email.ts` riscritto attorno a un'unica cornice condivisa (`involucroEmail()`):
    intestazione scura col logo (`public/brand/logo-bianco.png`, servito da URL assoluto — i
    client email non caricano risorse relative), card bianca arrotondata per il contenuto,
    footer fisso con ragione sociale/indirizzo/P.IVA/telefono (dati già presenti nella pagina
    Privacy del gestionale). Le 8 email (conferma intervento, contratto pronto, OTP/link firma
    lavori, preventivo, pratica cliente, richiesta dati, chiusura Ticket) usano tutte la stessa
    cornice invece di un `<div>` ricopiato ciascuna.
  - Ogni funzione email ora ritorna anche `corpoTesto` (versione solo-testo, non generata
    automaticamente per non produrre un risultato scadente da uno strip HTML grezzo) —
    `inviaEmail()` la passa a nodemailer come alternativa: filtri antispam e client che bloccano
    HTML/immagini vedono comunque un messaggio leggibile invece di un'email vuota.
  - Verificato chiamando tutte le 8 funzioni con dati di esempio: nessuna interpolazione rotta,
    logo/footer/tono presenti in ogni corpoHtml e corpoTesto.

✅ **Fix: la X per chiudere Dialog/Sheet a volte "spariva"** (2026-08-20): bug reale segnalato
  dall'utente — la X (`src/components/ui/dialog.tsx`/`sheet.tsx`) c'era sempre nel DOM ma senza
  z-index esplicito, quindi finiva coperta da qualunque intestazione sticky con `z-10` dentro il
  popup (il pattern `DialogHeader className="sticky top-0 z-10 ..."` usato in Segnalazioni, Ticket
  e in ogni passo di ogni Scheda di Installazione/Lavorazione — cioè nei popup più usati del
  gestionale) — visivamente indistinguibile da "assente", anche se tecnicamente ancora cliccabile.
  Corretto con `z-20` sulla X in entrambi i componenti condivisi: sta sempre sopra qualunque
  contenuto sticky del popup, in tutto il gestionale, senza dover toccare ogni pagina.
  Segnalata anche una seconda casistica (popup impilati, es. la Scheda che si apre sopra il
  dettaglio Ticket/Appuntamento ancora aperto dietro) — proposta con artifact (3 opzioni), scelta
  **A**: il popup di dietro si nasconde (non si chiude) quando se ne apre uno sopra, ricompare da
  solo se quello sopra viene annullato.
  - `tickets-board.tsx`: il Dialog dettaglio Ticket ora è `open={!!aperto && !schedaAperta}` — la X
    della Scheda sopra non copre più (sotto il suo velo) quella del dettaglio Ticket dietro, che
    torna visibile da solo annullando la Scheda; si chiude per davvero solo al salvataggio riuscito
    (comportamento già esistente, invariato).
  - `calendario-board.tsx`: stesso principio sul Sheet di modifica appuntamento
    (`open={!!modifica && !schedaAperta}`) — prima veniva chiuso subito all'apertura della Scheda
    (`setModifica(null)`) e non si riapriva più annullandola; ora resta "in pausa" e ricompare.
  - Vista Tecnico verificata: lì la Scheda si apre direttamente da una card della lista, non da un
    popup già aperto — nessuna sovrapposizione possibile, nessuna modifica necessaria.

✅ **Trasmissione automatica all'approvazione del contratto + elenco installazioni in Scheda
  Cliente** (2026-08-20): due richieste esplicite.
  - **Trasmissione automatica**: prima l'approvazione del contratto via link email si fermava lì
    (`contratto_approvato_cliente_il` valorizzato) — la Segnalazione restava in "Gestione Cliente"
    finché un operatore non si accorgeva dell'approvazione e cliccava a mano "Trasmetti per
    l'installazione". Ora `/api/approva/[token]` chiama subito dopo
    `trasmettiPerInstallazioneAutomatico()` (nuova, `segnalazioni/actions.ts`): stessa identica
    validazione/creazione Ticket della funzione manuale (fattorizzata in un `eseguiTrasmissione()`
    condiviso), ma con service role e `operatore_id` null (azione di sistema, non di una persona —
    stesso principio dei cron). Se manca ancora qualcosa (raro) non blocca né segnala errore al
    cliente: resta in "Gestione Cliente" e il pulsante manuale rimane come rete di sicurezza.
    Avviso in Chat ad Analisi Rete quando scatta automaticamente.
  - **Elenco installazioni in Scheda Cliente**: nuova sezione "Installazioni effettuate" in fondo
    a `clienti-esterni/[id]`, una riga per Scheda di Installazione completata (`schede_lavoro` con
    `tipo='Nuova installazione'`, stesso confronto per telefono di Ticket/Preventivi collegati) —
    pulsante "Contratto" (URL firmata generata al click, mai incorporata nella pagina) e link
    "Scheda di lavoro" che apre il Ticket collegato (dove la Scheda è già mostrata per intero da
    `SchedaVista`, non duplicata qui).
  Verificato contro dati reali: ciclo completo crea-segnalazione-pronta/trasmetti-automatico/
  verifica-stato-Trasmessa/pulizia riuscito; interrogazione delle Schede "Nuova installazione"
  reali confermata (una scheda reale trovata senza ticket_id collegato — esclusa correttamente
  dall'elenco, comportamento atteso).

✅ **Elenco Installazioni — nuova tab in Clienti** (2026-08-20): richiesta esplicita — "un listato
  dei clienti installati con i dati inseriti nella scheda di lavoro". Proposta con artifact (3
  stili: tabella/schede/per tecnico), scelta **A** (tabella), come nuova tab dentro "Clienti"
  invece di una pagina a sé, visibile a tutto lo staff (stesso livello di "Clienti"/"Ticket" oggi).
  - `getInstallazioni()` (nuova, `clienti/actions.ts`): una riga per Scheda di Installazione
    completata (`schede_lavoro` con `tipo='Nuova installazione'`), arricchita col Ticket collegato
    (cliente/indirizzo/contratto) e il nome del tecnico (`creato_da` → `persone.nome`). Paginata a
    1000 righe come le altre liste "tutto lo storico" del gestionale.
  - `InstallazioniTabella` (nuova, `components/clienti/installazioni-tabella.tsx`): colonne
    Cliente/indirizzo, Data, Tecnico, CPE/MAC, Segnale (RSSI/SNR — evidenziato in arancione sotto
    una soglia indicativa, per intercettare installazioni da ricontrollare), Materiali (conteggio
    comodato/prodotti/servizi), Importo, Documenti (Contratto + link alla Scheda completa sul
    Ticket). Ricerca libera + filtri Tutte/Questo mese/Segnale debole.
  Verificato contro dati reali (stessa interrogazione replicata in sola lettura): comportamento
  coerente con quanto già osservato per la sezione "Installazioni effettuate" della Scheda Cliente.

✅ **Fix: "Trasmetti per l'installazione" non salta più sul nuovo Ticket** (2026-08-20): richiesta
  esplicita — dopo aver trasmesso una Segnalazione, chi trasmette (commerciale o chi per esso)
  restava catapultato sulla pagina Ticket con il Ticket appena creato già aperto
  (`router.push(/tickets?aperto=...)`), invece di restare su Segnalazioni. Rimosso: il toast
  continua a confermare il numero del nuovo Ticket, ma non c'è più nessun salto di pagina — resta
  su Segnalazioni con la bacheca aggiornata (`router.refresh()`).

✅ **Copia dati cliente più veloce e sicura** (2026-08-20): richiesta esplicita — migliorare come i
  dati inviati dal cliente si ricopiano nel gestionale contratti esterno. Il pannello "Dati
  ricevuti dal cliente" (dentro ogni Segnalazione) esisteva già diviso in 4 tab nello stesso
  ordine di quel gestionale esterno, con copia-per-campo al click — qui rifinito con 3
  miglioramenti proposti via artifact, tutti scelti dall'utente.
  - **Rifinitura righe**: icona di copia sempre visibile (prima solo al passaggio del mouse,
    invisibile su tablet/touch); valori "a rischio refuso" (codice fiscale, IBAN, partita IVA,
    PEC, CAP...) in font monospace, per non confondere 0/O; un campo copiato resta segnato in
    verde finché il pannello resta aperto — non solo un lampeggio al click.
  - **Copia tutto**: un pulsante per sezione (quando ha più di un campo) che copia l'intera
    sezione come blocco `etichetta: valore` in un colpo solo, in aggiunta al copia-per-campo.
  - **Modalità guidata**: un interruttore che sostituisce le 4 tab con un campo alla volta, grande
    e centrato, con un solo pulsante "Copia e vai avanti" (barra di avanzamento + elenco di cosa è
    già stato copiato) — per chi ricopia tanti campi di fila senza voler cercare ogni volta quello
    giusto. Facoltativa: le tab normali restano il comportamento di default.
  Nuovi componenti `GruppoDatiCliente`/`ModalitaGuidataCopia` in `segnalazioni-board.tsx`, nessuna
  migrazione (solo interfaccia, gli stessi dati già mostrati prima).

✅ **Colore fisso per reparto sul Ticket** (2026-08-20): richiesta esplicita — bacheca/dettaglio
  Ticket "caotici". Proposta con artifact (3 direzioni: cruscotto a blocchi/colore per reparto/
  timeline), poi una seconda proposta di dettaglio con 4 intensità del colore per reparto, scelta
  **C · Badge + fascia** in entrambe.
  - `globals.css`: nuovi token `--reparto-analisi-rete`/`--reparto-commerciale`/
    `--reparto-fatturazione` (+ varianti `-bg`, luce/buio) — blu/viola/verde a distanza di tinta
    sufficiente per restare distinguibili anche a chi ha una forma comune di daltonismo, separati
    dai colori di stato (successo/avviso/critico): un reparto non è mai un giudizio di urgenza.
  - `COLORE_REPARTO`/`coloreReparto()` (nuovi, `src/lib/types.ts`): mappa centralizzata, riusabile
    ovunque serva lo stesso colore di reparto in futuro.
  - Bacheca Ticket: badge colorato col nome del reparto (colore *e* testo insieme, mai il colore
    da solo) al posto del testo grigio "· Analisi Rete" in fondo alla riga categoria.
  - Dettaglio Ticket: fascia colorata in cima al Dialog (stesso "bleed" a bordi pieni già usato per
    l'intestazione sticky), riconoscibile ancora prima di leggere il campo "Reparto".
  Verificato che le classi Tailwind generate dinamicamente dalla mappa comparissero davvero nel
  CSS di produzione compilato (rischio noto di questo pattern: build pulita non basta a
  garantirlo).

✅ **Pannello Appuntamento uniformato e "a prova di scemo"** (2026-08-20): richiesta esplicita —
  "Nuovo"/"Modifica Appuntamento" (Calendario) erano rimasti al trattamento "prima serie" (campi
  impilati senza sezioni) mentre il resto del gestionale era già stato rifinito. Proposta con
  artifact (2 opzioni), scelta **B · Sezioni + rete di sicurezza**.
  - Entrambi i form riorganizzati in riquadri con icona (🛠️ Servizio, 📍 Luogo, 🗓️ Quando, 👷
    Assegnazione) — `SezioneForm`, componente condiviso nuovo, stesso linguaggio già in uso in
    Segnalazioni/Materiali.
  - **Tipo di servizio** (decide quale Scheda si apre dopo — Installazione o Lavorazione) non è
    più un `<select>` anonimo: due pulsanti colorati (`SelettoreTipoServizio`) che dicono anche
    cosa succederà, con nuovi token `--servizio-installazione`/`--servizio-lavorazione` in
    `globals.css` (teal/indigo, separati dalla palette reparto — dimensione diversa).
  - **Titolo bloccato per difetto** in "Modifica" (è generato in automatico da categoria +
    sottocategoria + cliente quando l'appuntamento nasce da un Ticket): sola lettura con un
    "Modifica" esplicito per sbloccarlo, invece di un testo libero sempre modificabile che un
    tocco distratto poteva rompere senza nessun avviso.
  - **Avviso se il tecnico non è assegnato** (`AvvisoTecnicoMancante`): prima si poteva salvare
    "Da assegnare" senza che nulla lo segnalasse.
  - **Fix collaterale**: `text-info` era già usato in un paio di punti del gestionale
    (`selettore-materiali.tsx`) ma senza il token `--info` mai registrato in `globals.css` — la
    classe Tailwind non esisteva davvero, il testo restava del colore ereditato invece che blu.
    Aggiunto ora (stessa tinta di `--reparto-analisi-rete`), corregge anche quell'uso preesistente.
  Verificato che tutte le nuove classi Tailwind dinamiche comparissero nel CSS di produzione
  compilato.

✅ **Nuovo/Modifica Appuntamento e Nuovo Promemoria: da pannello laterale a popup centrale**
  (2026-08-20): richiesta esplicita — "non vorrei sul menu laterale ma centrale, uniformando tutto
  il sistema". I tre Sheet rimasti in Calendario (Nuovo/Modifica Appuntamento, Nuovo Promemoria)
  erano l'ultimo punto del gestionale ancora sul trattamento a pannello laterale, mentre
  Segnalazioni/Ticket/Materiali/Scheda di lavoro sono già tutti Dialog centrali.
  - Tutti e 3 convertiti a `Dialog`/`DialogContent`, stessa intestazione sticky a bordi pieni già
    usata altrove (`-mx-4 -mt-4 border-b bg-popover`); rimossi i `px-4`/`pb-4` manuali diventati
    ridondanti (il contenitore del Dialog li fornisce già, a differenza dello Sheet).
  - Stesso fix già applicato a Ticket/Segnalazioni per i popup impilati: aprire la Scheda di
    lavoro nasconde (non chiude) il Dialog di modifica appuntamento dietro, che ricompare da solo
    se la Scheda viene annullata — comportamento preesistente, verificato intatto dopo la
    conversione da Sheet a Dialog.

✅ **Fix: il mondo attivo in sidebar restava "incollato" dopo aver cliccato il rail** (2026-08-20):
  bug reale trovato durante un audit grafico completo (subagent dedicato) — cliccare a mano
  un'icona del rail (es. "Vendita") impostava una scelta che restava valida per sempre, anche dopo
  aver navigato altrove (link, ricerca globale): il rail continuava a mostrare il mondo sbagliato
  rispetto alla pagina reale. Ora un vero cambio pagina (`pathname` diverso) azzera la scelta
  manuale e lascia di nuovo che sia la pagina corrente a decidere il mondo attivo — cliccare
  un'icona del rail resta comunque immediato, dato che da sola non naviga.

✅ **Attuazione dell'audit grafico completo — opzioni consigliate** (2026-08-20): richiesta
  esplicita ("fai come suggerito") — implementate tutte le opzioni consigliate + i piccoli fix
  segnalati dall'audit precedente.
  - **Tariffe** (opzione B): righe piatte → card con icona (Wifi) come Preventivi, `Badge`
    component al posto degli `<span>` ad-hoc, `StatoVuoto` per le liste vuote, Sheet → Dialog per
    tutti i form (Tariffa, Promozione), stesso trattamento anche in `TariffeArchivioBoard`
    ("Non sottoscrivibili").
  - **Dashboard** (opzione A): la tabella "per reparto" entra in un pannello con titolo/icona come
    le card KPI circostanti, righe con hover, reparto colorato con lo stesso
    `COLORE_REPARTO`/`coloreReparto()` già introdotto per i Ticket.
  - **Persone + Utenti** (opzione B): "Accessi condivisi" (ex pagina `/utenti`, introvabile dal
    menu ma ancora pienamente modificabile) è ora una seconda tab dentro "Persone" — stesso
    pattern già in uso in Materiali (Catalogo/Magazzino/Antenne). `/utenti` resta comunque
    raggiungibile per compatibilità con link salvati. `UtentiBoard` rifinita nello stesso giro:
    righe con avatar/`Badge` al posto della `<table>` nativa (era l'ultima rimasta nel
    gestionale), Sheet → Dialog, conferma esplicita nel disattivare un accesso. `PersoneBoard`:
    reparti colorati per persona, pulsante "Copia password" sulla password provvisoria di reset
    (prima solo testo da selezionare a mano), Sheet → Dialog.
  - **Anagrafica Clienti**: il banner di esito sincronizzazione ora è verde su successo (prima
    restava grigio anche quando riusciva, solo l'errore aveva un colore); avviso "può richiedere
    fino a un minuto" sul pulsante di sincronizzazione fatture (~59.000 righe).
  - **Navigazione**: nel mondo "Team" un separatore leggero ("Amministrazione") distingue ora
    "Lavorazioni Interne" (lavoro operativo, per chiunque) da "Persone"/"Stato Sistema" (solo
    admin), prima nella stessa lista piatta senza nessuna distinzione visiva.
  Verificato contro dati reali: le due query di Persone/Utenti (ora eseguite insieme dalla stessa
  pagina) restituiscono correttamente le righe reali di produzione (6 persone, 2 accessi
  condivisi).

✅ Sistema Subentro — doppio consenso in parallelo (2026-08, migrazione `0056`, proposta con
  artifact, Opzione B scelta): il modulo pubblico di Subentro raccoglieva solo i dati del nuovo
  titolare, nessun passaggio chiedeva mai una conferma esplicita al vecchio cliente. Ora la
  pratica ha due tracce indipendenti, in qualsiasi ordine:
  - Dal Ticket, "Invia una pratica al cliente → Subentro" avvia la pratica
    (`avviaPraticaSubentro`, crea la riga `richieste_clienti` prima ancora che qualcuno risponda) e
    apre due invii separati: un link di **sola conferma** (Sì/No, nessun dato) al vecchio cliente —
    riusa `token_approvazione`/`/api/approva/[token]` come contratto/preventivo/firma, nuova
    origine `subentro_vecchio_cliente` — e il modulo dati+documenti esistente al nuovo cliente
    (contatto non ancora noto al sistema, l'operatore lo inserisce a mano), con una spunta di
    volontà esplicita distinta dalla privacy ("Confermo di voler subentrare in questo contratto").
  - La bacheca Richieste Clienti e il pannello del Ticket mostrano due pallini di stato
    indipendenti (Vecchio cliente / Nuovo cliente: in attesa / confermato / rifiutato) invece di un
    unico stato generico.
  Verificato contro Supabase reale (migrazione `0056` applicata): giro completo crea pratica →
  genera token → conferma vecchio cliente → pulizia, e il vincolo "un solo riferimento" su
  `token_approvazione` rifiuta correttamente un token senza riferimenti.
✅ Bacheca Ticket, redesign (2026-08): la card mostrava sempre tutto — striscia di priorità accesa
  anche per "Normale" (il 90% dei Ticket), badge di reparto pieno ripetuto identico su ogni card,
  avatar/frecce sempre visibili, ombra pesante — niente distingueva informazione da decorazione,
  la bacheca sembrava "tutta attaccata". Tolto invece di aggiunto: via la striscia fissa (l'urgenza
  ora è un segnale testuale, solo se davvero Urgente), il reparto è un puntino di 7px invece di un
  badge di testo ripetuto, "prendi in carico"/"avanza stato" compaiono solo al passaggio del mouse
  (a riposo si vede solo l'avatar se già assegnato), soglia "in attesa" alzata da 2 a 5 giorni,
  nessuna ombra a riposo (solo un bordo sottile — le ombre impilate erano parte del problema).
  Proposta con artifact (mockup funzionante, non solo statico), approvata dopo due giri di revisione.
✅ Bacheca Ticket, raggruppamento per categoria (2026-08, terzo giro): tolti i colori, il vero
  disturbo restava il testo — la riga di categoria/sottocategoria era quasi identica su gran parte
  delle card di una colonna (es. 4 Ticket di fila con scritto "Assistenza · Pianificazione
  installazione"), pura ripetizione senza informazione nuova. `raggruppaPerCategoria()` ora scrive
  quell'etichetta una volta sola per gruppo (mantenendo l'ordine di priorità già esistente — il
  gruppo compare dov'è il suo primo Ticket), con accanto il conteggio di quanti Ticket sono fermi
  allo stesso passaggio — un dato che prima non c'era da nessuna parte. Le righe sotto mostrano solo
  nome e numero. Proposta con artifact (zoom sullo screenshot reale mandato dall'utente), Opzione 1
  scelta su 3. Seguito da: le etichette di gruppo hanno ora un colore distinto l'una dall'altra
  (`coloreGruppo()`, hash deterministico sulla stringa → 6 tinte terrose dedicate, `--tag-*` in
  globals.css) — a differenza di `COLORE_REPARTO`, qui l'insieme di categorie/sottocategorie non è
  fisso, quindi un colore "per identità" invece che "per significato", deliberatamente lontano da
  reparto/servizio/stato per non essere scambiato per un giudizio di reparto o urgenza. Verificato
  che Tailwind genera davvero le 12 classi dinamiche (grep sul CSS compilato).

Fuori scope per ora: Storico Modifiche (UI, non prioritario per ora). I contratti si continuano a
generare sul gestionale esterno esistente — qui si carica solo il PDF già pronto (vedi sopra),
niente generazione automatica.

✅ Controllo d'oro sull'interfaccia (2026-08): audit mirato a bug/sovrapposizioni/incoerenze, non
  estetico. Trovato e corretto: 5 punti dell'app erano rimasti sul vecchio popup a pannello
  laterale (Sheet) mentre tutto il resto del gestionale era già stato uniformato al popup centrale
  (Dialog) in un giro precedente — Clienti (dati contrattuali), Materiali (nuovo/modifica
  materiale), Magazzino (giacenza), Vista Tecnico (Nuovo Ticket + Rapportino — la stessa schermata
  mostrava un pannello laterale per un pulsante e un popup centrale per un altro, la Scheda, a
  seconda di quale si premeva), Richieste Clienti (dettaglio pratica). Tutti e 5 convertiti a
  Dialog, `src/components/ui/sheet.tsx` rimosso (zero importatori rimasti, verificato via grep).
  Fix minore: tabella fatture in Clienti Esterni aveva `overflow-y-auto` ma non `overflow-x-auto`
  — aggiunto per coerenza con la regola già in uso altrove (contenuto largo sempre nel proprio
  contenitore scrollabile). Verificato: zero conflitti di `z-index` reali tra i popup fissi
  dell'app (sidebar/chat/todo/persona-switcher/toast/Dialog), tutti già su livelli coerenti.
  Verificato: build/lint puliti dopo ogni modifica.

Con Portale e Approvazione migrati, il vecchio gestionale Apps Script non ha più flussi pubblici
esclusivi (restano solo `approvaEmail`/`Portale`/`RichiestaDati`/ecc. come fallback per i link già
inviati ai clienti prima di questa migrazione) — valutare in futuro se e quando reindirizzare
anche `area.donewifi.it` a questo gestionale, una volta esauriti i link vecchi in circolazione.

✅ Sezione Buy&Go in Clienti Esterni (2026-08): i clienti con profilo "Buy & Go"/"Buy Pro" non hanno
  un canone fisso come gli altri — pagano a consumo, attivando e pagando periodi quando vogliono
  (confermato incrociando dal vivo anagrafica e fatture Aruba: stessi clienti con importi diversi —
  6,50€/9,50€/13€/16€/19€/39,50€... — a cadenza irregolare, mai un ciclo mensile fisso). Prima erano
  mescolati con tutti gli altri profili internet, senza nessuna vista dedicata. Nuovo tab "Buy&Go"
  nella pagina Anagrafica Clienti (stesso principio "vista" già usato per Materiali/Persone-Utenti/
  Clienti-Installazioni): elenco cliccabile con totale incassato/attivazioni per cliente, dettaglio
  (Dialog) con lo storico completo di ogni fattura — data, importo, pagata sì/no, metodo. Nessuna
  sincronizzazione nuova: `getClientiBuyGo()` (`clienti-esterni/actions.ts`) incrocia
  `clienti_esterni.profilo_internet` e `fatture_esterne` già sincronizzati, raggruppando per CF/PIVA
  (una persona può avere più righe anagrafiche). Verificato: query standalone contro Supabase reale,
  153 clienti unici, 1071 fatture collegate correttamente; build/lint puliti.
✅ Fix sincronizzazione Aruba (2026-08): due problemi trovati insieme.
  1. `ARUBA_BRIDGE_SECRET` era sparita dalle variabili d'ambiente di Vercel (restava solo
     `ARUBA_BRIDGE_URL`) — ripristinata (Production e Preview) col valore letto direttamente dal
     ponte PHP (`ponte-anagrafica.php`), poi redeploy per renderla effettiva.
  2. Con la variabile ripristinata, la sincronizzazione falliva comunque con "Impossibile
     raggiungere il ponte Aruba" — ma lo stesso URL rispondeva 200 OK in <1s chiamato da fuori
     Vercel. Causa probabile: l'hosting condiviso Aruba/cPanel ha una protezione anti-bot che
     blocca richieste senza uno User-Agent da browser (`fetch()` lato server ne manda uno generico/
     assente). Aggiunto uno User-Agent esplicito e un timeout (20s anagrafica, 30s per pagina
     fatture) a entrambe le chiamate in `sincronizzaAnagraficaAruba()`/`sincronizzaFattureAruba()`
     (`clienti-esterni/actions.ts`); l'errore vero ora resta anche loggato (`console.error`) invece
     di sparire nel `catch` — prima impossibile capire se fosse un timeout, un blocco o altro.
✅ Segnalazioni — "parcheggio" per clienti dubbiosi (2026-08, migrazione `0057`, proposta con
  artifact, Opzione C scelta): il percorso pre-contratto era rigidamente lineare (Da Contattare →
  In Contatto → Gestione Cliente → Trasmessa) e passare a "Gestione Cliente" avviava subito la
  richiesta dati — nessun modo di dire "l'ho sentito, sta pensandoci" senza forzarlo avanti o
  perderlo tra i lead appena arrivati. Aggiunta un'etichetta trasversale (non un nuovo stato):
  - Dal pannello di dettaglio, solo in "In Contatto" (l'unico punto dove ha senso), "Segna come
    dubbioso" apre un mini-form (motivo a pillole + data di richiamo facoltativa) —
    `impostaDubbioso()`/`rimuoviDubbioso()` in `segnalazioni/actions.ts`.
  - La colonna "In Contatto" della bacheca si divide in due gruppi — "Da richiamare" e "🤔 In
    attesa di decisione" — stesso principio già collaudato per la bacheca Ticket
    (`raggruppaPerCategoria`), qui applicato ai dubbiosi invece che alla categoria.
  - La card mostra motivo e data di richiamo direttamente in bacheca; se la data è oggi o passata
    il segnale diventa critico ("Richiamalo oggi").
  Verificato: build/lint puliti. Migrazione `0057` (colonne `dubbioso_dal`/`motivo_dubbio`/
  `richiamare_il` su `segnalazioni`) da applicare manualmente prima che il flusso sia operativo.
✅ Promemoria email verso attivazioni@donewifi.it (2026-08, richiesta esplicita): tre notifiche,
  tutte via `emailAvvisoInterno()` (nuovo template condiviso in `lib/email.ts`, tono interno —
  niente "Gentile [nome]", solo i fatti e un link diretto al gestionale):
  - **Nuova Segnalazione** — `creaSegnalazione()` (`segnalazioni/actions.ts`), non blocca la
    creazione se l'invio fallisce.
  - **Nuovi dati/documenti ricevuti dal cliente** — `api/richiesta-dati/route.ts`, stesso evento
    già notificato via Telegram/Chat al reparto Commerciale, ora anche via email.
  - **Riepilogo mattutino delle Segnalazioni non prese in carico** (`stato = "Da Contattare"`,
    nessuna soglia di giorni — è un riepilogo giornaliero, non un allarme) — aggiunto al cron
    `promemoria-ticket` già esistente (il piano Vercel Hobby permette solo 2 cron job, entrambi già
    occupati). Orario spostato da `"0 8 * * 1-6"` a `"0 9 * * *"` in `vercel.json` apposta per
    questo — sposta di un'ora, e a tutti i giorni invece di lun-sab, anche i due controlli Telegram
    già presenti in quel cron (ticket fermi, richiesta dati ferma), effetto collaterale accettato
    per non consumare l'ultimo slot di cron libero.
  Verificato: email di test reale inviata e ricevuta su attivazioni@donewifi.it; build/lint puliti.
✅ Pratiche cliente senza Ticket (2026-08, migrazione `0058`, proposta con artifact, doppia via
  scelta): Trasferimento, Cambio IBAN e Cambio Anagrafica non passano più necessariamente da un
  Ticket — sono censite con data direttamente sulla scheda del Cliente Esterno vero, avviabili sia
  dal cliente sia dall'operatore:
  - `richieste_clienti.cliente_esterno_id` (nuova colonna) collega la pratica al cliente reale
    (anagrafica Aruba) invece che solo, facoltativamente, a un Ticket.
  - **Lato cliente** — nuova tab "Le mie pratiche" nel Portale pubblico (`/portale`):
    identificazione con telefono + CF/PIVA insieme (Opzione C della proposta "Come trovare il
    cliente" — mai un caso ambiguo di più risultati), poi lo stesso modulo pubblico di sempre.
    Nuova rotta pubblica `/api/portale/trova-cliente`.
  - **Lato operatore** — nuova sezione "Pratiche" nella scheda Cliente Esterno
    (`clienti-esterni/[id]`): elenco delle pratiche esistenti + "Avvia una nuova pratica" (stesso
    pannello "Invia una pratica al cliente" di Tickets, spostato qui — nessuna identificazione da
    rifare, l'operatore è già sulla scheda giusta).
  - Subentro resta escluso da questa semplificazione — ha il suo flusso dedicato a doppio consenso
    (vecchio + nuovo cliente), costruito a parte in Ticket poche settimane fa, requisiti diversi
    dalle altre 3. Disdetta resta fuori: è solo una pagina di istruzioni per una comunicazione
    scritta (la normativa lo richiede), non un modulo compilabile.
  Verificato: build/lint puliti. Migrazione `0058` da applicare manualmente prima che il flusso sia
  operativo.
✅ Controllo d'oro post-"Pratiche senza Ticket" (2026-08): trovato un vero doppione lasciato dal
  giro precedente — il pannello "Invia una pratica al cliente" dentro il Ticket permetteva ancora
  di inviare Trasferimento/Cambio IBAN/Cambio Anagrafica da lì, un secondo modo di fare la stessa
  cosa ora avviabile (correttamente) dalla scheda Cliente Esterno. Tolte le 3 dal menu del pannello
  Ticket (resta solo Subentro, che ha il suo flusso dedicato, e Disdetta, mai stata parte del
  problema); aggiornati i testi informativi delle sottocategoria Ticket corrispondenti per puntare
  alla scheda Cliente Esterno invece che al pannello Ticket. Consolidato anche un doppione più
  vecchio: `StatoTraccia` (Ticket) e `PallinoTraccia` (Richieste Clienti) erano la stessa mappa
  icona/colore "ok/no/attesa" scritta due volte — estratta in `src/lib/stato-traccia.ts`, condivisa
  da entrambi (il layout resta specifico di ciascuno, sono contesti visivamente diversi). Verificato:
  build/lint puliti.
✅ Navigazione Clienti semplificata (2026-08, proposta con artifact, Opzione B scelta): "Clienti" e
  "Anagrafica Clienti" erano due voci quasi omonime nel menu, senza nessun indizio su quale aprire
  per fare cosa (verificato: rappresentano davvero due dati diversi — clienti derivati dai Ticket
  vs anagrafica Aruba completa, 3900+ clienti — non un doppione da fondere alla cieca). Stesso
  schema già usato per Persone+Utenti e Materiali: una sola voce "Clienti" nel menu, "Anagrafica"
  diventa una terza tab dentro `/clienti` invece di una pagina a sé — `clienti/page.tsx` ora recupera
  anche i dati dell'anagrafica (solo se chi guarda ha il permesso Commerciale/Fatturazione/admin,
  stesso controllo che prima nascondeva la voce nel menu — senza permesso quei dati pesanti non
  vengono nemmeno recuperati dal server). `/clienti-esterni` resta comunque raggiungibile per i link
  diretti già in giro (stesso principio già usato per `/utenti` dopo la fusione Persone+Utenti).
  Verificato: query della pagina fusa contro Supabase reale (199 tariffe, 3914 clienti esterni,
  14 Ticket); build/lint puliti.
✅ Dati Segnalazione modificabili dopo la creazione (2026-08, richiesta esplicita): prima non c'era
  nessun modo di correggere un refuso su nome/telefono/email/indirizzo/copertura/tipologia/note una
  volta creata la Segnalazione — bisognava eliminarla e ricrearla da capo. Nuovo pulsante "Modifica
  dati" nell'intestazione del dettaglio, apre un modulo (Dialog annidato, stesso set di campi/
  pattern del modulo "Nuova Segnalazione") precompilato coi valori esistenti — `aggiornaDatiSegnalazione()`
  in `segnalazioni/actions.ts`, registra "Dati modificati" nello storico. Verificato: giro
  aggiorna→storico→pulizia contro una Segnalazione reale (nessun valore alterato); build/lint puliti.
✅ Segnale pulsante quando arrivano i dati del cliente (2026-08, richiesta esplicita): il badge
  "✓ Dati ricevuti — pronta per il contratto" nella colonna "Gestione Cliente" era statico, identico
  a tutti gli altri badge della bacheca — facile da perdere scorrendo. Ora pulsa (`animate-pulse`)
  finché la pratica resta in quello stato — si ferma da sola quando avanza oltre "Gestione Cliente"
  (il segnale sparisce insieme allo stato che lo genera, niente da spuntare a mano). Verificato:
  build/lint puliti.
✅ Segnale "Dati ricevuti" più vistoso e blu (2026-08, richiesta esplicita): il verde si confondeva
  con gli altri toni di successo già in uso ovunque nel gestionale — passato al blu (`--info`,
  già registrato) per essere una tinta a sé, mai usata per altri segnali della bacheca Segnalazioni.
  Aggiunto anche un puntino con animazione "ping" (l'anello che si espande e sparisce, poi
  ricomincia) prima del testo — stesso pattern delle notifiche di WhatsApp/iOS, il segnale più
  riconoscibile in assoluto per "cosa è appena arrivato". Verificato: build/lint puliti, le 4 classi
  dinamiche (`bg-info`, `bg-info/15`, `ring-info/40`, `text-info`) confermate nel CSS compilato.
✅ Riepilogo mattutino "documenti arrivati" (2026-08, richiesta esplicita — segnalato come "non
  arrivano le email": diagnosi confermata che non era un bug, mancava proprio questo pezzo).
  Distinto dal riepilogo "non prese in carico" già esistente: elenca invece tutto ciò che è arrivato
  da `richieste_clienti` nelle ultime 24 ore — Richiesta Dati + tutte le pratiche (Cambio IBAN/
  Anagrafica/Trasferimento/Subentro), non solo le Segnalazioni. Aggiunto allo stesso cron
  `promemoria-ticket` (nessun terzo slot di cron disponibile su piano Hobby), stesso orario (9 del
  mattino, tutti i giorni), verso attivazioni@donewifi.it. Verificato: chiamata reale all'endpoint di
  produzione (`ticketFermi: 5, segnalazioniFerme: 1, segnalazioniNonPrese: 0` prima della modifica,
  confermando che il cron funzionava già correttamente); build/lint puliti dopo l'aggiunta.
✅ Segnalazioni — 3 modifiche mirate da audit di layout (2026-08, proposta con artifact, audit
  parte per parte): 6 delle 8 parti esaminate confermate a posto, tre aggiustamenti precisi
  applicati.
  - Blocco "Dubbioso" spostato **dopo** Tipologia/Telefono/Email/Indirizzo/Note invece che prima —
    ordine di lettura corretto (prima chi è il cliente, poi lo stato della trattativa), nessun
    contenuto cambiato.
  - Sezione Contratto: i 3 paragrafi di testo separati (approvato/in attesa/non ancora inviato,
    icona e colore scelti uno per uno) uniti in un **badge unico colorato**, stesso linguaggio dei
    segnali già usati in bacheca — l'azione "invia di nuovo" ora è incorporata nel badge stesso.
  - Bottone "Elimina segnalazione": aggiunto un separatore (bordo + spazio) sopra, per distinguere
    visivamente l'unica azione distruttiva del pannello dalle sezioni "normali" che la precedono.
  Verificato: build/lint puliti.
✅ Riordino mondo Vendita — "Nuovi Clienti" + "Gestione Cliente" (2026-08, proposta con artifact,
  3 passi): "Segnalazioni" era ambiguo — gestiva solo i contatti NUOVI, non un cliente già
  esistente.
  - **Passo 1** (solo etichetta): "Segnalazioni" → "Nuovi Clienti" (menu, H1, pulsante "Nuovo
    Cliente"). Indirizzo invariato (`/segnalazioni`).
  - **Passo 2** (solo etichetta + posizione): "Richieste Clienti" → "Gestione Cliente", spostata dal
    mondo Assistenza al mondo Vendita, accanto a "Nuovi Clienti". Indirizzo invariato
    (`/richieste-clienti`) — Trasferimento/Cambio IBAN/Cambio Anagrafica/Subentro ci sono già tutti
    (Subentro ci arriva da tempo tramite `avviaPraticaSubentro()`).
  - **Passo 3** (Opzione A scelta): la Disdetta non aveva mai lasciato traccia nel gestionale — resta
    una pagina di sole istruzioni (`/disdetta`, la normativa richiede una comunicazione scritta, non
    un modulo web) ma un nuovo pulsante "Segna disdetta ricevuta" nella scheda Cliente Esterno
    (`segnaDisdettaRicevuta()`) crea una riga in `richieste_clienti` — non sostituisce la
    comunicazione ufficiale, la fa solo comparire in "Gestione Cliente" insieme alle altre pratiche.
  Verificato: giro insert→lettura→pulizia contro un cliente reale (`cliente_esterno_id` collegato
  correttamente); build/lint puliti.
✅ Ricerca iniziale — ambito "solo clienti" (2026-08, richiesta esplicita): la ricerca globale in
  sidebar (⌘K) cercava sempre insieme Ticket/Segnalazioni/Clienti. Aggiunte due pillole sotto il
  campo ("Tutto" / "Solo clienti") — con "Solo clienti" attivo, `ricercaGlobale()` non interroga
  nemmeno Ticket/Segnalazioni (non solo li nasconde: le query non partono proprio), e il limite
  risultati sale da 8 a 15 visto che resta l'unico tipo mostrato. Placeholder del campo cambia di
  conseguenza. Filtro non salvato tra sessioni (deliberato — sorprenderebbe chi riapre la ricerca
  aspettandosi il comportamento consueto). Verificato: query dell'ambito "clienti" contro Supabase
  reale (15 risultati); build/lint puliti.
✅ Gestione Cliente — esclusa "Richiesta Dati" (2026-08-25, richiesta esplicita): la pagina
  mostrava anche le righe `tipo_richiesta = "Richiesta Dati"`, che però riguardano un contatto
  NUOVO ancora nella pipeline "Nuovi Clienti" (resta comunque visibile nel dettaglio della
  Segnalazione d'origine) — non una pratica di un cliente già esistente. Aggiunto
  `.neq("tipo_richiesta", "Richiesta Dati")` alla query di `richieste-clienti/page.tsx` (solo lì,
  non nella fetch equivalente di `segnalazioni/page.tsx`) e corretto il sottotitolo della pagina
  (non elenca più "Richiesta Dati" tra le pratiche gestite qui). Verificato contro Supabase reale:
  una riga "Trasferimento" e una "Richiesta Dati" in tabella, la query filtrata ne restituisce solo
  1 (la "Trasferimento"); build/lint puliti.
✅ Clienti duplicati / flag "attivo" sbagliato (2026-08-25, bug reale segnalato dall'utente).
  Diagnosi contro dati reali: ogni rinnovo/adeguamento di un contratto su Aruba scrive una riga
  NUOVA in `clienti_esterni` invece di aggiornare quella esistente (stesso `codice_gestionale`,
  `id` diverso) — 696 righe su 3914 erano versioni superate dello stesso contratto, non clienti
  diversi. Due fix:
  - **Duplicati**: nuova `dedupClientiPerContratto()` (`lib/clienti-esterni.ts`) — raggruppa per
    `codice_gestionale` (non per CF/PIVA: un CF/PIVA con più `codice_gestionale` resta legittimo,
    è la stessa persona con più punti installati) e tiene la riga con `id` più alto. Applicato
    ovunque si mostrino/contino "i clienti": lista Anagrafica, tab Anagrafica di Clienti, Buy&Go,
    ricerca globale. Le righe superate non spariscono: restano visibili nella scheda cliente sotto
    "Contratti precedenti su questo codice gestionale" (`getContrattiPrecedenti()`).
  - **Flag "attivo"**: `ricalcola_clienti_attivi()` usava "fatturato negli ultimi 90 giorni" — segnale
    sbagliato per chi fattura trimestralmente/annualmente/a consumo (Buy&Go): 868 clienti con
    contratto Aruba davvero attivo risultavano "non attivo". Migrazione `0059` (eseguita)
    ridefinisce `attivo = contratto_attivo` (il flag grezzo Aruba, prima tenuto solo come
    riferimento, ora fonte primaria) — la fatturazione resta visibile in scheda ma non decide più
    lo stato.
  Verificato contro Supabase reale: dedup passa da 3914 a 3218 righe (-696, tutte rinnovi
  confermati stesso `codice_gestionale`); dopo la migrazione, 0 righe con `attivo != contratto_attivo`
  su 3914; build/lint puliti.
✅ Clienti duplicati — fase 2 e fix di un bug reale trovato in verifica (2026-08-25, "analizza" su
  richiesta esplicita). Analisi del residuo di 546 CF/PIVA con più righe allo stesso indirizzo ma
  `codice_gestionale` diverso: 512 avevano UNA sola riga viva (stesso contratto ricodificato più
  volte da Aruba nel tempo), 9 nessuna (cliente cessato), 25 con **2+ righe attive insieme allo
  stesso indirizzo** — es. CF `GHNDLM52R18F205X` con una riga "Buy & Go" e una riga linea fissa,
  **entrambe vive**: installazioni/servizi realmente distinti, da non fondere mai.
  - Nuova `dedupClientiPerInstallazione()` (`lib/clienti-esterni.ts`) — secondo livello sopra
    `dedupClientiPerContratto()`: raggruppa per CF/PIVA + indirizzo normalizzato, collassa solo se
    al massimo una riga è attiva, lascia intatti i gruppi con 2+ righe attive contemporaneamente.
    Applicato a lista Anagrafica, tab Anagrafica di Clienti, Buy&Go (`ricercaGlobale()` e la lista
    ridotta di `/clienti` restano al solo livello 1, select più leggere, rischio residuo trascurabile).
  - **Bug reale trovato in fase di verifica, corretto prima del deploy**: `dedupClientiPerContratto()`
    sceglieva la riga con `id` più alto assumendo fosse sempre quella viva — falso in 396 gruppi
    su dati reali (es. `codice_gestionale=901105`: id=50 attivo, id=1114 — importato dopo ma di un
    contratto già chiuso — non attivo; la vecchia regola avrebbe tenuto quella morta). Corretto:
    sceglie la riga attiva quando ce n'è esattamente una, tra più attive la più recente, altrimenti
    la più recente in assoluto — stessa regola ora condivisa da entrambi i livelli.
  - `getContrattiPrecedenti()` esteso: lo storico in scheda cliente ora include anche le
    ricodifiche di livello 2, non solo i rinnovi di livello 1.
  Verificato contro Supabase reale con un invariante esplicito (non solo "conta le righe"): per
  ogni gruppo con almeno una riga attiva, la riga scelta come canonica è sempre quella attiva — 0
  violazioni su 2397 gruppi; i 27 gruppi con 2+ righe attive allo stesso indirizzo restano intatti
  al 100%. Risultato: 3914 righe → 2684 dopo i due livelli di dedup; build/lint puliti.
✅ Flag "attivo" — combinata contratto Aruba + fatturato 12 mesi (2026-08-25, richiesta esplicita:
  "quanti clienti ti risultano? dovrebbero essere circa 1800"). Dopo il dedup risultavano 2397
  installazioni "attive" per `contratto_attivo` — molto più del previsto. Incrociando con le
  fatture reali (non solo negli ultimi 90 giorni, ogni fattura mai emessa): 531 di quelle 2397 non
  fatturano da oltre un anno (179 da oltre 2 anni, 221 mai fatturato una volta) — il flag
  `contratto_attivo` di Aruba non si aggiorna in modo affidabile alla chiusura di un contratto,
  come temuto prima della migrazione `0059`. Né "fatturato negli ultimi 90 giorni" da solo (logica
  originale, troppo severa) né "contratto_attivo" da solo (0059, troppo permissiva) erano
  sufficienti. Migrazione `0060` (eseguita e verificata): `attivo = contratto_attivo AND fatturato
  negli ultimi 12 mesi` — le due condizioni insieme. Verificato contro Supabase reale dopo
  l'esecuzione: 0 righe discordanti dalla regola attesa; dopo il dedup risultano 1921 installazioni
  attive / 1881 persone uniche, vicino al numero atteso (~1800); build/lint puliti.
✅ pose.donewifi.it — sistema separato per i tecnici esterni (2026-08-26, richiesta esplicita:
  "semplificare la procedura per i tecnici esterni, non passare dal gestionale ma fare un altro
  sistema"). Stesso progetto Next.js, stesso database, nuovo dominio — non un secondo deploy da
  mantenere.
  - **Identità separata da `persone`** (migrazione `0061`, da eseguire manualmente): tabella
    `tecnici_esterni` con account fisso email+password (hash pgcrypto, stesso schema della password
    "Tu sei" di `persone` — migrazione 0006), nessun reparto/permesso sul gestionale, non compare
    nel selettore "Tu sei" né in Persone/Utenti. Sessione con cookie firmato dedicato
    (`lib/tecnico-esterno.ts`, stesso HMAC di `persona.ts` ma namespace diverso) — niente Supabase
    Auth: `/pose` è pubblica nel proxy, la sua autenticazione vive dentro le pagine stesse.
  - **Dominio dedicato**: `proxy.ts` riscrive OGNI percorso di `pose.donewifi.it` con il prefisso
    `/pose` (a differenza di `area.donewifi.it`, che riscrive solo la radice) — su questo host
    "/pose" non compare mai nell'URL. Il dominio va aggiunto manualmente su Vercel + DNS (fuori
    portata di queste Server Action).
  - **`tecnico_esterno_id`** nullable su `tickets`/`appuntamenti`, accanto a
    `tecnico_assegnato`/`tecnico_id` (mai valorizzati insieme — `assegnaTicket()`/
    `assegnaTicketTecnicoEsterno()` azzerano sempre l'altro campo). Assegnazione dal dettaglio
    Ticket ("Assegnato a"), oltre a "Prendi in carico" ora anche un selettore tecnici esterni.
  - **Dashboard pose** (`/pose`): interventi/appuntamenti assegnati al tecnico collegato, niente
    sidebar/mondi del gestionale interno. **Rapportino di chiusura** (`/pose/interventi/[id]`):
    stessa interazione esito/lavori/materiali/foto/firma cliente del Rapportino interno, ma
    un'action a sé (`completaTicketConRapportinoEsterno()`, service role, nessuna sessione Supabase
    Auth) — `rapportini_intervento.creato_da_tecnico_esterno_id` (colonna gemella nullable di
    `creato_da`, che resta `references persone(id)`).
  - **Firma cliente condivisa**: le 4 funzioni OTP/link email di calendario/actions.ts (usate anche
    dallo staff interno per Schede) ora accettano un "operatore" (`lib/operatore.ts`) — persona O
    tecnico esterno — invece di richiedere sempre una persona; lette con service role invece del
    client legato ai cookie (un tecnico esterno non ha sessione Supabase Auth, l'RLS le avrebbe
    sempre restituite vuote).
  - **Amministrazione** (`/tecnici-esterni`, solo admin): crea/modifica/disattiva account,
    reimposta password — stesso pattern "password provvisoria mostrata una volta sola" di Persone.
  Verificato: build/lint puliti. **Da fare per andare in produzione**: eseguire la migrazione
  `0061`, creare il primo account tecnico. Il dominio `pose.donewifi.it` è già stato aggiunto su
  Vercel e il record DNS (CNAME su Aruba) è stato creato — in attesa di propagazione.
✅ Scheda Installazione/Lavorazione su pose.donewifi.it + redesign mobile (2026-08-26, richiesta
  esplicita: "rivedere completamente il sistema di schede di lavoro... tutto pose sarà usato solo
  da tablet e smartphone").
  - **Schede anche per i tecnici esterni**: `SchedaInstallazioneForm`/`SchedaLavorazioneForm`
    (già un wizard a passi, con stepper e barra azione fissa in basso — redesign di una sessione
    precedente) accettano ora `salvaSchedaLavoro`/`getTipologiaClientePerAppuntamento` come prop
    opzionali (default: le action staff, invariate per Ticket/Calendario/Vista Tecnico) — pose passa
    le sue (`salvaSchedaLavoroEsterno()`, service role, gate su tecnico esterno invece che persona).
    Stesso principio già usato per il Rapportino. Migrazione `0062` (da eseguire manualmente):
    `schede_lavoro.creato_da_tecnico_esterno_id`, gemella nullable di `creato_da` (`references
    persone(id)`, non può ospitare un tecnico esterno). Nuova pagina `/pose/appuntamenti/[id]`.
  - **Fix strutturale**: `SchedaWizard` usava `DialogTitle`/`DialogDescription` (primitive Radix,
    richiedono un `Dialog.Root` come antenato) — funzionava solo dentro un Dialog aperto. Sostituite
    con `<h2>`/`<p>` semantici, stessa resa visiva identica: nessuna differenza dove il wizard viveva
    già, ma ora funziona anche a schermo intero su pose, senza Dialog attorno.
  - **Redesign mobile/tablet** delle superfici esclusive di pose (dashboard, login, rapportino):
    target touch generosi (bottoni/campi h-11/h-12/h-14 invece del default desktop h-8), container
    allargato a `max-w-2xl` (non più `max-w-lg`, che su un iPad lasciava margini vuoti ai lati come
    un dialog rimpicciolito), griglia a 2 colonne da tablet in su per le liste, azione principale del
    Rapportino fissa in basso (stesso principio già nello SchedaWizard, ora anche lì).
  Verificato: build/lint puliti.
✅ Tecnici esterni — login per username scelto dall'admin (2026-08-26, richiesta esplicita: "per i
  tecnici userei un nome utente che definiamo noi e la password la segniamo noi"). Prima: login per
  email + password provvisoria generata a caso (stesso schema di Persone), mostrata una volta sola.
  Migrazione `0063` (da eseguire manualmente): nuova colonna `username` (identificativo di accesso,
  scelto dall'admin), `email` torna un contatto facoltativo come `telefono`. Il form Nuovo/Modifica
  tecnico ha ora un campo Password diretto (minimo 6 caratteri, vuoto in modifica = non cambiarla)
  invece della password provvisoria generata — l'admin la sceglie e se la segna da sé (resta comunque
  irreversibile una volta salvata: l'hash non si può "rileggere", stesso principio di ogni altra
  password del gestionale). Login pose.donewifi.it aggiornato a nome utente + password. Verificato:
  0 righe esistenti in `tecnici_esterni` prima della migrazione (nessun dato da migrare); build/lint
  puliti.
✅ Fix pose.donewifi.it — 404 su login/redirect (2026-08-26, bug reale trovato in produzione dopo
  l'attivazione del dominio). Le pagine di pose usano `redirect("/pose/login")` (il percorso interno
  vero, dentro `src/app/pose/...`) — `redirect()` non è un rewrite silenzioso come quello di
  `proxy.ts`: genera una vera navigazione del browser verso quell'URL letterale, che su
  `pose.donewifi.it` passava DI NUOVO dalla riscrittura, raddoppiando il prefisso in
  `/pose/pose/login` (404). Stesso esito se un utente scrive `/pose/...` a mano nell'URL. Riscrittura
  ora idempotente: se il percorso è già `/pose` o comincia per `/pose/`, non lo tocca. Verificato
  contro il sito reale: `pose.donewifi.it/login` → 200 (login), `pose.donewifi.it/pose/login` → prima
  404, dopo il fix risolve correttamente anche quello; build/lint puliti.
✅ Schede di Lavoro su pose — "una domanda alla volta" (2026-08-26, richiesta esplicita dopo due
  round di redesign respinti: "presenta diverse soluzioni che migliori" → Opzione A scelta tra 3
  proposte con artifact, pensata per chi non ha dimestichezza con gli smartphone).
  - Le Schede di Installazione/Lavorazione su pose.donewifi.it non usano più
    SchedaInstallazioneForm/SchedaLavorazioneForm (il wizard interno a passi con più campi
    ciascuno, restato invariato per il gestionale — le due prop opzionali aggiunte nel giro
    precedente per "innestarci" le action di pose sono state rimosse, inutilizzate ora) — nuovi
    componenti dedicati `SchedaInstallazioneDomande`/`SchedaLavorazioneDomande`
    (`components/pose/`), un campo per schermata invece di un gruppo di campi per passo.
  - Nuovo motore `DomandaWizard` (`components/pose/domanda-wizard.tsx`): barra di avanzamento
    invece delle pillole di SchedaWizard (una Scheda Installazione qui ha ~20 domande, troppe per
    pillole singole), un solo bottone enorme "Avanti" sempre in basso.
  - Nuovi controlli a piastrella `TileScelta`/`TileMultiScelta` (`components/pose/tile-scelta.tsx`)
    al posto dei `<select>` nativi — un bottone alto e leggibile per opzione invece di un menu a
    tendina compresso.
  - Stessa identica chiamata finale (`salvaSchedaLavoroEsterno`), stesso principio di bozza
    salvata in locale (`lib/bozza-scheda.ts`, invariato) — cambia solo la navigazione, non la
    logica di salvataggio.
  Verificato: build/lint puliti.
✅ Scheda Installazione — revisione domanda per domanda (2026-08-26, richiesta esplicita: "rivediamo
  con artifact passo passo... se tenerla, modificarla o altro"). Strumento di revisione pubblicato
  come artifact (tutte le 22+6 domande, con "Tieni/Modifica/Rimuovi" e copia del riepilogo) —
  decisioni ricevute per la Scheda Installazione, applicate:
  - **Rimosse**: VLAN di management, Segnale SNR, Router usato (giudicate superflue sul campo), la
    firma del tecnico (resta solo quella del cliente via email — l'unica che certifica davvero
    l'intervento).
  - **"Che tipo di cavo hai posato?" non è più una domanda a scelta fissa**: il cavo si registra
    come qualunque altro materiale nella domanda "Hai usato materiali extra?" (il catalogo li
    include già) — "Quanti metri" resta, come domanda a sé.
  - **"Non riscosso" → "In Fattura"** (meno ambiguo) — cambiato ovunque nel gestionale, non solo su
    pose: stessa colonna `metodo_pagamento_posa` sia per Scheda Installazione sia Lavorazione, sia
    interna sia esterna. Migrazione `0064` (da eseguire manualmente): aggiorna il vincolo e le righe
    già salvate con "Non riscosso".
  - **Foto struttura esterna / apparati interni**: ora accettano più di uno scatto (prima una sola),
    ognuna rimovibile prima di inviare.
  La Scheda Lavorazione non è stata ancora revisionata (nessuna decisione ricevuta) — resta com'era.
  Verificato: 2 righe in `schede_lavoro` prima della migrazione (1 con "Non riscosso" da migrare);
  build/lint puliti. **Migrazione `0064` eseguita e verificata** (fix separato per l'ordine
  UPDATE/ALTER CONSTRAINT — vedi sotto).
✅ Nuova identità visiva "Segnale" per le Schede di Lavoro (2026-08-26, richiesta esplicita: "rendi
  tutto molto più esteticamente bello con colori, icone e grafica catchy" — Opzione "1 · Segnale"
  scelta tra 3 proposte con artifact, contro "2 · Cantiere" e "3 · Wifi Playful").
  - **Font propri**: nuovo `src/app/pose/layout.tsx` carica Sora (titoli) e Manrope (corpo) via
    `next/font/google`, Space Mono per badge/etichette — deliberatamente diversi da Geist
    (gestionale interno, layout radice), scoperti solo dentro `/pose`.
  - **Colore per categoria**: nuovo `lib/pose-categorie.ts` — ogni domanda ha una `categoria`
    (struttura/radio/materiali/pagamento/note/foto/firma/posizione) con un colore fisso, mai
    ciclato (stesso principio di `COLORE_REPARTO`). `DomandaWizard` mostra un badge colorato
    ("RADIO · 6/17") e un'icona su sfondo sfumato per ogni domanda, invece del solo rosso di
    marchio — un tecnico riconosce la sezione a colpo d'occhio, non solo leggendo il testo.
  - `TileScelta`/`TileMultiScelta`/`CampoGrande`/`AreaGrande` (`components/pose/tile-scelta.tsx`)
    passano dall'accento rosso del gestionale a un blu dedicato (#2D6CFF) — pose ha ora una sua
    identità cromatica separata, il gestionale interno resta invariato (nessuno di questi
    componenti è condiviso con lui).
  - Un'icona propria per ognuna delle 17+6 domande (Building2/MapPin/Radio/Router/Cpu/Gauge/
    Package/Euro/NotebookText/FileSignature/Wrench/ClipboardCheck, tutte lucide-react).
  Verificato: build/lint puliti.
✅ Calendario squadra su pose + testo generato dai rapporti (2026-08-26, richiesta esplicita:
  "vorrei poter consultare il calendario generale e che i rapporti generassero un testo completo").
  - **Calendario squadra** (`/pose/calendario`, sola lettura): tutti gli appuntamenti dei prossimi
    14 giorni, di TUTTA la squadra (staff interno + tecnici esterni, non solo i propri — scelta
    esplicita dell'utente dopo aver segnalato il rischio di esporre il carico di lavoro/i clienti
    degli altri). Raggruppati per giorno, badge colorato per tipo di servizio, "Tu" in evidenza sui
    propri. `getCalendarioSquadra()` in `app/pose/actions.ts` risolve i nomi (persone/tecnici_esterni)
    con due query in blocco, non una per riga.
  - **Testo generato dai rapporti**: nuovo `lib/testo-rapporto.ts` — `generaTestoRapportino()`/
    `generaTestoScheda()`, funzioni pure che compongono un paragrafo leggibile dai campi già
    salvati (mai un salvataggio a parte: ricalcolato da chi legge, sempre allineato ai dati veri).
    Usato in due punti, entrambi confermati dall'utente: **RapportinoVista/SchedaVista** (gestionale
    interno) mostrano ora un riquadro "Riepilogo" oltre ai campi singoli; **l'email di chiusura al
    cliente** (`emailChiusuraTicket()`, nuovo parametro `riepilogo` facoltativo) include lo stesso
    paragrafo invece del solo "è stato completato" — aggiornati tutti e 4 i punti che completano un
    intervento (Rapportino e Scheda, sia staff interno sia pose).
  Verificato: 4 appuntamenti reali nei prossimi 14 giorni (1 assegnato a staff interno, 2 non
  assegnati, gestiti correttamente); testo generato da schede reali, leggibile e coerente; build/lint
  puliti.
✅ Controllo d'oro su pose.donewifi.it (2026-08-26, richiesta esplicita: "fai un controllo d'oro
  e correggi incongruenze e errori. deve essere funzionante al 100%") — seguito da un audit completo
  a sola lettura della sessione precedente (21 file, 4 migrazioni, dati reali: 0 violazioni di
  integrità, sicurezza confermata). Corretti i 2 punti trovati:
  - **Schermata "Scheda salvata"** (`components/pose/scheda-dettaglio.tsx`) usava ancora i token
    rossi `text-success`/`text-primary` del gestionale interno, incoerenti con l'identità "Segnale"
    (blu/verde, Sora) adottata dal resto del flusso Scheda. Restyled con lo stesso linguaggio visivo
    (icona su sfondo sfumato blu→verde, testo verde `#0F7A4D`, link blu `#2D6CFF`). Lasciata
    volutamente invariata la schermata equivalente del Rapportino (`intervento-dettaglio.tsx`): quel
    flusso (`rapportino-form.tsx`) non è mai stato reskin-nato, quindi il rosso lì è coerente col resto
    della sua stessa schermata, non un'incongruenza.
  - **Codice morto**: `salvaSchedaLavoroEsterno()` (`app/pose/actions.ts`) salvava ancora una firma
    del tecnico (`dati.firmaTecnicoDataUrl` → upload → `firma_tecnico_url`) che il flusso "una domanda
    alla volta" di pose non raccoglie più da quando è stata rimossa nella revisione domande — il
    campo è sempre `undefined` in questo percorso, quindi il salvataggio non scriveva mai nulla.
    Rimosso, `firma_tecnico_url` ora scritto esplicitamente `null` per le schede create da pose.
  Verificato sui dati reali: 0 schede create da tecnici esterni con `firma_tecnico_url` valorizzato
  (nessuna regressione, il campo non veniva comunque mai popolato); RPC `verifica_login_tecnico_esterno`
  ok; 0 ticket/appuntamenti con doppia assegnazione (interno+esterno); build e lint puliti (solo i
  warning `<img>` preesistenti, non toccati da questo giro).
✅ Testo dei rapporti riscritto come prosa vera, non più elenco etichettato (2026-08-27, richiesta
  esplicita: "vorrei che il rapporto fosse un testo scritto e non un semplice elenco di dati ma un
  testo completo") — `lib/testo-rapporto.ts` componeva frasi come "Cablaggio: X. Apparati: Y.
  Collaudo: Z.": un elenco di campi etichettati travestito da paragrafo, non prosa vera. Riscritto
  ogni gruppo di campi come una frase con soggetto e verbo ("È stata montata...", "Il collegamento è
  stato realizzato con...", "In fase di collaudo sono stati rilevati...", "Sono stati installati e
  configurati..."), concatenate senza etichette. Aggiunto un piccolo formattatore di elenchi
  all'italiana ("a, b e c", mai virgola prima dell'ultimo) e una mappatura dei metodi di pagamento
  ("In Fattura" → "in fattura", ecc.) invece del valore grezzo del database. Stessa firma delle
  funzioni (`generaTestoRapportino`/`generaTestoScheda`), nessun punto di chiamata toccato.
  Esempio reale (installazione del 26/08/2026): *"Installazione certificata con successo. È stata
  montata una zanca da camino, in posizione camino sud. Il collegamento è stato realizzato con 12
  metri di cavo Cat6 FTP Outdoor, agganciato alla BTS di Issogne. Sono stati installati e configurati
  un CPE Albentia 350-Rs (MAC 00:1f:4a:01:11:22) e un router TP-Link EX230V. In fase di collaudo sono
  stati rilevati un RSSI di -65 dBm, un rapporto segnale/rumore di 24 dB, un ping di 45 ms, 85 Mbps in
  download e 10 Mbps in upload. Sono stati impiegati i seguenti materiali: Privati, Albentia 100Mb,
  Griglia piccola, Alimentatore, Staffa camino, Tp-link EX520v. Il pagamento della posa è previsto in
  fattura."*
  Verificato: rigenerato il testo per le 2 schede reali in produzione e per un rapportino/lavorazione
  sintetici (nessuno ancora chiuso con questo sistema) — build/lint puliti.
🔜 Ponte verso il gestionale esterno delle antenne (2026-08-27, richiesta esplicita: "il rapporto di
  lavoro deve andare, una volta completato, sul gestionale principale nella scheda del cliente in
  modo che poi venga inserito dall'operatore nel gestionale esterno delle antenne") — quel sistema è
  separato e non integrato: qui si automatizza tutto ciò che si può automatizzare intorno alla
  trascrizione manuale, scelto tra 3 proposte presentate all'utente (coda dedicata / solo scheda
  cliente / avviso automatico + coda di riserva — scelta quest'ultima).
  - **Avviso automatico**: alla chiusura di una Scheda che riguarda un'antenna — sempre per una
    Nuova installazione, solo se il MAC è compilato per una Lavorazione tecnica (scelta esplicita,
    per non generare avvisi inutili sui semplici riavvii/configurazioni) — parte un messaggio nella
    Chat interna del reparto Analisi Rete con tutti i dati già pronti da copiare (cliente, Ticket,
    MAC, BTS, apparato, coordinate GPS). `schedaRiguardaGestionaleAntenne()`/`notificaGestionaleAntenne()`
    in nuovo `lib/notifiche-antenne.ts`, richiamate sia dal flusso interno (`calendario/actions.ts`)
    sia da pose (`app/pose/actions.ts`) — stessa logica, mai uno dei due percorsi scoperto.
  - **Coda di riserva** ("Da trasferire", nuovo tab in Materiali, badge col conteggio): elenca tutte
    le schede rilevanti non ancora segnate come trascritte, con un pulsante "Copia dati" (stesso
    testo dell'avviso in Chat, pronto per il modulo dell'altro sistema) e "Segna come inserita" —
    una volta spuntata sparisce dalla coda, niente rischio di trascriverla due volte o di perderla se
    l'avviso in Chat viene ignorato. Nuova colonna `schede_lavoro.inserita_gestionale_antenne_il`
    (+ `_da`, chi l'ha segnata) — migrazione `0065_gestionale_antenne_esterno.sql`, **da eseguire
    manualmente in Supabase SQL Editor**.
  Verificato: build/lint puliti; gruppo Chat "Analisi Rete" e persona "Sistema" (mittente automatico)
  già esistenti e funzionanti in produzione.
  ★ FIX (trovato in verifica dopo la migrazione) — `getSchedeDaTrasferireAntenne()` filtrava via le
  schede senza `ticket_id` (un appuntamento creato dal Calendario senza passare da un Ticket, caso
  raro ma reale: una delle 2 schede in produzione è proprio così): l'esatto opposto dello scopo della
  coda ("niente si perde") — restavano rilevanti per l'avviso in Chat ma sparivano dalla coda di
  riserva. Corretto: per quei casi si usa il titolo dell'appuntamento al posto del nome cliente del
  Ticket. Verificato sui dati reali: 2/2 schede rilevanti ora presenti in coda con il nome corretto
  ("Leonardo Pavetto" via Ticket, "Assistenza — Pianificazione installazione · Antonietta Favre" via
  titolo appuntamento per quella senza Ticket); segna-come-inserita testato e ripristinato su una
  scheda reale, senza lasciare tracce false; build/lint puliti.
✅ Comunicazioni interne più visibili e dirette (2026-08-27, richiesta esplicita: "rivediamo il
  mondo delle comunicazioni interne tra reparti e utenti. deve essere più diretto e facile da
  consultare. inoltre deve essere più visibile in homepage") — 2 domande poste all'utente
  (posizione in home + cosa serve per "più diretto"), scelto: in cima sopra tutto, distinguere i
  messaggi automatici, aggiungere la ricerca.
  - **In cima alla home**: il riquadro Chat (`(app)/page.tsx`) è ora la prima cosa sotto il titolo
    "Mondo Ticket", a tutta larghezza — prima era sotto Novità clienti/KPI reparto/promemoria,
    affiancato al To-Do (bisognava scorrere per accorgersene). Il To-Do resta dov'era, ora da solo.
  - **Messaggi automatici distinti**: i messaggi da "Sistema" (contratti inviati, dati cliente
    ricevuti, l'avviso antenne appena aggiunto, ecc.) ora appaiono come un cartellino centrato con
    un'icona campanella invece di una bolla di conversazione a sinistra/destra — si riconoscono a
    colpo d'occhio come "fatto avvenuto" invece di "qualcuno aspetta una risposta". **Bug reale
    trovato in verifica**: prima "Sistema" compariva come mittente di un messaggio di gruppo solo se
    aveva ANCHE una conversazione diretta con chi guardava (per via del filtro `attivo` in
    `getContattiChat()`) — altrimenti `nomeMittente()` non lo trovava e mostrava "—". Verificato sui
    dati reali: 10 messaggi di Sistema già in produzione (contratti, dati ricevuti, lavorazioni
    assegnate) che oggi mostravano "—" come mittente in almeno alcuni gruppi, ora sempre riconosciuti
    correttamente tramite il nuovo `sistemaId` (risolto una volta sola in `getContattiChat()`,
    indipendentemente da eventuali conversazioni dirette).
  - **Ricerca messaggi**: nuova casella sopra l'elenco conversazioni (prima non esisteva alcun modo
    di ritrovare un vecchio messaggio) — filtra subito per nome persona/reparto (locale, istantaneo)
    e, da 2 caratteri, cerca anche nel testo dei messaggi passati (`cercaMessaggiChat()`, nuovo
    in `chat/actions.ts`, RLS-bound come `getMessaggi()`, non service role). Ogni risultato apre
    direttamente il thread. Verificato sui dati reali: query e risoluzione titolo/mittente corrette
    su 14 messaggi reali trovati per "lavorazione".
  Verificato: build/lint puliti.
✅ Comunicazioni — layout "B" (rail fissa) al posto del riquadro in home (2026-08-27, "fammi degli
  artifact di diverse layout per proporre le soluzioni" → artifact "Layout Comunicazioni" con 3
  opzioni (A pieno in cima / B barra+rail fissa / C pagina dedicata) → "facciamo la b") — sostituisce
  il riquadro Chat intero in cima alla home (appena introdotto) con:
  - **Rail fissa** (`app-shell.tsx`, nuovo `<aside>` a destra, solo da `xl:` in su — ~1280px):
    la Chat (ricerca, distinzione messaggi automatici, tutto già implementato) resta sempre in vista
    su OGNI pagina del gestionale, non solo in home — nuova `ChatPanel` `variant="rail"` (alta quanto
    il genitore invece di un'altezza fissa in pixel). Contenuto principale spostato con `xl:mr-[300px]`.
  - **Striscia "Comunicazioni" in home** (nuovo `components/chat/comunicazioni-ticker.tsx`, `xl:hidden`
    — ridondante dove la rail è già in vista): le ultime 6 anteprime (gruppi+persone) in una riga
    scorrevole, un tocco apre lo stesso pop-up di sempre. Il pulsante "Chat" in sidebar è a sua volta
    nascosto da `xl:` in su (stesso motivo, due modi di aprire la stessa chat sarebbero confusi).
  - Nuovo `components/chat/chat-ui-context.tsx` (`ChatUiProvider`/`useChatUi`) — espone
    `apriPopup()` a chiunque nell'albero (prima solo la sidebar poteva aprire il pop-up), usato dalla
    striscia in home.
  Verificato: build/lint puliti.
✅ Documenti clienti scaricabili con un pulsante + indirizzo copiabile (2026-08-27, richiesta esplicita:
  "quando i clienti mi mandano la documentazione dovrei avere la possibilità di scaricare le foto e
  non doverle aprire sul browser e fare salva immagine, ma avere il pulsante per scaricare. inoltre
  indirizzo non è copiabile ma solo cliccabile").
  - **Pulsante Scarica**: nuovo `components/condivisi/pulsante-documento.tsx` — accanto al pulsante
    "Apri" di sempre (apre in una scheda, per dare un'occhiata), un pulsante dedicato scarica il file
    subito (fetch del link firmato → blob → `<a download>` sintetico) invece di lasciare che
    l'operatore apra la foto e faccia "salva immagine con nome" a mano. Un `<a download>` puntato
    direttamente all'URL firmato non avrebbe funzionato (cross-origin, il browser lo ignora e apre e
    basta) — da qui il passaggio dal blob. Sostituiti i 3 punti quasi identici che aprivano solo in
    una scheda: `richieste-clienti-board.tsx`, `segnalazioni-board.tsx` (tab Documenti), `tickets-board.tsx`
    ("Moduli ricevuti dal cliente") — stesso componente condiviso, ognuno con la propria funzione
    server già in uso per l'URL firmato (`urlDocumentoRichiesta`/`urlContratto`, nessuna nuova action).
  - **Indirizzo copiabile**: in `segnalazioni-board.tsx`, sia il campo "Indirizzo" della Segnalazione
    sia "Indirizzo di installazione" nella revisione Richiesta Dati erano SOLO un link a Google Maps —
    a differenza di ogni altro campo di quello stesso pannello (tutti copiabili con un click, vedi
    `RigaDatoCliente`). "Apri in mappa" resta disponibile come link a parte, il testo dell'indirizzo è
    ora anche un pulsante di copia (stesso trattamento visivo verde-quando-copiato degli altri campi
    per quello nella revisione Richiesta Dati).
  Verificato sui dati reali: 2 richieste con documenti reali (foto fronte/retro documento e tessera
  sanitaria, .jpg), signed URL generata e scaricata con successo (200, `image/jpeg`, contenuto reale
  non vuoto) — la stessa strada che percorrerà il pulsante in browser; build/lint puliti.
✅ Notifiche su 3 canali ovunque (2026-08-27, "fai la a" — Proposta A dell'artifact "Estensione
  Notifiche": tutti e 12 gli eventi già notificanti ricevono Telegram + Chat interna + Email verso
  attivazioni@donewifi.it, senza eccezioni) — nuovo `lib/notifiche-interne.ts` (`notificaSuTuttiICanali()`),
  un'unica funzione condivisa al posto delle 3 chiamate scritte a mano ogni volta. I 2 punti già "gold
  standard" (Richiesta Dati, Richiesta Cliente) restano invariati — già corretti.
  - **6 "buchi" trovati nell'audit, dove agisce il cliente da solo** — 3 con ZERO avviso finora, solo
    una riga di Storico: Preventivo approvato/rifiutato (`/api/approva/[token]`), Scheda/Rapportino
    confermati dal cliente (idem, 2 rami), Subentro — vecchio cliente conferma/rifiuta (idem),
    Intervento risolto da remoto confermato (idem); più 2 con copertura parziale: Ticket aperto dal
    Portale (era solo Telegram) e Contratto approvato → Ticket creato in automatico
    (`segnalazioni/actions.ts`, era solo Chat).
  - **3 eventi generati da un operatore**, copertura estesa da 1 a 3 canali: Nuova Segnalazione
    creata, Contratto inviato per approvazione, Preventivo inviato al cliente.
  - **3 eventi operativi interni**, stessa estensione: Scorta magazzino sotto soglia, Conflitto
    prenotazione antenna, Dati pronti per il gestionale esterno antenne (`lib/notifiche-antenne.ts`,
    appena introdotto).
  Verificato sui dati reali: le query aggiunte per comporre i messaggi (preventivi.numero/cliente_nome/
  totale, schede_lavoro→tickets.reparto, richieste_clienti.cliente, tickets.reparto) restituiscono
  dati coerenti; build/lint puliti. Non testato l'invio reale sui 3 canali per non generare avvisi
  falsi verso i gruppi Telegram/Chat/email reali dello staff — il codice ricalca esattamente l'idiom
  già in produzione di Richiesta Dati/Richiesta Cliente.
✅ Badge "che pulsa" esteso ad altri 4 eventi-cliente (2026-08-27, richiesta esplicita: "vorrei
  rivedere il sistema di notificazione come pulsa la notifica di documenti ricevuti" →
  "estenderlo agli altri 6 eventi-cliente") — prima il badge blu che pulsa (Tailwind `animate-pulse`
  + puntino "ping" stile WhatsApp/iOS) esisteva solo per "Dati ricevuti" in Segnalazioni, scritto a
  mano lì. Estratto in `components/condivisi/segnale-pulsante.tsx` (`SegnalePulsante`, `entroOreDa`)
  e riapplicato identico dove il dato è già disponibile senza nuove query:
  - **Ticket board**: "🆕 Nuovo — non ancora preso in carico" (Ticket dal Portale o creato in
    automatico dall'approvazione di un contratto, senza tecnico assegnato, entro 2h dalla creazione)
    e "✓ Cliente ha confermato l'intervento" (`tickets.confermato_cliente_il`, entro 48h — **scritto
    da tempo ma non ancora letto da nessuna parte dell'interfaccia finché non aggiunto qui**, né
    presente nel tipo `Ticket` — aggiunto).
  - **Preventivi**: badge che pulsa al posto del solito badge di stato quando Approvato/Rifiutato è
    fresco (entro 48h).
  - **Richieste Clienti**: badge che pulsa per il Subentro quando il vecchio cliente ha appena
    confermato/rifiutato la cessione (entro 48h).
  Il "si ferma da solo" di Dati ricevuti (agganciato a un avanzamento di stato) qui non si applica
  sempre (Approvato/Rifiutato non ha un passaggio successivo): usata una finestra di tempo (48h) al
  suo posto — l'informazione non sparisce, smette solo di pulsare.
  **Non esteso agli altri 2 eventi-cliente** (Scheda/Rapportino confermati dal cliente): richiedono
  un join che le liste Ticket non fanno oggi (`schede_lavoro`/`rapportini_intervento` per ticket) —
  rimandato a un giro dedicato per non allargare la query di tutta la bacheca Ticket senza che
  l'utente lo abbia chiesto esplicitamente.
  Verificato sui dati reali: nessun evento vivo abbastanza recente da pulsare in questo momento
  (l'ultimo Ticket, #52, è fuori dalla finestra di 2h di ~50 minuti — conteggio confermato
  manualmente); build/lint puliti.
✅ Giro di test pre-lancio, come farebbe un tester (2026-08-27, richiesta esplicita: "rifacciamo un
  controllo come farebbero i tester... trovassi eventuali bug e me li indicassi" → "risolvi tutto") —
  build/lint, integrità dati reali (12 controlli), RLS testata con la sola chiave anonima su 20
  tabelle sensibili (0 righe leggibili senza login), smoke test dal vivo sulle pagine/rotte pubbliche.
  3 bug reali trovati e corretti, più 2 osservazioni minori:
  - **500 su corpo malformato in 6 rotte pubbliche** (`api/portale/apri-ticket`, `/trova-cliente`,
    `/verifica-stato`, `api/richiesta-cliente`, `api/richiesta-dati`, `/upload-url`) — nessuna
    proteggeva `request.json()`/`.formData()` con un `try/catch`: un corpo non valido (bot, richiesta
    rilanciata con l'header sbagliato) faceva crashare con 500 invece di un errore pulito. Verificato
    dal vivo prima (500 riproducibile con `curl -d 'not json'`) e dopo (`.catch(() => ({}))`, ricade
    nella validazione già esistente → 400 pulito).
  - **Notifiche Telegram che sparivano in silenzio** — nessun punto del codice fa l'escape di
    `<`/`>`/`&` prima di inserire un nome/comune/problema scritto da un cliente in un messaggio con
    `parse_mode: "HTML"`: Telegram rifiuta l'INTERO messaggio se contiene HTML non valido (es. un
    cliente che scrive "Costo & IVA" nel proprio nome) — persa senza che nessuno se ne accorgesse
    (Chat/Email, senza questo vincolo, arrivavano comunque, mascherando il problema). Fix centralizzato
    in `lib/telegram.ts` (un solo file, non nei ~15 punti che compongono un messaggio): se Telegram
    rifiuta per un errore di parsing delle entità, si riprova una volta in testo semplice (niente più
    grassetto per quel messaggio, ma la notifica arriva) invece di scegliere di far l'escape a mano in
    ogni punto — troppo facile dimenticarne uno in futuro.
  - **Cookie di sessione senza `secure`** (`persona.ts`, `tecnico-esterno.ts`) — aggiunto
    `secure: process.env.NODE_ENV === "production"` (`false` in sviluppo locale, dove servirebbe
    altrimenti scarterebbe il cookie su http://localhost).
  - *(minori)* **Honeypot anti-spam incoerente**: solo il Portale pubblico ce l'aveva — stesso campo
    invisibile (`sito_web`) aggiunto anche a Richiesta Dati e alle 4 varianti del modulo Richiesta
    Cliente. **56 `codice_gestionale` duplicati in `clienti_esterni`**: NON un bug, comportamento
    documentato (ogni rinnovo Aruba crea una riga nuova) — verificato a fondo prima di escludere.
  Verificato: build/lint puliti; **live su gestione.donewifi.it dopo il deploy** — tutte e 6 le rotte
  ripetute con `curl -d 'not json'`, ora 400 pulito invece di 500 (nessuna crasha più); honeypot
  testato dal vivo su apri-ticket (finto successo 200, nessun Ticket vero creato).
✅ Testo dei rapporti meno robotico (2026-08-27, richiesta esplicita: "rivediamo il testo delle
  schede di lavoro. va bene ma è troppo robotico") — il giro precedente aveva tolto l'elenco
  etichettato ma introdotto un problema diverso: ogni frase iniziava con lo stesso stampo passivo
  ("È stata montata...", "Sono stati installati...", "In fase di collaudo sono stati rilevati...",
  "Sono stati impiegati...") — grammaticalmente prosa, ma nella forma un modulo compilato. Ora i
  gruppi di campi imparentati si fondono in un'unica frase con connettivi naturali invece di restare
  frasi separate con lo stesso soggetto sottinteso: struttura+cablaggio ("montata su... e cablata
  con..."), apparati+collaudo ("Come apparati... mentre il collaudo ha dato..."), materiali+pagamento
  ("Tra i materiali... figurano...; la posa verrà pagata...").
  Esempio reale (stessa installazione già mostrata prima): *"Installazione certificata con successo.
  Antenna montata su zanca da camino (camino sud) e cablata con 12 metri di cavo Cat6 FTP Outdoor fino
  alla BTS di Issogne. Come apparati sono stati usati un CPE Albentia 350-Rs (MAC ...) e un router
  TP-Link EX230V, mentre il collaudo ha dato un RSSI di -65 dBm, un rapporto segnale/rumore di 24 dB,
  un ping di 45 ms, 85 Mbps in download e 10 Mbps in upload. Tra i materiali impiegati figurano
  Privati, Albentia 100Mb, Griglia piccola, Alimentatore, Staffa camino, Tp-link EX520v; la posa verrà
  pagata in fattura."*
  Verificato: rigenerato su entrambe le schede di installazione reali in produzione; build/lint
  puliti.
✅ Materiali del testo generato: escluse le attivazioni (2026-08-27, richiesta esplicita: "tra i
  materiali da riportare non mettere le attivazioni ma solo gli apparati venduti e in comodato d'uso
  gratuito") — `elencoMateriali()` in `lib/testo-rapporto.ts` ora esclude le righe `tipo_riga:
  "Servizio"` (es. "Privati"/"Business", il canone di attivazione aggiunto in automatico alla scelta
  del piano): non è un apparato rimasto al cliente, elencarlo insieme a router/staffe/cavi confondeva
  "cosa è installato" con "cosa è stato addebitato". Restano Prodotto e Comodato — stessa deduzione
  già in uso in SchedaVista per le schede salvate prima del campo `tipo_riga` (limite noto: su quelle
  vecchie un'attivazione non più distinguibile da un apparato vero resta inclusa).
  Verificato sui dati reali: scheda con `tipo_riga` — "Privati" (Servizio) sparisce dall'elenco,
  restano i 5 apparati veri; build/lint puliti.
✅ Sistema Ticket, prime 2 semplificazioni (2026-08-27, richiesta esplicita: "rivediamo il sistema dei
  ticket... semplificarlo" → artifact "Revisione Sistema Ticket", checklist a 7 sezioni compilata
  dall'utente) — 2 delle scelte "Semplifica" implementate, le altre lette e tenute com'erano.
  - **Creazione Ticket — un'unica scelta "Operazione"** invece di Categoria (3 valori astratti) e
    "Dettaglio" (le 14 sottocategorie vere) come due passaggi separati: ora un solo menu, raggruppato
    per categoria, con le 14 operazioni reali più un "Altro (categoria)" per il caso senza dettaglio
    specifico. Categoria e Reparto si propongono da soli in base alla scelta (nuova
    `REPARTO_PER_CATEGORIA_TICKET` in `lib/types.ts` — la stessa mappa già in uso nel Portale
    pubblico, unificata in un solo posto invece di due copie), restano comunque modificabili sotto.
  - **Assegnazione Ticket — un unico selettore** invece di "Prendi in carico" (solo te stesso) +
    un menu separato solo per tecnici esterni: ora un solo menu "Assegna a..." con te stesso in
    cima, poi lo staff, poi i tecnici esterni — **capacità nuova nata dalla stessa semplificazione**:
    prima non esisteva alcun modo di assegnare un Ticket a un collega, solo a se stessi o a un
    esterno (`assegnaTicket()` già lo permetteva lato server, mai esposto lato interfaccia). Un solo
    "Rimuovi" per entrambi i tipi invece di due bottoni duplicati.
  Verificato: build/lint puliti.
✅ Rapportino Ticket — chiusura senza conferma obbligatoria del cliente (2026-08-27, richiesta
  esplicita chiarita via domanda mirata: "deve solo inviare il rapportino al cliente" — solo il
  Rapportino generico, non la Scheda di Installazione/Lavorazione) — prima, per chiudere un Ticket
  col Rapportino, era obbligatorio far confermare il cliente (codice OTP letto al telefono, o link
  email poi verificato): senza quella, il tecnico non poteva salvare. Tolto il requisito in
  `completaTicketConRapportino()` (staff interno) e `completaTicketConRapportinoEsterno()` (pose,
  tecnici esterni) — rimossa anche la sezione "Firma cliente" (`FirmaClienteScheda`) dai due form
  (`rapportino.tsx`, `pose/rapportino-form.tsx`), sostituita da una riga informativa ("Il cliente
  riceverà via email il riepilogo — non serve una sua conferma"). L'email di chiusura
  (`emailChiusuraTicket`, invariata) parte comunque, automatica: il cliente è comunque informato,
  solo non più bloccante. La Scheda di Installazione/Lavorazione (pose e interna) mantiene la
  richiesta di conferma cliente come prima — non toccata, per scelta esplicita dell'utente.
  Verificato: build/lint puliti (rimossi anche gli import/tipi `FirmaClienteApprovata` diventati
  inutilizzati nei 2 file di action).
✅ Audit completo + 2 correzioni (2026-08-27, richiesta esplicita: "fai un audit completo come
  farebbero dei betatester... il software deve essere perfetto" → "fai tutto quello che puoi" →
  "devi fare le correzioni") — audit su permessi (ogni funzione "elimina"/"crea" sensibile), RLS
  (query dirette con la sola chiave anonima su 20 tabelle), robustezza corpo malformato, escaping
  Telegram, responsive/mobile via codice. Trovati e corretti 2 problemi reali:
  - **`getTecniciEsterni()` esponeva l'hash bcrypt della password** di ogni tecnico esterno al
    browser dell'amministratore — `select("*")` includeva `password_hash`, mai mostrato
    nell'interfaccia ma comunque presente nel payload React Server→Client (leggibile da
    DevTools/Network). La pagina è già riservata all'admin lato server, quindi il rischio pratico era
    limitato, ma l'esposizione era superflua e contro il principio già in uso per `persone` (mai un
    `select("*")` con colonne password verso il client). Ora seleziona solo le 8 colonne sicure.
  - **`eliminaMateriale()` era l'unica funzione "elimina" di tutto il gestionale aperta a qualunque
    staff attivo**, non solo agli amministratori (Segnalazione/Ticket/Preventivo/Tariffa/Lavorazione/
    Richiesta Cliente/Antenna richiedono tutte un admin) — confermato non intenzionale controllando
    anche la policy RLS. Ora richiede un amministratore, riusando lo stesso helper già usato per
    `eliminaAntennaInventario()` nello stesso file (con un messaggio d'errore proprio, non più quello
    di "correggere la giacenza"). Il pulsante "Elimina" nel form Materiali ora compare solo per un
    amministratore, invece di restare visibile a chi riceverebbe solo un errore al click — aggiunto
    anche un `title`/`aria-label` che mancava.
  Verificato sui dati reali: la nuova query di `getTecniciEsterni()` non restituisce più
  `password_hash`; 2 persone attive non amministratrici in produzione confermate ora bloccate
  dall'eliminare un materiale; build/lint puliti.
✅ Badge a 3 colori per lo stato del contratto (2026-08-28, richiesta esplicita — artifact "Stato
  Contratto Cliente" con 3 proposte → "farei la c con tre colori diversi: blu quando documenti
  arrivati, arancione quando in attesa di approvazione dal cliente, verde quando approvato") —
  "Contratto inviato per approvazione" e "Contratto approvato dal cliente" erano già tracciati nei
  dati ma invisibili sulla card: ora un badge sempre presente, senza aggiungere colonne né una
  migrazione (Opzione C, la più leggera delle 3 proposte).
  - 🔵 **Blu** (`tono="info"`, pulsante) — dati ricevuti, pronta per il contratto (badge già esistente,
    solo ricolorato/riorganizzato in questa priorità).
  - 🟠 **Arancione** (`tono="avviso"`) — nuovo: contratto inviato, in attesa di approvazione dal
    cliente, con i giorni di attesa.
  - 🟢 **Verde** (`tono="successo"`) — nuovo: contratto approvato dal cliente, pronta per Trasmetti.
  Il tipo del segnale (`segnalazioni-board.tsx`) ora porta un `tono` esplicito invece di dedurre il
  colore dal prefisso del testo (`testo.startsWith("✓")`) — più robusto, meno fragile ad aggiungere
  nuovi segnali in futuro.
  **Bug reale trovato e risolto in verifica**: la Segnalazione #24 (Paolo Ghirotti) ha sia
  `dati_ricevuti_at` (24/08) sia `contratto_inviato_approvazione_il` (27/08, più recente) — prima
  del fix mostrava ancora il vecchio badge blu "pronta per il contratto" nonostante il contratto
  fosse già stato inviato il giorno prima: un'informazione superata mostrata come attuale. Ora mostra
  correttamente 🟠 "Contratto inviato — in attesa da 1g".
  Verificato sui dati reali: tutte e 3 le pratiche in "Gestione Cliente" ricontrollate una per una;
  build/lint puliti.
✅ Appuntamenti scaduti che sparivano del tutto (2026-08-28, richiesta esplicita: "in pose.donewifi.it
  bisogna avere anche una sezione in cui ci sono le installazioni da fare rapporto di lavoro quando
  non completate") — `getInterventiTecnicoEsterno()` filtrava gli appuntamenti con
  `.gte("data_ora", oggi)`, pensato per "l'agenda di oggi in poi": un appuntamento "Programmato" con
  data ormai passata (intervento saltato, rimandato, o solo non chiuso quel giorno) spariva del tutto
  dall'app, senza alcun ticket collegato su cui il tecnico potesse appoggiarsi per accorgersene.
  Tolto il limite inferiore in `app/pose/actions.ts`: ora arrivano tutti gli appuntamenti
  "Programmato", passati e futuri; `app/pose/page.tsx` li divide in due sezioni — "In ritardo"
  (rosso, in cima) e "In programma" (invariato).
  **Bug gemello trovato ed esteso anche lato interno**: lo stesso filtro `.gte(oggi)` era presente
  identico in `app/(app)/vista-tecnico/page.tsx`. Verificato sui dati reali: 10 appuntamenti
  "Programmato" con data già passata in produzione (dal 5 al 26 agosto), 9 dei quali senza
  `tecnico_id` assegnato — quindi comunque invisibili a chiunque finché non assegnati, ma non più
  a rischio di sparire silenziosamente una volta assegnati. Sistemato con un limite superiore fisso
  a fine giornata odierna (`.lte("data_ora", fineOggi)`, niente limite inferiore) — a differenza di
  pose, Vista Tecnico resta deliberatamente un'agenda "solo oggi + arretrati", non un calendario
  futuro. `VistaTecnicoBoard` divide allo stesso modo in "In ritardo" (rosso, in cima) e
  "Appuntamenti di oggi".
  Osservazione a margine (non corretta, solo segnalata): tra i 10 risultati compare due volte lo
  stesso appuntamento ("Assistenza — Internet assente · Lorenzo Moja", 10/08) — verificato che sono
  due righe distinte a tutti gli effetti (id, google_event_id diversi, creato_il a 2 minuti di
  distanza): una probabile doppia registrazione dello stesso appuntamento, non un artefatto della
  query. Non corretta, solo segnalata: non richiesta esplicitamente.
  Build/lint puliti; verificato sui dati reali con uno script diretto su Supabase.
✅ Login su pose.donewifi.it anche con le credenziali di gestione.donewifi (2026-08-28, richiesta
  esplicita: "vorrei poter usare su pose.donewifi anche la possibilità di entrare con le credenziali
  di chi usa gestione.donewifi" → chiarito con l'utente: uso completo, non solo consultazione) —
  pose era finora un sistema separato al 100%: login fisso (username/password) per tecnico esterno,
  dati filtrati per `tecnico_esterno_id`, scritture (rapportino/scheda) su
  `creato_da_tecnico_esterno_id`. Ora un membro dello staff con un account attivo su
  gestione.donewifi.it può accedere a pose con la STESSA email/password (vera sessione Supabase
  Auth) e usarlo esattamente come un tecnico esterno: vede i propri ticket/appuntamenti (quelli
  assegnati con `tecnico_assegnato`/`tecnico_id`, non `tecnico_esterno_id`) e può compilare
  rapportini/Schede di Installazione/Lavorazione da lì.
  - Login: un solo campo — se contiene "@" prova il login staff (Supabase Auth + verifica che
    l'account sia collegato a una Persona attiva, esattamente come `selezionaPersonaDopoLogin()` sul
    login principale), altrimenti prova il login tecnico esterno esistente.
  - `lib/operatore.ts` (`Operatore`, già esistente per unificare la firma cliente sia da staff
    interno che da tecnico esterno) è ora il concetto centrale in `pose/actions.ts`: ogni funzione
    che prima leggeva solo `tecnico_esterno_id`/`getTecnicoEsternoCorrente()` sceglie ora la colonna
    giusta in base a `operatore.tipo` ("persona" vs "tecnico_esterno").
  - Un vantaggio in più per lo staff interno: `storico.operatore_id` (FK verso `persone`) viene ora
    valorizzato correttamente sulle chiusure fatte da pose — per un tecnico esterno resta null per
    forza (la FK non lo ammette), il nome va solo nel testo, come già prima.
  **Attenzione alla sicurezza risolta in fase di sviluppo, prima del deploy**: pose.donewifi.it non
  passa dal proxy che protegge il resto del gestionale (`src/proxy.ts` esce con un return anticipato
  per questo host, prima del controllo `supabase.auth.getUser()`). Usare qui il cookie `persona_id`
  da solo (valido fino a un anno, per design) sarebbe stato un problema reale: una sessione Supabase
  scaduta o un account disattivato sarebbero rimasti "dentro" pose finché il cookie non fosse scaduto
  per conto suo. Aggiunta una funzione dedicata (`getOperatorePose()`) che richiede sempre una
  sessione Supabase Auth viva prima di fidarsi del cookie persona — un tecnico esterno non è
  toccato da questo problema (non ha mai usato Supabase Auth).
  Verificato sui dati reali: 4 persone attive con un account collegato (`auth_user_id`) in
  produzione oggi, pronte a poter usare pose senza altro da configurare. Build/lint puliti.
✅ Sezione "Da assegnare" su pose.donewifi.it (2026-08-28, "mancano un po' di pose da fare" — dopo
  aver verificato coi dati reali che il primo utente della SSO qui sopra vedeva solo 1 appuntamento
  su pose e chiesto conferma: "voglio vedere anche i non assegnati") — trovati 12 appuntamenti
  "Programmato" reali senza NESSUN tecnico assegnato (né interno né esterno): invisibili ovunque,
  anche a chi era pronto a farli, perché ogni vista (pose, Vista Tecnico) filtra per un
  `tecnico_id`/`tecnico_esterno_id` preciso — nessuno risultava assegnato quindi nessuno li vedeva.
  Esempi reali: "Installazione Annalisa Martinod" (05/08), "Assistenza Enrico Marcoz" (18/08),
  "Pianificazione installazione Roberta Arlenghi" (25/08) e altri 9, fino a un'installazione
  pianificata per il 05/10.
  - `getInterventiTecnicoEsterno()` porta ora anche questi (`appuntamentiNonAssegnati`), con una
    terza query dedicata (`tecnico_id` e `tecnico_esterno_id` entrambi null).
  - pose/page.tsx: nuova sezione "Da assegnare — nessun tecnico ancora" (tratteggiata, tra "In
    programma" e "Interventi da chiudere"), con un bottone "Prendi in carico" per riga.
  - Nuova azione `prendiInCaricoAppuntamentoPose()`: assegna l'operatore collegato (interno o
    esterno, stessa colonna giusta già scelta da `colonnaAssegnazione()`) — ma solo con un
    `UPDATE ... WHERE tecnico_id IS NULL AND tecnico_esterno_id IS NULL` condizionale, non un
    controllo separato prima di scrivere: due persone potrebbero aprire pose nello stesso momento e
    cliccare sullo stesso appuntamento, deve vincere chi arriva prima, non chi clicca per ultimo
    sovrascrivendo il primo. Verificato con un vero tentativo concorrente sui dati reali (poi
    ripristinato): la prima richiesta assegna, la seconda sullo stesso appuntamento fallisce con un
    messaggio chiaro invece di sovrascrivere in silenzio.
  Build/lint puliti; verificato sui dati reali (12 appuntamenti trovati, race condition testata
  davvero e non solo letta nel codice).
✅ Fix layout "Da assegnare" (2026-08-28, screenshot: "migliorare, non si capisce nulla") — la
  griglia a 2 colonne, presa in prestito dalle altre sezioni della pagina, andava bene per una card
  solo cliccabile (titolo troncato + freccia), ma qui c'era anche il bottone "Prendi in carico"
  affiancato: su schermo stretto restava pochissimo spazio, titolo e indirizzo troncati a metà
  parola accanto a un bottone schiacciato — illeggibile, esattamente come segnalato.
  - Una colonna sola invece di due, bottone spostato sotto a tutta larghezza invece che di fianco,
    titolo e indirizzo senza più troncamento (`truncate` tolto): ogni card ora ha lo spazio per
    leggersi per intero.
  - Bottone anche ricolorato: era `bg-primary` (il rosso di brand — stesso rosso della sezione "In
    ritardo" appena sopra), leggeva come un secondo avviso critico per un'azione che invece è
    neutra. Ora blu (stesso accento già usato in pose per "Calendario squadra"/badge "Tu"), per
    distinguerlo visivamente da un allarme.
  Build/lint puliti.
✅ Amministratore: eliminazione appuntamenti dal Calendario (2026-08-28, richiesta esplicita: "dammi
  la possibilità come amministratore di eliminare i lavori" → chiarito con l'utente: gli appuntamenti
  sul Calendario) — finora l'unica opzione era "Annulla" (`cambiaStatoAppuntamento`), che lascia
  comunque la riga nel database. Utile ad esempio per il doppione reale trovato durante il giro
  precedente ("Lorenzo Moja", stesso appuntamento inserito due volte a pochi minuti di distanza) —
  "Annulla" non lo avrebbe tolto di mezzo, solo rietichettato.
  - Nuova `eliminaAppuntamento()` in `calendario/actions.ts`: solo un amministratore
    (`personaHaAccessoAdmin`), bloccata se esiste già una Scheda di Lavoro compilata per
    quell'appuntamento (`schede_lavoro.appuntamento_id` è `on delete cascade` — eliminare
    l'appuntamento cancellerebbe in silenzio anche il lavoro già registrato: materiali, foto,
    importo fatturato). In quel caso resta solo "Annulla". Registrata in `storico` con l'operatore
    e il titolo dell'appuntamento eliminato.
  - Nuovo pulsante "Elimina appuntamento" (solo visibile ad admin) nel popup "Modifica Appuntamento"
    — raggiungibile da qualunque vista del Calendario, non solo da Giorno — con una conferma
    esplicita (non un `confirm()` generico: nomina l'appuntamento e avverte che non si può
    annullare).
  - **Migrazione 0066 da applicare manualmente in Supabase SQL Editor** (stesso avviso già dato per
    la 0043): `storico_origine_check` non ammetteva ancora `'appuntamento'` tra i valori validi —
    senza applicarla, l'eliminazione funziona comunque (il vincolo riguarda solo la riga di
    `storico`, il cui errore non blocca la cancellazione), ma la registrazione in storico fallisce
    silenziosamente finché la migrazione non è applicata.
  Verificato sui dati reali (sola lettura): il doppione "Lorenzo Moja" non ha nessuna Scheda di
  Lavoro collegata (eliminabile), un appuntamento Completato di controllo idem — nessuna riga vera
  toccata durante la verifica. Build/lint puliti.
✅ Eliminazione appuntamenti anche da Vista Tecnico (2026-08-28, segnalato con uno screenshot di
  questa pagina: "devi mettere la possibilità di eliminare") — l'eliminazione appena aggiunta era
  raggiungibile solo dal popup "Modifica Appuntamento" del Calendario; un amministratore che
  controlla Vista Tecnico (come nello screenshot, sezione "In ritardo") doveva comunque passare da
  lì. Stessa identica azione (`eliminaAppuntamento`, stesso gate solo-admin lato server, stesso
  blocco se esiste già una Scheda di Lavoro collegata) ora raggiungibile anche qui: un'iconcina
  cestino (solo per admin) sull'intestazione di ogni card, sia in "In ritardo" che in "Appuntamenti
  di oggi", con la stessa conferma esplicita del Calendario. Build/lint puliti.
✅ Fix: l'eliminazione appuntamenti non cancellava davvero nulla (2026-08-28, bug reale segnalato
  dall'utente: "non si cancella", nessun errore mostrato ma la riga restava dopo il refresh) —
  causa: `appuntamenti` ha RLS attiva con policy solo per select/insert/update (migrazione 0004),
  MAI una policy `for delete`. `eliminaAppuntamento()` usava il client legato ai cookie (soggetto a
  RLS) anche per la scrittura: senza una policy di cancellazione, Postgres accetta la richiesta ma
  cancella ZERO righe, senza sollevare errore — il codice proseguiva come se fosse andato tutto bene
  (toast di successo, revalidatePath), la riga restava. Stesso principio già usato altrove per le
  scritture da amministratore (persone/tecnici_esterni/materiali): il controllo "sei admin?" resta
  sul client legato ai cookie, la scrittura vera ora passa dalla service role (bypassa RLS) invece
  di aggiungere una nuova policy. Aggiunto anche un controllo `count` esplicito sul delete, per non
  ripetere in futuro lo stesso errore silenzioso su un'altra tabella.
  Riprodotto e verificato il fix sui dati reali con una riga di test usa-e-getta (creata ed eliminata
  subito dopo, nessuna riga vera toccata): il delete con l'anon key cancella davvero 0 righe senza
  errore (bug riprodotto), il delete con service role cancella la riga per davvero (fix confermato).
  Build/lint puliti.
✅ Titoli leggibili in Vista Settimana/Mese del Calendario (2026-08-28, segnalato con uno screenshot
  della vista Settimana: "dai titoli non si capisce, trova una soluzione migliore") — `truncate`
  tagliava il titolo a una riga sola, spesso a metà parola proprio nella parte che distingue un
  appuntamento dall'altro (es. "Assistenza — Pianifi…").
  - Vista Settimana: ogni giorno ha già spazio verticale scorrevole — titolo di appuntamenti, note e
    eventi Google ora su due righe (`line-clamp-2`) invece di una, mostra quasi sempre il testo per
    intero.
  - Vista Mese (celle molto più piccole, dove due righe non ci stanno) e Vista Giorno: aggiunto un
    tooltip nativo (`title`) che mostra il testo completo al passaggio del mouse, per i casi ancora
    troncati.
  Build/lint puliti.
✅ Vista Agenda per la Settimana (2026-08-28, "dai titoli non si legge ancora, trova diverse
  soluzioni e proponimele" → artifact "Calendario Leggibile" con 3 proposte a confronto (A colonne
  larghe, B scheda al passaggio del mouse, C vista agenda) → "facciamo vista c") — la Vista Settimana
  a griglia (7 colonne) resta il default; un nuovo interruttore "Griglia"/"Agenda" accanto al
  selettore Giorno/Settimana/Mese la sostituisce, quando serve, con un elenco verticale un giorno
  sotto l'altro.
  - Nuovo `VistaSettimanaAgenda`: stesse identiche card di Vista Giorno (`RigaAppuntamento`,
    `RigaNota`, `RigaEventoGoogle` — riusate, non ricreate) invece dei chip compressi a 11px della
    griglia — titolo, indirizzo, telefono, tecnico sempre leggibili per intero, mai troncati.
    Nessuna azione persa: aprire/completare/annullare un appuntamento, spuntare/eliminare un
    promemoria funzionano identici a Vista Giorno.
    Solo i giorni con almeno un appuntamento/nota/evento compaiono nell'elenco.
  - Preferenza "Griglia"/"Agenda" tenuta solo lato client (non nell'URL): è una scelta del momento
    su come guardare la settimana, non uno stato della pagina da condividere via link.
  Build/lint puliti.
✅ Tolta la modalità Griglia dalla Settimana (2026-08-28, richiesta esplicita: "togli modalità
  griglia") — dopo aver provato l'Agenda, l'interruttore "Griglia"/"Agenda" appena aggiunto non
  serviva più: la vecchia griglia a 7 colonne (già corretta due volte senza risolvere davvero il
  problema — prima `truncate`, poi `line-clamp-2` + tooltip) è stata tolta invece di lasciarla come
  opzione mai usata. Vista Settimana ora è sempre l'Agenda, senza interruttore. `VistaSettimanaAgenda`
  rinominata in `VistaSettimana` (è di nuovo l'unica), `GIORNI_SETTIMANA` spostata più in alto perché
  ancora usata da Vista Mese. Build/lint puliti (nessun import rimasto inutilizzato dopo la
  rimozione).
✅ "Team" unificato: Persone + Utenti + Tecnici esterni in un solo posto (2026-08-28, richiesta
  esplicita: "riorganizziamo tutto... rendere univoci i posti dove aprire le diverse sezioni" →
  presentato un audit completo con artifact "Audit Ingressi": Ticket/Appuntamento/Scheda di
  Lavoro/Nuovi Clienti restano com'erano, doppioni voluti; l'unica vera incoerenza trovata era qui →
  confermato "sì, 3 tab in una sezione") — "Persone" e "Utenti" (accessi condivisi) erano già state
  unite in un giro precedente (tab dentro /persone); "Tecnici esterni" (account pose.donewifi.it,
  nato dopo, 2026-08-26) era rimasta l'ultima pagina di amministrazione-accessi separata.
  - `PersoneBoard` ha ora una terza tab "Tecnici esterni" (riusa `TecniciEsterniBoard` esistente,
    non ricreato).
  - `/utenti` e `/tecnici-esterni` non sono più pagine vere: **reindirizzano** a `/persone` — chi ha
    un link salvato o il segnalibro finisce comunque nel posto giusto, invece di vedere una pagina
    "vecchia" gemella di quella nuova. `revalidatePath` delle rispettive azioni ripuntato a
    `/persone`.
  - Sidebar: tolta la voce "Tecnici esterni" dal mondo Team (restava "Persone" e "Utenti" non era mai
    stata in menu) — un solo ingresso per tutta l'amministrazione-accessi.
  Verificato sui dati reali: 6 persone, 2 account condivisi, 1 tecnico esterno in produzione, tutti
  ancora raggiungibili dalla pagina unificata. Build/lint puliti.
✅ Selettori a schede uniformati su un solo stile (2026-08-28, richiesta esplicita: "uniforma tutto
  il sistema con lo stesso stile di ui/ux... fammi proposte con artifact" → artifact "Armonia UI":
  trovato che i selettori a schede (Catalogo/Magazzino, Persone/Accessi, Giorno/Settimana/Mese...)
  usavano due stili diversi solo perché scritti in momenti diversi → confermato "sì, pillola
  arrotondata ovunque") — Materiali, Persone e Clienti (+ il filtro nella tabella Installazioni)
  passano dal "segmento quadrato" (`rounded-lg`, tinta piena) alla "pillola arrotondata" già usata
  in Calendario, nei pulsanti di navigazione data e nel rail dei mondi in sidebar — cambia solo il
  guscio esterno, zero rischio sulle azioni dentro. Lasciati fuori (di proposito, non sono lo stesso
  pattern): i selettori a 3 vie dentro i form (Classificazione materiale, Metodo di pagamento della
  posa) — sono controlli tipo radio-button a larghezza piena, un concetto diverso da "quale vista sto
  guardando".
  pose.donewifi.it resta con la sua identità visiva "Segnale" (font/colori/sfondo scuro) — chiarito
  con l'utente: "uniforma tutto" riguarda solo il gestionale principale, pose è deliberatamente
  un'app a parte per l'uso da smartphone sul campo. Build/lint puliti.
✅ Fix: nuove installazioni pianificate come interventi in loco (2026-08-28, bug reale segnalato
  dall'utente: "stai trattando le nuove installazioni come interventi in loco") — trovati DUE punti
  dove "Tipo di servizio" per un nuovo appuntamento non veniva dedotto correttamente dal Ticket
  collegato, con il rischio concreto che più avanti si aprisse la Scheda sbagliata (Lavorazione
  invece di Installazione) al momento di completarlo:
  - Calendario → "+ Appuntamento" (`FormNuovoAppuntamento`): "Tipo di servizio" restava sempre fisso
    su "Lavorazione tecnica" per default, **indipendentemente** dal Ticket scelto nel menu a tendina
    sopra — bastava dimenticarsi di cambiarlo a mano. Ora, scegliendo un Ticket di categoria
    "Commerciale" (nuovo contratto/installazione — stesso segnale già usato in Vista Tecnico →
    NuovoTicketTecnico), il tipo si imposta da solo su "Nuova installazione" (resta comunque
    modificabile a mano).
  - Dettaglio Ticket → "Pianifica appuntamento": già aveva un tentativo di dedurlo, ma usava
    `segnalazione_id` come unico segnale — un Ticket "Commerciale" creato direttamente dal form
    completo o da Vista Tecnico, SENZA passare da una Segnalazione, non ha mai `segnalazione_id`
    valorizzato e restava comunque su "Lavorazione tecnica". Ora usa `categoria === "Commerciale"`
    (il segnale giusto e generale), con `segnalazione_id` come controllo aggiuntivo.
  Verificato sui dati reali: il Ticket #43 (Loris Peano) — categoria Commerciale, nessuna
  Segnalazione d'origine, ancora "Da gestire" — è esattamente il caso che prima sarebbe stato
  proposto come "Lavorazione tecnica" per errore al momento di pianificarlo; nessun appuntamento già
  creato in produzione risulta con il tipo sbagliato (bug intercettato prima del danno, nessun dato
  da correggere). Build/lint puliti.
✅ Fix parte 2: trovato un secondo caso reale dello stesso bug (2026-08-28, segnalato con uno
  screenshot di pose.donewifi.it — l'appuntamento "Ignazio Pavetto" apriva ancora la Scheda di
  Lavorazione dopo il fix precedente) — la correzione di prima copriva solo `categoria ===
  "Commerciale"`; un Ticket categoria **"Assistenza"** con sottocategoria **"Pianificazione
  installazione"** (uno dei valori validi in `SOTTOCATEGORIE_TICKET.Assistenza`, sibling di
  "Intervento in loco") non passava da nessuno dei due segnali usati finora — restava comunque
  "Lavorazione tecnica".
  - Nuova `tipoServizioDaTicket(categoria, sottocategoria)` in `lib/types.ts`: unica fonte condivisa
    (prima la regola era duplicata — e disallineata — tra Calendario e Dettaglio Ticket) —
    `categoria === "Commerciale" || sottocategoria === "Pianificazione installazione"` → "Nuova
    installazione".
  - Aggiornati entrambi i punti (Calendario → `FormNuovoAppuntamento`, Dettaglio Ticket →
    "Pianifica appuntamento") per usarla, con `sottocategoria` aggiunta a `TicketMinimo` e alla
    query di `/calendario`.
  **Corretti anche i dati già sbagliati in produzione**: 5 appuntamenti "Programmato" (nessuno
  ancora completato, nessuna Scheda già inviata — nessun rischio di sovrascrivere un lavoro reale
  già fatto) con tipo_servizio "Lavorazione tecnica" ma Ticket collegato "Pianificazione
  installazione" — tra questi proprio "Ignazio Pavetto", quello nello screenshot — riportati a
  "Nuova installazione" e verificati uno per uno dopo la correzione.
  Build/lint puliti.
✅ MAC formattato mentre si digita + foto: scelta vera tra fotocamera e galleria (2026-08-28,
  richiesta esplicita: "nel inserimento mac devi far mettere i : ogni due caratteri e trasformare in
  stampatello le lettere. Inoltre nelle foto da inserire avrei bisogno che o le scatto sul momento o
  le pesco dalla galleria") — due correzioni distinte:
  - Nuova `formattaMac()` in `lib/types.ts` (unica fonte, usata sia nella Scheda di Installazione
    desktop che nella versione pose "una domanda alla volta"): tiene solo caratteri esadecimali,
    tutto maiuscolo, un `:` ogni due caratteri mentre si digita, capato a 6 byte — sostituisce il
    campo di testo libero da formattare a mano.
  - **Foto**: 3 punti (Scheda Installazione desktop, Scheda Installazione pose, Rapportino pose)
    avevano `capture="environment"` sull'input file — un attributo che su gran parte dei browser
    mobile apre DIRETTAMENTE la fotocamera, saltando la scelta nativa "Fotocamera / Libreria foto"
    che l'etichetta del campo prometteva già ("Scatta o scegli una foto"). Tolto in tutti e tre:
    `accept="image/*"` da solo basta a far comparire entrambe le opzioni. Il Rapportino Ticket
    interno (staff, non pose) non aveva questo problema — l'attributo era presente solo in quei tre.
✅ Fix: costo del Trasferimento (2026-08-28, richiesta esplicita: "una volta che riceviamo la
  documentazione il trasferimento si procede come nuova installazione, però il costo è di 60€ e non
  il costo di privato o business — come risolviamo") — un Ticket "Trasferimento" (categoria
  Commerciale) apre la Scheda di Installazione come un nuovo contratto, e la Scheda aggiunge da sola
  la riga Privato/Business (30€/50€) — sbagliata per un trasferimento, che ha una tariffa fissa a
  parte. La riga giusta esisteva già nel catalogo (categoria TRASFERIMENTI, "Stesso comune utente
  privato", 60€, verificato sui dati reali) ma andava aggiunta a mano: nessuno lo faceva
  sistematicamente, il costo sbagliato restava quello Privato/Business.
  - Migrazione 0067 (**da applicare manualmente in Supabase SQL Editor**, contiene sia la modifica
    di schema che il collegamento alla riga reale — indispensabile perché il fix funzioni): estende
    `attivazione_predefinita` con un terzo valore "Trasferimento" (prima solo "Privato"/"Business",
    migrazione 0055) e lo assegna alla riga "Stesso comune utente privato" già in catalogo.
  - `getTipologiaClientePerAppuntamento()`/`...Esterno()` ora portano anche `sottocategoria` del
    Ticket, non solo il tipo cliente — un solo giro invece di un secondo fetch dedicato.
  - `SelettoreMateriali`: nuovo prop facoltativo `sottocategoriaIniziale` — se il Ticket è
    "Trasferimento" e la riga da 60€ esiste in catalogo, si aggiunge quella al posto della riga
    Privato/Business (mai insieme, il cliente vedrebbe due costi di attivazione).
  - Aggiunta "Trasferimento" anche al menu "Attivazione predefinita" nel form Materiali, per gestire
    in futuro casi simili dalla UI invece che da migrazione.
  Build/lint puliti.
✅ Bypass amministratore per l'OTP del cliente (2026-08-28, richiesta esplicita: "dobbiamo fare il
  modo di bypassare nel rapporto di lavoro otp del cliente facendo richiedere con otp agli
  amministratori" → chiarito con l'utente: il codice arriva in Chat interna a tutti gli
  amministratori insieme, nessun motivo scritto a mano da registrare, disponibile ovunque si chiede
  la firma cliente) — quando il cliente non può confermare in nessun modo (irraggiungibile,
  assente...), un amministratore autorizza al suo posto: stesso principio dell'OTP cliente esistente
  (codice a 6 cifre, tentativi limitati, scadenza 10 minuti), ma il codice va in Chat interna invece
  che via email — chiunque degli amministratori attivi lo veda per primo può darlo al tecnico.
  - Nuova tabella `otp_admin_firma` (migrazione 0068, **da applicare manualmente in Supabase SQL
    Editor** — senza, il bypass restituisce un errore invece di funzionare) — stesso schema di
    `otp_firma_cliente` (0050/0051), con in più `admin_id`: quale amministratore ha davvero dato il
    codice al tecnico, raccolto con un selettore subito dopo la verifica (il codice arriva a tutti
    insieme, non è deducibile da solo).
  - `FirmaClienteApprovata.metodo` ha un terzo valore "otp_admin" — `email` resta sempre vuota per
    questo metodo (non è mai il cliente), `adminId`/`adminNome` portano chi ha autorizzato.
  - `FirmaClienteScheda`: nuova schermata dedicata (non un ramo in mezzo al flusso email/OTP
    cliente) — un link volutamente più defilato e in rosso rispetto al link di approvazione
    esistente ("il cliente conferma più tardi" è un gradino sotto "il cliente non conferma proprio"),
    con una conferma esplicita più pesante prima di procedere. La card di stato finale segnala
    chiaramente "non è una conferma del cliente".
  - `salvaSchedaLavoro()`/`...Esterno()` (Scheda Installazione/Lavorazione, desktop e pose):
    controllo server esteso allo stesso modo del client — solo `schede_lavoro`, non
    `rapportini_intervento` (il Rapportino di chiusura Ticket non chiede più conferma cliente da
    tempo, giro "chiusura senza conferma obbligatoria", 2026-08-27 — estendere anche lì sarebbe
    schema inutilizzato).
  Verificato sui dati reali: 2 amministratori attivi in produzione (destinatari del codice), persona
  "Sistema" per l'invio in chat presente e funzionante. Build/lint puliti.
✅ Bypass ufficio: da link defilato a scheda vera (2026-08-28, richiesta esplicita: "rivedi il
  metodo deve uscire un secondo tab con possibilità di ricevere otp da amministratore. non mettere
  dicitura amministratore ma metti ufficio") — il giro precedente lo aveva fatto come un link in
  fondo alla pagina, in rosso, dietro un `confirm()` pesante: qui l'utente ha chiesto esplicitamente
  di promuoverlo a una vera seconda scheda, alla pari della conferma cliente.
  - `FirmaClienteScheda`: due schede in cima ("Cliente"/"Ufficio", stessa pillola arrotondata già
    uniformata ovunque nel gestionale) invece del link nascosto — nessun popup di conferma: scegliere
    la scheda e toccare "Richiedi codice all'ufficio" è già il gesto deliberato.
  - Ogni occorrenza di "amministratore"/"amministratori" nel testo mostrato al tecnico è diventata
    "ufficio" — "Chi in ufficio ti ha dato il codice?", "Codice inviato in ufficio", "Autorizzato
    dall'ufficio (NOME) il...". I nomi interni (variabili, azioni server: `richiediOtpAmministratore`,
    `getAmministratoriAttiviPerFirma`...) restano invariati — è solo il testo rivolto a chi usa la
    Scheda a cambiare, non chi riceve davvero il codice (resta lo stesso elenco di amministratori
    attivi).
  Build/lint puliti.
✅ Fix: "fermo su salvataggio" nella Scheda di Installazione/Lavorazione (2026-08-28, bug reale
  segnalato dall'utente su pose.donewifi.it) — le 4 funzioni `invia()` che salvano la Scheda
  (pose × Installazione/Lavorazione via `DomandaWizard`, desktop × Installazione/Lavorazione via
  `SchedaWizard`) non avevano un `try/catch` attorno all'`await` del salvataggio: un errore
  imprevisto (es. la pagina rimasta aperta da prima di un aggiornamento del gestionale, con
  l'azione server non più valida — il sospetto più probabile in questo caso, dato il tempismo)
  lasciava `setInCorso(false)` senza essere mai raggiunto, il pulsante bloccato su "Salvataggio…"
  per sempre invece di mostrare un errore. Aggiunto un `try/catch/finally` a tutte e 4: un errore
  imprevisto ora mostra "Errore imprevisto durante il salvataggio — ricarica la pagina e riprova."
  invece di restare bloccato in silenzio, e `finally` garantisce che il pulsante torni sempre
  cliccabile. Build/lint puliti.
  Build/lint puliti.
✅ Testi email cliente riscritti (2026-08-31, richiesta esplicita: "ora dobbiamo rivedere i testi
  di quando il sistema invia le mail con richiesta dati,cambi e disdette" → "correggi così come
  hai fatto,prima era troppo colloquiale e diretto") — le email di Richiesta Dati e delle 6 pratiche
  cliente (Cambio IBAN, Cambio Anagrafica, Trasferimento, Subentro, Disdetta contratto, Conferma
  cessione, Dati per il Subentro) in `src/lib/email.ts` usavano un'unica introduzione generica
  ("per la tua pratica di X, apri il link qui sotto per proseguire") che non distingueva una
  richiesta dall'altra né anticipava cosa sarebbe successo dopo il click.
  - Aggiunta la mappa `INTRO_PRATICA` (chiave = lo stesso `titoloPratica` già usato nei 4 punti di
    invio, nessuna nuova firma di funzione da propagare) con un'introduzione dedicata per ciascuna
    delle 7 pratiche, usata da `emailPraticaCliente()` al posto della riga generica.
  - Riscritta anche l'introduzione di `emailRichiestaDatiSegnalazione()`.
  - Tono corretto rispetto a un primo giro giudicato "troppo colloquiale e diretto": registro
    sobrio e impersonale in linea con il resto delle comunicazioni Done Wifi, niente forme dirette
    tipo imperativi/esclamazioni fuori posto.
  - Aggiornato di riflesso l'artifact di anteprima "Email Cliente Aggiornate" con i nuovi testi.
  Build/lint puliti.
✅ Testi WhatsApp/copia-link pratiche corretti (2026-08-31, l'utente ha notato dopo il giro sopra:
  "ma questo è il testo della mail?" — segnalando che il pannello "Avvia una nuova pratica" del
  Cliente Esterno mostrava ancora "Ciao Nasso, per la tua pratica di trasferimento con Done Wifi
  apri questo link", la stessa formula generica corretta nelle email ma rimasta intatta nei
  messaggi WhatsApp/copia-link, che vivono in un punto diverso del codice) — nuova funzione
  `messaggioWhatsappPratica()` in `src/lib/richieste-cliente-config.ts`, con un'apertura dedicata
  per pratica (Cambio IBAN, Cambio Anagrafica, Trasferimento, Subentro, Disdetta contratto),
  usata sia dal pannello Cliente Esterno (`nuova-pratica.tsx`) sia dal pannello Ticket
  (`tickets-board.tsx`, che invia Subentro/Disdetta). Il messaggio di Richiesta Dati in
  `segnalazioni-board.tsx` non è stato toccato: era già specifico ("inserisci qui i tuoi dati"),
  non condivideva il problema. Build/lint puliti.
✅ Scheda Cliente Esterno riorganizzata (2026-08-31, richiesta esplicita: "puoi riorganizzare la
  scheda cliente e migliorarla? le pratiche sotto da aprire non sono comode" — su 3 proposte con
  artifact ["Scheda Cliente: Proposte"], l'utente ha scelto la "Barra laterale fissa") — la pagina
  era un'unica colonna lunga (Dati anagrafici, Contratto, Fatture, Preventivi, Installazioni,
  "Avvia una nuova pratica" quasi in fondo, Ticket collegati): per mandare un link di
  Trasferimento/Cambio IBAN bisognava scorrere quasi fino alla fine ogni volta.
  - `[id]/page.tsx`: contenitore allargato a `max-w-6xl`, diviso in una barra laterale sticky
    (`md:sticky md:top-5`, 300px) con identità cliente (contatti, profilo, CF/P.IVA/codice/
    contratto) + azioni rapide, e una colonna principale con Storico profilo, Fatture, Preventivi,
    Installazioni, Documenti e pratiche inviate, Ticket collegati — stesso ordine di prima, solo
    spostati dalla colonna unica a quella principale.
  - `NuovaPraticaClienteEsterno` (`nuova-pratica.tsx`): ora vive nella barra laterale, sempre
    visibile mentre si scorre la pagina invece che sepolta a metà colonna. L'elenco delle pratiche
    già inviate è uscito dal componente ed è diventato una card a sé ("Documenti e pratiche
    inviate") nella colonna principale, per tenere la barra laterale stretta; i pulsanti di
    Disdetta sono impilati in verticale invece che in riga, più adatti a una colonna da 300px.
  Build/lint puliti.
✅ "Clienti attivi" torna a essere il flag grezzo Aruba (2026-08-31, richiesta esplicita dopo
  un'indagine su "mancano clienti": "le fatture potrebbero essere non sempre un sistema preciso
  di verifica. Utilizzerei la pagina di ricerca con i clienti con status sì" — vedi
  `⚠️ MIGRAZIONE DA APPLICARE`) — la migrazione 0060 (2026-08-25) incrociava `contratto_attivo`
  con le fatture (prima 90 giorni, poi 12 mesi) perché il flag grezzo da solo sembrava
  sovrastimare gli attivi. Verifica sui dati reali: 585 clienti con `contratto_attivo=true`
  risultavano "non attivi" da noi, di cui 233 senza NESSUNA fattura mai abbinata pur avendo un
  profilo assegnato — l'abbinamento fattura↔cliente è per CF/P.IVA e salta quando il pagante non
  coincide col nome sul contratto (nucleo familiare, contratto ereditato...). Caso reale
  verificato: l'account dell'utente stesso (cod. gestionale 900500) risultava "non attivo" perché
  le fatture della sua utenza erano intestate a due parenti con CF diversi dal suo.
  - Migrazione `0069_attivo_solo_contratto_aruba.sql`: `ricalcola_clienti_attivi()` ora imposta
    `attivo = contratto_attivo`, senza più incrociare le fatture — lo stesso "Status Sì/No" già
    mostrato dalla pagina interna di ricerca anagrafica su Aruba usata come riferimento.
  - Le fatture restano visibili nella scheda cliente per un controllo caso per caso, ma non
    decidono più il flag "attivo" mostrato in giro per il gestionale (badge, filtri, KPI).
  Build/lint puliti.

✅ "Clienti attivi" — regola ibrida definitiva (2026-08-31, seguito immediato della 0069: dopo
  averla applicata l'utente ha visto i numeri e ha detto "sono tanti") — la 0069 (solo flag
  Aruba) reintroduceva esattamente il problema che aveva motivato la 0060 la prima volta: Aruba
  non aggiorna il flag alla chiusura di un contratto. Verificato sui dati reali dopo la 0069: dei
  2922 clienti `contratto_attivo=true`, 355 hanno una fattura ma la più recente ha più di 12
  mesi (probabile vero cessato); 244 non hanno NESSUNA fattura mai abbinata (come il caso
  dell'utente stesso — non è cessazione, è un problema di abbinamento CF).
  - Migrazione `0070_attivo_ibrido_contratto_e_fattura_o_mai_trovata.sql`: nuova regola,
    `contratto_attivo=true` E (fattura entro 12 mesi, OPPURE nessuna fattura mai trovata per quel
    CF/P.IVA) — dà il beneficio del dubbio a chi non ha fatture abbinate invece di escluderlo,
    ma esclude comunque chi ha una fattura vecchia accertata. Confermata dall'utente su 3
    alternative presentate (2922 / 2323 / 2567) — scelta la via di mezzo, **2567 risultati**.
  Build/lint puliti.

✅ Controllo d'oro usabilità (2026-08-31, richiesta esplicita: "ora fai un controllo d'oro su
  l'usabilità") — sondaggio su dashboard/materiali/tariffe/preventivi/richieste-clienti/sistema/
  login/vista-tecnico/sidebar/archivio/lavorazioni/segnalazioni/chat/tickets/calendario. Trovato
  e corretto un bug di feedback ricorrente, verificato riga per riga prima di toccare nulla:
  `toast()` senza secondo parametro è di default `"errore"` (rosso, icona di allarme) — usato per
  errore, ma in diversi punti anche per confermare un successo, e in altri il risultato della
  server action (`.errore`) veniva ignorato del tutto, mostrando sempre "successo" anche a
  fronte di un rifiuto del server.
  - `materiali/antenne-vista.tsx` (4 punti) e `magazzino-vista.tsx`: conferme di successo
    (prenotazione, eliminazione, aggiornamento giacenza) che apparivano in rosso — aggiunto il
    secondo parametro `"successo"` mancante.
  - `tickets-board.tsx` (2 punti, card e dialog dettaglio) e `vista-tecnico-board.tsx`:
    avanzamento stato Ticket — l'azione più cliccata del gestionale — mostrava sempre "Passato a…"
    anche se il server aveva rifiutato (permessi, riga già cambiata da un altro); ora controlla
    `.errore` prima di confermare. Stesso fix per "Prendi in carico" in `tickets-board.tsx`.
  - `calendario-board.tsx` (3 funzioni: segna completato/annulla appuntamento, apri/chiudi
    promemoria, elimina promemoria): stesso schema, stesso fix.
  - `richieste-clienti-board.tsx`: cambio stato pratica, stesso fix.
  - `tariffe-board.tsx` (duplica/sottoscrivibile/pubblica): il caso peggiore — in caso di errore
    non succedeva letteralmente nulla, nessun toast né refresh. Aggiunto `useToast` (mancava
    l'import) e il riscontro completo, successo e errore, per tutte e 3.
  Altri trovati ma NON ancora corretti (bassa priorità/da valutare con l'utente): Dashboard con
  query admin in sequenza invece che parallele; "Esporta PDF" che chiama solo `window.print()`;
  Vista Tecnico senza link diretto per impostare "Tu sei" quando manca; terminologia
  "Lavorazione Tecnica"/"Intervento in loco" leggermente diversa tra schermate.
  Build/lint puliti.

✅ Controllo d'oro usabilità — copertura completa (2026-08-31, seguito di "procedi" dopo aver
  proposto di estendere la caccia allo stesso bug a tutto il resto dell'app) — grep sistematico di
  ogni chiamata `toast(...)` e di ogni `await` "nudo" (risultato scartato) su tutti i componenti
  `src/components/**/*.tsx`, non solo sul campione del giro precedente. La stragrande maggioranza
  era già corretta (segnalazioni, preventivi, persone, lavorazioni, archivio, chat, pose — tutti
  puliti). Trovati e corretti 2 punti nuovi:
  - `tickets-board.tsx` (assegnazione Ticket — pulsante "Rimuovi" e le 3 opzioni della tendina
    "Assegna a..."): il risultato della server action veniva scartato e l'interfaccia si
    aggiornava comunque come se fosse andata a buon fine — peggio del solo toast mancante, perché
    mostrava un assegnatario sbagliato in caso di rifiuto del server. Ora controlla `.errore`
    prima di aggiornare lo stato locale.
  - `todo-panel.tsx` (modifica di un to-do): l'errore restituito da `onSalvaModifica` veniva
    scartato — il form restava aperto in caso di fallimento ma senza spiegare perché, indistinguibile
    da un banale invio non ancora premuto. Aggiunto `useToast` (mancava) per mostrare l'errore.
  Build/lint puliti.

✅ Controllo d'oro usabilità — nuove aree mai controllate prima (2026-08-31, richiesta esplicita:
  "fai ancora dei controlli che non hai mai fatto") — 3 nuovi giri: bottoni icona-pura senza
  etichetta, protezione doppio invio (nessun problema trovato, già a posto ovunque), e le pagine
  PUBBLICHE rivolte al cliente (mai controllate finora, sempre e solo staff interno).
  - Accessibilità: 2 bottoni con sola icona Lucide senza `aria-label`/`title` — "Rimuovi antenna"
    in `materiali/antenne-vista.tsx` e "Scollega cliente" in `preventivi/nuovo-preventivo-form.tsx`.
    Aggiunte entrambe le etichette.
  - **Il problema più serio**: messaggi di errore Postgres/Supabase grezzi (nomi di
    colonna/tabella) mostrati direttamente al cliente finale in 6 file — il più critico,
    `api/approva/[token]/route.ts` (6 punti), arriva via email a chi clicca per approvare
    contratto/preventivo/intervento, senza nessuna familiarità col gestionale. Altri: dopo aver
    già caricato 4 documenti d'identità in Richiesta Dati (`api/richiesta-dati/route.ts` +
    `upload-url/route.ts`), nel form Cambio IBAN/Anagrafica/Trasferimento/Subentro
    (`api/richiesta-cliente/route.ts`), nel Portale self-service (`apri-ticket`/`trova-cliente`),
    e nel login del tecnico esterno da smartphone (`pose/actions.ts`). Sostituito ovunque con un
    messaggio comprensibile ("Errore imprevisto — riprova o contattaci"); il dettaglio tecnico
    vero resta nei log server (`console.error`) per il debug.
  - Trovati ma NON ancora corretti (segnalati, bassa priorità): validazione solo-al-submit nel
    form Richiesta Dati senza evidenziare il campo mancante; asterischi obbligatorietà mancanti
    nel tab "Verifica Stato" del Portale; touch target sotto 44px sui toggle Privato/Azienda;
    fac-simile disdetta a 11.5px su mobile.
  Build/lint puliti.

✅ Navigazione: sidebar unica ad accordion (2026-09-01, richiesta esplicita: "ottimizza nel meglio
  dei modi tutta l'interfaccia e rendi molto più semplice e ottimizzato il sistema e la
  navigazione nei menu e sottomenu" — 2 proposte con artifact "Navigazione: Due Proposte",
  scelta la "A") — il menu era "binario di icone poi pannello": un click per scegliere il mondo
  (Assistenza/Vendita/Clienti/Analisi/Team), un secondo per la pagina — e le etichette del
  binario erano leggibili solo a 9px.
  - `app-sidebar.tsx`: il binario + pannello separato lascia il posto a un unico elenco verticale
    con sezioni pieghevoli (accordion) — un click in meno per raggiungere una pagina di un mondo
    diverso da quello corrente, zero per restarci. La sezione della pagina in cui ti trovi è
    sempre aperta; aprirne un'altra non richiude quella attuale (si può confrontare voci di due
    mondi insieme). Rimossa la logica `mondoScelto`/rail-click, sostituita da `gruppiAperti`
    (`Set<string>`) che si sincronizza con la navigazione senza mai richiudere una sezione aperta
    a mano.
  - Nessun cambiamento alla logica dei permessi (chi vede quale mondo/voce) — solo il markup di
    presentazione è stato toccato, verificato sui dati reali delle 4 persone attive in produzione.
  Build/lint puliti.

✅ Sidebar: icone colorate per mondo + affordance "cliccabile" più chiara (2026-09-01, richiesta
  esplicita: "riesci a mettere delle icone laterali colorate e non biache che si sposino con
  l'interfaccia. e migliorare leggibilità dei menu a tendina,perchè non si capisce che si devono
  cliccare quelli per farli sendere" — 2 proposte con artifact "Sidebar: Icone e Affordance",
  scelta la "2 · Barra colorata laterale") — le icone dei 5 mondi erano tutte bianche/grigie
  (indistinguibili a colpo d'occhio) e l'intestazione di ogni sezione pieghevole non aveva alcun
  segnale "cliccami" a riposo, solo su hover.
  - `Mondo.accento`: un colore identitario per mondo (Assistenza ambra `#FF9F43`, Vendita verde
    acqua `#4FD1C5`, Clienti viola `#A78BFA`, Analisi blu `#60A5FA`, Team rosa `#F472B6`), mai sul
    testo (resta bianco/grigio come il resto della sidebar) — solo su icona, barra laterale e
    freccia dell'intestazione.
  - Intestazione di ogni sezione: barra verticale colorata sempre visibile a sinistra (più accesa
    quando aperta o in hover, mai invisibile a riposo come prima), sfondo tinto dello stesso
    colore quando la sezione è aperta, freccia colorata quando ruotata.
  Build/lint puliti.

✅ Icone colorate per significato del dato — prima tornata (2026-09-01, richiesta esplicita:
  "integrerei le icone e anche quelle colorate in tutto il gestionale per migliorare l'usabilità"
  — 3 proposte con artifact "Icone Colorate: Proposte", scelta la "A · Colore per significato del
  dato") — un TIPO di informazione ha sempre lo stesso colore ovunque compaia nel gestionale,
  indipendentemente dalla pagina: contatto (telefono/email) blu, luogo (indirizzo) verde acqua,
  documento (fatture/pratiche/ticket/moduli) viola, denaro (fatture/preventivi/dati contrattuali)
  verde, tempo (storico/appuntamenti/calendario) ambra, persona (assegnatario) rosa — diverso,
  deliberatamente, dal colore per-mondo della sidebar (quello risponde a "dove sei nel menu", non
  "che tipo di dato stai guardando").
  - Nuovi `lib/colore-icone.ts` (la mappa dei 6 colori) e `components/condivisi/icona-categoria.tsx`
    (il "chip" quadrato colorato attorno all'icona, riusato ovunque) — un solo posto da cui
    derivano tutti i colori, non scelti a mano pagina per pagina.
  - Applicato a 3 pagine (l'utente ha scelto "tutte le pagine principali", si comincia da queste,
    le altre in un giro successivo): Scheda Cliente Esterno (`clienti-esterni/[id]/page.tsx`),
    Dettaglio Ticket (`tickets-board.tsx`), Clienti (`clienti-board.tsx`).
  Build/lint puliti.

**⚠️ MIGRAZIONE DA APPLICARE (2026-08-31):** `supabase/migrations/0070_attivo_ibrido_contratto_e_fattura_o_mai_trovata.sql`
— sostituisce di nuovo `ricalcola_clienti_attivi()` (soppianta la 0069, applicata poche ore prima)
e la richiama subito sui dati esistenti. Da incollare nell'SQL Editor di Supabase.