-- ★ NUOVA (2026-08-26) — Scheda di Installazione/Lavorazione ora
-- disponibile anche su pose.donewifi.it per i tecnici esterni (prima solo
-- Rapportino, migrazione 0061). Stesso principio di
-- rapportini_intervento.creato_da_tecnico_esterno_id: `schede_lavoro.creato_da`
-- è `references persone(id)` (staff interno), un tecnico esterno non può
-- comparire lì senza violare quella FK — colonna gemella nullable, mai
-- valorizzata insieme all'altra.
alter table schede_lavoro add column creato_da_tecnico_esterno_id uuid references tecnici_esterni(id);
