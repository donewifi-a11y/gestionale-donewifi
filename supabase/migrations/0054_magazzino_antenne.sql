-- ★ NUOVA — richiesta esplicita: "il magazzino dei prodotti in modo tale
-- che quando inseriti nei lavori e ticket il conto si aggiorna e impostare
-- un avviso in caso di mancanza" + "inventario delle antenne divise per
-- tipologia e i mac delle antenne che saranno assegnate dal tecnico di
-- analisi di rete". Proposta approvata via artifact (tutte le opzioni
-- consigliate): terza/quarta tab dentro Materiali, correzioni manuali di
-- giacenza/soglia/inventario riservate all'amministratore, avviso in Chat
-- interna al reparto Analisi Rete.

-- ── GIACENZA MATERIALI ──────────────────────────────────────────────────
-- `giacenza` nullable per scelta: null = materiale non tracciato a
-- magazzino (resta puro voce di listino, come tutti i materiali oggi —
-- niente obbligo di censire una giacenza per ogni riga del catalogo).
-- `soglia_minima` nullable allo stesso modo: chi non la imposta non
-- riceve avvisi per quel materiale. `ultimo_avviso_il` evita di spammare
-- la Chat ad ogni scheda salvata mentre si resta sotto soglia.
alter table materiali_magazzino add column if not exists giacenza integer;
alter table materiali_magazzino add column if not exists soglia_minima integer;
alter table materiali_magazzino add column if not exists ultimo_avviso_il timestamptz;

comment on column materiali_magazzino.giacenza is
  'Quantità a magazzino. NULL = materiale non tracciato (resta solo voce di listino, come oggi).';
comment on column materiali_magazzino.soglia_minima is
  'Sotto questa quantità scatta un avviso in Chat al reparto Analisi Rete. NULL = nessun avviso per questo materiale.';

-- ── INVENTARIO ANTENNE (per MAC) ────────────────────────────────────────
-- Le antenne/CPE non si contano a quantità come gli altri materiali: ogni
-- pezzo ha un MAC univoco che finisce fisicamente installato da un
-- cliente preciso — serve sapere non solo "quante ne restano" ma "quali
-- sono già state prenotate per un intervento futuro".
create table if not exists antenne_inventario (
  id uuid primary key default gen_random_uuid(),
  tipologia text not null, -- stessa lista di OPZIONI_INSTALLAZIONE.cpe (src/lib/types.ts)
  mac text not null unique,
  stato text not null default 'Disponibile' check (stato in ('Disponibile', 'Prenotata', 'Installata')),
  -- valorizzato da "Prenotata" in poi: quale Ticket l'ha impegnata.
  ticket_id uuid references tickets(id) on delete set null,
  scheda_lavoro_id uuid references schede_lavoro(id) on delete set null,
  note text,
  creato_da uuid references persone(id),
  creato_il timestamptz not null default now(),
  aggiornato_il timestamptz not null default now()
);

create index if not exists antenne_inventario_tipologia_idx on antenne_inventario (tipologia);
create index if not exists antenne_inventario_stato_idx on antenne_inventario (stato);
create index if not exists antenne_inventario_ticket_id_idx on antenne_inventario (ticket_id);

alter table antenne_inventario enable row level security;
drop policy if exists "staff attivo legge antenne" on antenne_inventario;
create policy "staff attivo legge antenne" on antenne_inventario for select using (is_active_staff());
-- scrittura (aggiunta MAC, prenotazione, correzioni) sempre tramite service
-- role dopo un controllo applicativo (admin per censire/correggere,
-- qualunque staff di Analisi Rete per prenotare) — stesso schema già in
-- uso per eliminaSegnalazione()/eliminaRichiestaCliente(): niente policy
-- insert/update/delete qui, coerente con schede_lavoro (0038).
