-- ============================================================
-- Storage — bucket privato per i documenti caricati dal cliente nel
-- modulo pubblico "Richiesta Dati". Privato perché l'accesso ai file
-- passa sempre dall'API server-side (service role / URL firmati),
-- mai da una policy pubblica diretta.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('documenti', 'documenti', false)
on conflict (id) do nothing;