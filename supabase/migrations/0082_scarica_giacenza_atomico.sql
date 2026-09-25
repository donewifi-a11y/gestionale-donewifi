-- non cancellare questa riga di commento

-- ============================================================
-- FIX — audit modulo Materiali: scaricaGiacenzaMateriali() (materiali/
-- actions.ts) leggeva la giacenza attuale, calcolava la nuova in
-- JavaScript, poi la scriveva con un update separato — un classico
-- "leggi poi scrivi" senza alcun blocco. Due Schede di Lavoro salvate
-- quasi in contemporanea per lo stesso materiale (scenario reale: due
-- tecnici sul campo che chiudono un intervento nello stesso momento)
-- possono entrambe leggere la stessa giacenza di partenza e scrivere
-- entrambe lo stesso risultato, perdendo uno dei due scarichi in
-- silenzio — magazzino disallineato dalla realtà senza che nessuno se ne
-- accorga.
--
-- Questa funzione fa lettura+scrittura in un solo statement SQL (UPDATE
-- ... RETURNING), atomico per costruzione: Postgres serializza gli
-- update concorrenti sulla stessa riga, il secondo vede sempre il
-- risultato del primo invece di una copia stantia.
-- ============================================================
create or replace function scarica_giacenza_materiale(materiale_id_param uuid, quantita_param integer)
returns table(id uuid, nome text, giacenza integer, soglia_minima integer, ultimo_avviso_il timestamptz) as $$
  update materiali_magazzino
  set giacenza = greatest(0, materiali_magazzino.giacenza - quantita_param)
  where materiali_magazzino.id = materiale_id_param and materiali_magazzino.giacenza is not null
  returning materiali_magazzino.id, materiali_magazzino.nome, materiali_magazzino.giacenza, materiali_magazzino.soglia_minima, materiali_magazzino.ultimo_avviso_il;
$$ language sql volatile;
