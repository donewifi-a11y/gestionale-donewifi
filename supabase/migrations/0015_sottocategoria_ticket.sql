-- ============================================================
-- Sottocategorie Ticket — ex 14 categorie puntuali del vecchio
-- gestionale (es. "Assistenza: Internet assente"), qui come dettaglio
-- facoltativo affiancato alla categoria principale (Assistenza/
-- Commerciale/Amministrativa) invece di sostituirla: i filtri e la
-- mappatura reparto restano semplici, il dettaglio resta disponibile.
-- ============================================================
alter table tickets add column if not exists sottocategoria text;
