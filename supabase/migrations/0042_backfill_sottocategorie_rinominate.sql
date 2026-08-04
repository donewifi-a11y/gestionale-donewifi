-- ★ CONTROLLO D'ORO — le sottocategoria "Trasferimento impianto" e
-- "Cambio anagrafico" sono state rinominate in "Trasferimento" e "Cambio
-- Anagrafica" nel codice (per farle coincidere col nome della pratica
-- pubblica corrispondente), ma i Ticket già creati con il nome vecchio non
-- erano stati aggiornati: restavano "orfani" della nuova logica (etichette
-- dei campi extra e pre-selezione della pratica pubblica, entrambe indicizzate
-- per stringa esatta). Backfill una tantum.
update tickets set sottocategoria = 'Trasferimento' where sottocategoria = 'Trasferimento impianto';
update tickets set sottocategoria = 'Cambio Anagrafica' where sottocategoria = 'Cambio anagrafico';
