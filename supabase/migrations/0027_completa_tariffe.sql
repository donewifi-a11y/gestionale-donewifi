-- Completa il catalogo Tariffe di 0025: quella prima analisi usava uno
-- script non paginato (stesso limite Supabase da 1000 righe corretto nel
-- codice, ma non rifatto per quell'analisi) — copriva solo 374 dei 2909
-- contratti attivi. Con la paginazione corretta, le famiglie commerciali
-- reali coprono 2135 contratti attivi (73%, contro il 13% di prima); le
-- rimanenti sono quasi tutte promo stagionali scadute (Black Friday,
-- Xmas, Summer, Saldi Done, Epic...) che non ha senso avere in un
-- catalogo di piani correnti.

insert into tariffe (nome, tipologia_cliente, velocita, prezzo_mensile, descrizione, attivo, ordine)
select v.nome, 'Tutti', v.velocita, null, null, true, v.ordine
from (values
  ('Business 50', '50 Mbps', 16),
  ('Business 100', '100 Mbps', 17),
  ('Fttc 100', '100 Mbps', 18),
  ('Direzionale', null, 19),
  ('30 EW', '30 Mbps', 20),
  ('50 EW', '50 Mbps', 21)
) as v(nome, velocita, ordine)
where not exists (select 1 from tariffe t where t.nome = v.nome);
