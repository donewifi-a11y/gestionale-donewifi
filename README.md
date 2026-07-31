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
   `0020_promozioni_tariffe.sql`, `0021_chat_interna.sql` e `0022_chat_letture_presenza.sql`,
   eseguendo ognuno.
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