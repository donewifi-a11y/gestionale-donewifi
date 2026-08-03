-- Il catalogo Materiali cresce da "materiali fisici per installazioni" a
-- listino servizi completo (trasferimenti, attivazioni, interventi
-- tecnici, WLINK, materiali, router/switch/AP, CPE) — serve una categoria
-- per raggrupparli e una descrizione facoltativa.
alter table materiali_magazzino add column if not exists categoria text;
alter table materiali_magazzino add column if not exists descrizione text;
create index if not exists materiali_magazzino_categoria_idx on materiali_magazzino (categoria);

-- ★ regola prezzi di questo listino (diversa da Tariffe, dove IVA
-- inclusa/esclusa si sceglie riga per riga): qui il prezzo inserito è
-- SEMPRE quello che paga un cliente Privato (IVA già inclusa in quella
-- cifra); un cliente Business paga lo stesso importo trattato come
-- imponibile, con il 22% di IVA aggiunto in fattura — quindi un numero
-- più alto per lo stesso materiale. Un solo prezzo salvato basta: il
-- prezzo Business si calcola sempre come prezzo_unitario * 1.22, non
-- serve una seconda colonna (vedi prezzoPerTipoCliente() in types.ts).
comment on column materiali_magazzino.prezzo_unitario is
  'Prezzo per cliente Privato, IVA inclusa. Il prezzo Business è sempre questo importo trattato come imponibile + IVA 22% (vedi prezzoPerTipoCliente() in src/lib/types.ts).';
