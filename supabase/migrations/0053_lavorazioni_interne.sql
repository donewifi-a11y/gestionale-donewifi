-- ★ NUOVA — richiesta esplicita: lavorazioni interne (non pratiche
-- cliente) divise in due categorie fisse — Rete (ponti radio, BS,
-- postazioni) e Ufficio — assegnabili da un amministratore ad altro
-- staff, con promemoria se restano ferme troppo a lungo. Tabella nuova e
-- separata da todo_personali (quello resta appunti privati leggeri senza
-- categoria/assegnazione/promemoria — vedi README per il perché di questa
-- scelta): qui è lavoro formale del team, tracciato, con responsabilità.
--
-- ★ Niente scadenza (richiesta esplicita: "non metterei tempistiche"): il
-- promemoria si basa sul tempo trascorso da quando è stata creata, non su
-- una data di scadenza — stesso principio già in uso per "Ferma da Ng" in
-- Segnalazioni/Ticket.
create table if not exists lavorazioni_interne (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in ('Rete', 'Ufficio')),
  titolo text not null,
  descrizione text,
  assegnato_a uuid not null references persone(id) on delete cascade,
  assegnato_da uuid not null references persone(id) on delete cascade,
  stato text not null default 'Da fare' check (stato in ('Da fare', 'In corso', 'Fatta')),
  creato_il timestamptz not null default now(),
  completato_il timestamptz,
  ultimo_promemoria_il timestamptz
);

create index if not exists lavorazioni_interne_assegnato_a on lavorazioni_interne (assegnato_a, stato);
create index if not exists lavorazioni_interne_assegnato_da on lavorazioni_interne (assegnato_da);

alter table lavorazioni_interne enable row level security;

-- ★ SELECT: chi la deve fare, o chi l'ha assegnata (per seguirne l'esito) —
-- la vista "tutte le lavorazioni di tutti" per l'amministratore passa dalla
-- service role in pagina (stesso pattern già in uso altrove in questo
-- progetto), non da una policy RLS più larga: evita di introdurre una
-- nuova funzione is_admin() lato SQL solo per questo caso.
drop policy if exists "vede le proprie lavorazioni" on lavorazioni_interne;
create policy "vede le proprie lavorazioni" on lavorazioni_interne for select using (
  is_active_staff() and (assegnato_a = persona_corrente_id() or assegnato_da = persona_corrente_id())
);

-- ★ INSERT: solo auto-assegnazione dal client normale (assegnato_a =
-- assegnato_da = se stessi) — assegnare una lavorazione a un'altra persona
-- richiede essere amministratore, controllato in app e scritto con la
-- service role (stesso schema di eliminaSegnalazione/eliminaRichiestaCliente).
drop policy if exists "crea proprie lavorazioni" on lavorazioni_interne;
create policy "crea proprie lavorazioni" on lavorazioni_interne for insert with check (
  is_active_staff() and assegnato_a = persona_corrente_id() and assegnato_da = persona_corrente_id()
);

-- ★ UPDATE: sia chi la deve fare (cambia stato) sia chi l'ha assegnata
-- (può correggere/riassegnare) — l'app decide quali campi mostrare
-- modificabili a chi, la RLS qui protegge solo "una lavorazione estranea".
drop policy if exists "aggiorna le proprie lavorazioni" on lavorazioni_interne;
create policy "aggiorna le proprie lavorazioni" on lavorazioni_interne for update using (
  is_active_staff() and (assegnato_a = persona_corrente_id() or assegnato_da = persona_corrente_id())
) with check (
  is_active_staff() and (assegnato_a = persona_corrente_id() or assegnato_da = persona_corrente_id())
);

-- ★ nessuna policy DELETE: l'eliminazione (solo amministratore) passa
-- sempre dalla service role dopo un controllo in app, stesso schema già
-- usato per Segnalazioni/Richieste Cliente.
