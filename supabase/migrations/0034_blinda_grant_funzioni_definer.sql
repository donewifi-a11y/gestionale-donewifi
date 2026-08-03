-- ★★★ FIX SICUREZZA CRITICO ★★★
-- `imposta_password_persona()` (migrazione 0006) è `security definer` ed
-- era concessa a `authenticated` senza NESSUN controllo interno su chi
-- chiama: qualunque utente loggato (anche non admin) poteva invocarla
-- via RPC con l'id di UN'ALTRA persona — incluso un admin — e
-- resettarne la password/PIN usato dal selettore "Tu sei", di fatto
-- impersonandola. Il controllo "solo admin" esisteva SOLO lato
-- applicazione (verificaAdmin() in persone/actions.ts, che poi chiama la
-- funzione con la service role) — mai imposto dal database. L'app non ha
-- mai avuto bisogno del grant a `authenticated`: chiama questa funzione
-- sempre e solo tramite la service role.
revoke execute on function imposta_password_persona(uuid, text) from authenticated;
grant execute on function imposta_password_persona(uuid, text) to service_role;

-- `ricalcola_clienti_attivi()` (migrazione 0026) è `security definer`
-- senza `revoke`/`grant` espliciti: in questo progetto le funzioni nuove
-- risultano eseguibili di default da `authenticated` (come dimostra il
-- fatto che le altre funzioni definer abbiano dovuto blindarsi a mano).
-- Impatto minore di quella sopra (nessuna fuga di dati, solo un
-- ricalcolo pesante su tutta clienti_esterni invocabile da chiunque sia
-- loggato invece che solo dall'admin che la usa davvero in
-- clienti-esterni/actions.ts) ma va comunque ristretta.
revoke execute on function ricalcola_clienti_attivi() from public;
revoke execute on function ricalcola_clienti_attivi() from authenticated;
grant execute on function ricalcola_clienti_attivi() to service_role;
