-- non cancellare questa riga di commento

-- ============================================================
-- NUOVA (2026-10-02, audit completezza funzionale — moduli restanti) —
-- una Lavorazione interna (Rete/Ufficio, migrazione 0053) ha uno stato
-- (Da fare/In corso/Fatta) ma nessuna priorità: un responsabile che assegna
-- più lavorazioni allo stesso collega non ha modo di segnalare "questa è
-- urgente, le altre quando hai tempo" — tutte appaiono sullo stesso piano.
-- Due soli livelli (non una scala a 4-5 valori come le priorità Ticket,
-- diverso contesto: qui è lavoro interno, non assistenza clienti con SLA).
-- Default "Normale" per non dover toccare le righe già esistenti.
-- ============================================================
alter table lavorazioni_interne add column if not exists priorita text not null default 'Normale' check (priorita in ('Normale', 'Alta'));

notify pgrst, 'reload schema';
