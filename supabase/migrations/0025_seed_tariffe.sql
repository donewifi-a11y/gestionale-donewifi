-- Catalogo Tariffe popolato dalle famiglie commerciali reali trovate
-- nell'anagrafica Aruba (58 nomi di profilo grezzi raggruppati in 15),
-- senza prezzo mensile (da compilare a mano in "Tariffe" — non deducibile
-- con certezza dalle fatture, che includono anche una tantum/promo/altri
-- servizi). Idempotente: non duplica se rieseguita.

insert into tariffe (nome, tipologia_cliente, velocita, prezzo_mensile, descrizione, attivo, ordine)
select v.nome, 'Tutti', v.velocita, null, null, true, v.ordine
from (values
  ('10 HW', '10 Mbps', 1),
  ('30 HW', '30 Mbps', 2),
  ('50 HW', '50 Mbps', 3),
  ('100 HW', '100 Mbps', 4),
  ('10 BW', '10 Mbps', 5),
  ('30 BW', '30 Mbps', 6),
  ('50 BW', '50 Mbps', 7),
  ('100 BW', '100 Mbps', 8),
  ('100 EW', '100 Mbps', 9),
  ('Business 30', '30 Mbps', 10),
  ('Connect Ultra', null, 11),
  ('Connect Telemetria', null, 12),
  ('Buy & Go', null, 13),
  ('DoneSociale', null, 14),
  ('Fttc Home', null, 15)
) as v(nome, velocita, ordine)
where not exists (select 1 from tariffe t where t.nome = v.nome);
