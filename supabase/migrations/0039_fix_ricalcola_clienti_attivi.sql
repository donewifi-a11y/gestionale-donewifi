-- ★ BUG REALE TROVATO in test end-to-end (2026-08) — ricalcola_clienti_attivi()
-- (migrazione 0026) fa un UPDATE su TUTTE le righe di clienti_esterni
-- deliberatamente senza WHERE (deve rivalutare ogni cliente). Il database
-- ora rifiuta ogni UPDATE senza WHERE con l'errore "UPDATE requires a
-- WHERE clause" (SQLSTATE 21000) — una protezione anti-incidenti
-- probabilmente attivata a livello di progetto Supabase in un secondo
-- momento, non presente quando la funzione fu scritta. Risultato pratico:
-- da quando questa protezione è attiva, ogni chiamata alla funzione dopo
-- una sincronizzazione Aruba falliva silenziosamente (l'errore veniva
-- scartato in clienti-esterni/actions.ts, vedi fix lato codice) — il
-- flag "cliente attivo" mostrato in tutta l'app non si aggiornava più.
-- `where true` è una no-op che soddisfa la protezione mantenendo
-- l'identico comportamento (aggiorna comunque ogni riga).
create or replace function ricalcola_clienti_attivi() returns void as $$
begin
  update clienti_esterni ce
  set attivo = exists (
    select 1 from fatture_esterne fe
    where fe.emissione >= (current_date - interval '90 days')
      and (
        (ce.codice_fiscale is not null and fe.codice_fiscale = ce.codice_fiscale)
        or (ce.partita_iva is not null and fe.partita_iva = ce.partita_iva)
      )
  )
  where true;
end;
$$ language plpgsql security definer set search_path = public;
