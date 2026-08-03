-- La migrazione 0034 ha revocato l'esecuzione di imposta_password_persona()
-- solo dal ruolo `authenticated`, assumendo che il `revoke all ... from
-- public` già presente nella 0006 bastasse a escludere anche `anon`.
-- Un test dopo l'applicazione della 0034 mostra che il ruolo `anon` può
-- ancora chiamare la funzione con successo (status 204, nessun errore) —
-- quindi quell'assunzione era sbagliata o qualcos'altro concede
-- l'esecuzione. Qui si revoca esplicitamente da OGNI ruolo noto (public,
-- anon, authenticated) e si concede solo a service_role, senza fare
-- affidamento su un `revoke from public` precedente.
revoke execute on function imposta_password_persona(uuid, text) from public;
revoke execute on function imposta_password_persona(uuid, text) from anon;
revoke execute on function imposta_password_persona(uuid, text) from authenticated;
grant execute on function imposta_password_persona(uuid, text) to service_role;

revoke execute on function ricalcola_clienti_attivi() from public;
revoke execute on function ricalcola_clienti_attivi() from anon;
revoke execute on function ricalcola_clienti_attivi() from authenticated;
grant execute on function ricalcola_clienti_attivi() to service_role;
