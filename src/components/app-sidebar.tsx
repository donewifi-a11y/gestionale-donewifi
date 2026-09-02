"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Ticket,
  PhoneCall,
  Users2,
  CalendarDays,
  HardHat,
  Archive,
  Gauge,
  UserCircle,
  Menu,
  X,
  Tags,
  Boxes,
  ClipboardList,
  LayoutGrid,
  BarChart3,
  UsersRound,
  MessageCircle,
  ListChecks,
  ShieldCheck,
  FileText,
  Wrench,
  ChevronRight,
} from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { PersonaSwitcher } from "@/components/persona-switcher";
import { RicercaGlobale } from "@/components/ricerca-globale";
import type { AreaAccesso, Persona } from "@/lib/types";

interface VoceNav {
  href: string;
  etichetta: string;
  icona: typeof Ticket;
  esatto?: boolean;
  // ★ NUOVA (2026-08) — richiesta esplicita (audit grafico completo): nel
  // mondo "Team", "Lavorazioni Interne" (lavoro operativo, visibile a
  // chiunque) e "Persone"/"Stato Sistema" (amministrazione) stavano nella
  // stessa lista piatta senza nessuna separazione — un divisore leggero
  // dopo questa voce basta a distinguerli senza bisogno di un sesto
  // "mondo" per una manciata di pagine.
  separatoreDopo?: boolean;
}

interface Mondo {
  id: string;
  etichetta: string;
  icona: typeof Ticket;
  voci: VoceNav[];
  // ★ NUOVA (2026-09-01, richiesta esplicita: "icone laterali colorate e non
  // bianche" — proposta con artifact "Sidebar: Icone e Affordance", scelta
  // la "2 · Barra colorata laterale") — un colore identitario per mondo,
  // usato su icona/barra/freccia dell'intestazione (mai sul testo, resta
  // sempre bianco/grigio come il resto della sidebar).
  accento: string;
}

export function AppSidebar({
  email,
  persone,
  personaCorrenteId,
  personaAmministratore,
  personaReparti,
  onApriChat,
  onApriTodo,
  nonLettiChat = 0,
  todoDaFare = 0,
}: {
  email: string;
  persone: Persona[];
  personaCorrenteId: string | null;
  personaAmministratore: boolean;
  personaReparti: AreaAccesso[];
  onApriChat?: () => void;
  onApriTodo?: () => void;
  nonLettiChat?: number;
  todoDaFare?: number;
}) {
  const pathname = usePathname();
  const [aperta, setAperta] = useState(false);

  const isAdmin = personaAmministratore;
  const vedeTariffe = isAdmin || personaReparti.includes("Commerciale");
  const vedeRichieste = isAdmin || personaReparti.includes("Commerciale") || personaReparti.includes("Fatturazione");

  const REPARTI_SLUG: { slug: string; reparto: AreaAccesso; etichetta: string }[] = [
    { slug: "analisi-rete", reparto: "Analisi Rete", etichetta: "Dashboard Analisi Rete" },
    { slug: "commerciale", reparto: "Commerciale", etichetta: "Dashboard Commerciale" },
    { slug: "fatturazione", reparto: "Fatturazione", etichetta: "Dashboard Fatturazione" },
  ];
  const dashboardReparti = isAdmin ? REPARTI_SLUG : REPARTI_SLUG.filter((r) => personaReparti.includes(r.reparto));

  // ★ RIORGANIZZATA (2026-08) — richiesta esplicita: la sidebar era
  // "caotica", in particolare "Mondo Business" era un cassetto con dentro
  // 4 concetti diversi (analisi, vendita, cataloghi, anagrafiche) mescolati
  // solo perché "non erano Ticket", e "Mondo Team" mischiava organico
  // (Persone) e strumento tecnico (Stato Sistema). Proposta con artifact,
  // confermata: 5 mondi, ognuno risponde a UNA sola domanda —
  // Assistenza = "sto lavorando una pratica sul campo?", Vendita = "sto
  // vendendo o gestendo un cliente?", Clienti = "chi è questo cliente?",
  // Analisi = "come vanno le cose?", Team = solo amministratori.
  // Segnalazioni si sposta da Assistenza a Vendita (è un contatto
  // commerciale, non un ticket di assistenza); Materiali si sposta vicino a
  // Calendario/Vista Tecnico in Assistenza (catalogo dei tecnici, non
  // strumento di vendita).
  //
  // ★ RIVISTA ANCORA (2026-08) — richiesta esplicita, proposta con
  // artifact: "Segnalazioni" ridiventa "Nuovi Clienti" (era ambiguo: quella
  // pagina gestisce solo i contatti NUOVI, non un cliente già esistente).
  // "Richieste Clienti" si sposta qui in Vendita (prima era in Assistenza
  // solo perché nasceva spesso da un Ticket) e diventa "Gestione Cliente":
  // le pratiche di un cliente esistente (Trasferimento/Cambio IBAN/Cambio
  // Anagrafica/Subentro/Disdetta) sono lavoro commerciale-amministrativo,
  // non assistenza tecnica sul campo — le due voci "Nuovi Clienti" e
  // "Gestione Cliente" ora coprono insieme tutto il ciclo di vita del
  // rapporto con un cliente, fianco a fianco nello stesso mondo.
  const mondi: Mondo[] = useMemo(() => {
    const lista: Mondo[] = [
      {
        id: "assistenza",
        etichetta: "Assistenza",
        icona: LayoutGrid,
        accento: "#FF9F43",
        voci: [
          { href: "/", etichetta: "Assistenza", icona: LayoutGrid, esatto: true },
          { href: "/tickets", etichetta: "Ticket", icona: Ticket },
          { href: "/vista-tecnico", etichetta: "Vista Tecnico", icona: HardHat },
          { href: "/calendario", etichetta: "Calendario", icona: CalendarDays },
          { href: "/materiali", etichetta: "Materiali", icona: Boxes },
          { href: "/archivio", etichetta: "Archivio", icona: Archive },
        ],
      },
      {
        id: "vendita",
        etichetta: "Vendita",
        icona: PhoneCall,
        accento: "#4FD1C5",
        // ★ FIX (2026-08) — richiesta esplicita, proposta con artifact:
        // "Segnalazioni" era in realtà solo il flusso NUOVI contatti, nome
        // ambiguo per chi cercava dove gestire un cliente già esistente
        // (Trasferimento/Cambio IBAN/Cambio Anagrafica/Subentro — che
        // scrivono già tutti in richieste_clienti, vedi Passo 3 sotto).
        // "Richieste Clienti" si sposta qui da Assistenza (era lì solo
        // perché nasce spesso da un Ticket, ma concettualmente è lavoro
        // commerciale/fatturazione su un cliente, non assistenza tecnica) e
        // cambia nome — stesse pagine, stessi indirizzi (/segnalazioni,
        // /richieste-clienti), zero rischio.
        voci: [
          { href: "/segnalazioni", etichetta: "Nuovi Clienti", icona: PhoneCall },
          ...(vedeRichieste ? [{ href: "/richieste-clienti", etichetta: "Gestione Cliente", icona: ClipboardList }] : []),
          ...(vedeTariffe ? [{ href: "/preventivi", etichetta: "Preventivi", icona: FileText }] : []),
          ...(vedeTariffe ? [{ href: "/tariffe", etichetta: "Tariffe", icona: Tags }] : []),
        ],
      },
      {
        id: "clienti",
        etichetta: "Clienti",
        icona: Users2,
        accento: "#A78BFA",
        // ★ FIX (2026-08) — "Clienti" e "Anagrafica Clienti" erano due voci
        // quasi omonime senza indizio su quale aprire (proposta con
        // artifact, Opzione B scelta): l'Anagrafica ora è una tab dentro
        // "Clienti" (vedi clienti-board.tsx), non più una voce a sé — resta
        // comunque raggiungibile da /clienti-esterni per i link diretti già
        // in giro, semplicemente non più nel menu.
        voci: [{ href: "/clienti", etichetta: "Clienti", icona: Users2 }],
      },
      {
        id: "analisi",
        etichetta: "Analisi",
        icona: BarChart3,
        accento: "#60A5FA",
        voci: [
          { href: "/dashboard", etichetta: "Dashboard generale", icona: Gauge },
          ...dashboardReparti.map((r) => ({ href: `/dashboard/${r.slug}`, etichetta: r.etichetta, icona: Gauge })),
        ],
      },
      {
        id: "team",
        etichetta: "Team",
        icona: UsersRound,
        accento: "#F472B6",
        // ★ NUOVA — "Team" non è più "solo amministratori": Lavorazioni
        // Interne (Rete/Ufficio, assegnabili da un admin ad altro staff)
        // deve essere visibile a chiunque abbia lavorazioni assegnate, non
        // solo a chi le assegna. Persone/Stato Sistema restano riservate
        // agli amministratori (ogni pagina si protegge comunque da sola
        // lato server, questo è solo cosa compare nel menu).
        // ★ "Utenti" (account condivisi) e "Tecnici esterni" (account
        // pose.donewifi.it) non sono più voci a sé qui: sono tab dentro
        // "Persone" (vedi PersoneBoard) — richiesta esplicita "rendere
        // univoci i posti dove aprire le diverse sezioni", artifact "Audit
        // Ingressi". /utenti e /tecnici-esterni restano raggiungibili per
        // chi ha un link salvato, ma ora reindirizzano qui.
        voci: [
          { href: "/lavorazioni", etichetta: "Lavorazioni Interne", icona: Wrench, separatoreDopo: isAdmin },
          ...(isAdmin
            ? [
                { href: "/persone", etichetta: "Persone", icona: UserCircle },
                { href: "/sistema", etichetta: "Stato Sistema", icona: ShieldCheck },
              ]
            : []),
        ],
      },
    ];
    return lista.filter((m) => m.voci.length > 0);
  }, [dashboardReparti, vedeRichieste, vedeTariffe, isAdmin]);

  // ★ il mondo della pagina corrente (es. aprendo /tariffe è "Vendita") —
  // usato per tenere la sua sezione già aperta nell'accordion sotto.
  const mondoDaPercorso = useMemo(() => {
    for (const m of mondi) {
      if (m.voci.some((v) => (v.esatto ? pathname === v.href : pathname.startsWith(v.href)))) return m.id;
    }
    return mondi[0]?.id ?? "ticket";
  }, [pathname, mondi]);

  // ★ RIORGANIZZATA (2026-09-01, richiesta esplicita: "ottimizza... rendi
  // molto più semplice e ottimizzato il sistema e la navigazione nei menu e
  // sottomenu" — proposta con artifact "Navigazione: Due Proposte", scelta
  // la "A · Sidebar unica ad accordion") — il binario di icone + pannello
  // separato (due click per raggiungere una pagina di un altro mondo, ed
  // etichette del binario leggibili solo a 9px) lascia il posto a un unico
  // elenco verticale con sezioni pieghevoli: un click in meno per mondo, e
  // niente più testo minuscolo da decifrare. La sezione del mondo corrente
  // è aperta di default; le altre restano chiuse ma sempre visibili come
  // intestazione — aprirne un'altra non richiude quella attuale, così si
  // può confrontare voci di due mondi diversi senza perdere il posto.
  const [gruppiAperti, setGruppiAperti] = useState<Set<string>>(() => new Set([mondoDaPercorso]));
  // ★ un vero cambio pagina (pathname diverso, da un Link o dalla ricerca
  // globale) apre la sezione della nuova pagina se non lo è già — non
  // richiude le altre che l'utente avesse aperto a mano.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizza con la navigazione (pathname cambiato da un Link/dalla ricerca globale), non derivabile durante il render: qui l'intento è proprio "la sezione della pagina in cui sei ora è sempre aperta".
    setGruppiAperti((prev) => {
      if (prev.has(mondoDaPercorso)) return prev;
      return new Set(prev).add(mondoDaPercorso);
    });
  }, [mondoDaPercorso]);

  function toggleGruppo(id: string) {
    setGruppiAperti((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const contenuto = (
    <>
      {/* ★ REBRAND — logo vero (variante marchio-solo, colorata) al posto
      del badge di testo "DW" — vedi public/brand/. */}
      <div className="flex items-center gap-2.5 px-4 py-5">
        <img src="/brand/logo-marchio.png" alt="" className="h-9 w-9 shrink-0" />
        <div className="leading-tight">
          <div className="font-heading text-sm font-bold text-sidebar-foreground">
            Done<span className="text-sidebar-primary">Wifi</span>
          </div>
          <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
            Gestionale CRM
          </div>
        </div>
      </div>

      <RicercaGlobale />

      {/* ★ un solo elenco verticale, sezioni pieghevoli invece di
      binario-icone-poi-pannello — vedi commento sopra su gruppiAperti. */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pt-1">
        {mondi.map((m) => {
          const Icona = m.icona;
          const aperto = gruppiAperti.has(m.id);
          const contieneAttivo = m.id === mondoDaPercorso;
          return (
            <div key={m.id} className="pb-0.5" style={{ "--accento": m.accento } as React.CSSProperties}>
              <button
                onClick={() => toggleGruppo(m.id)}
                aria-expanded={aperto}
                className={`group relative flex w-full items-center gap-2 rounded-lg py-2 pl-4 pr-2 text-left text-[11px] font-bold uppercase tracking-wider transition ${
                  contieneAttivo ? "text-sidebar-foreground/85" : "text-sidebar-foreground/45 hover:text-sidebar-foreground/70"
                } ${aperto ? "bg-[color-mix(in_oklch,var(--accento)_16%,transparent)]" : "hover:bg-sidebar-accent"}`}
              >
                {/* ★ barra colorata a sinistra, sempre visibile (più accesa
                quando la sezione è aperta o in hover) — segnala "sono un
                pulsante" anche a riposo, non solo passandoci sopra. */}
                <span
                  aria-hidden
                  className={`absolute bottom-1.5 left-1 top-1.5 w-[3px] rounded-full bg-[var(--accento)] transition-opacity ${
                    aperto ? "opacity-100" : "opacity-55 group-hover:opacity-100"
                  }`}
                />
                <Icona className="h-3.5 w-3.5 shrink-0 text-[var(--accento)]" strokeWidth={2.25} />
                <span className="flex-1 truncate">{m.etichetta}</span>
                <ChevronRight
                  className={`h-3 w-3 shrink-0 transition-transform ${aperto ? "rotate-90 text-[var(--accento)]" : "text-sidebar-foreground/40"}`}
                  strokeWidth={2.5}
                />
              </button>
              {aperto && (
                <div className="flex flex-col gap-0.5 py-0.5 pl-3.5">
                  {m.voci.map((voce) => {
                    const attivo = voce.esatto ? pathname === voce.href : pathname.startsWith(voce.href);
                    const IconaVoce = voce.icona;
                    return (
                      <div key={voce.href}>
                        <Link
                          href={voce.href}
                          onClick={() => setAperta(false)}
                          className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition ${
                            attivo
                              ? "bg-gradient-to-r from-sidebar-primary to-[color-mix(in_oklch,var(--sidebar-primary),black_20%)] text-sidebar-primary-foreground shadow-md shadow-black/25"
                              : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          }`}
                        >
                          <IconaVoce className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                          <span className="truncate">{voce.etichetta}</span>
                        </Link>
                        {voce.separatoreDopo && (
                          <div className="my-1.5 flex items-center gap-1.5 px-1.5">
                            <div className="h-px flex-1 bg-sidebar-border" />
                            <span className="text-[9px] font-bold uppercase tracking-wider text-sidebar-foreground/35">Amministrazione</span>
                            <div className="h-px flex-1 bg-sidebar-border" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ★ FIX — pulsanti Chat/To-Do poco scoperti (11px, in fondo, sotto
      la navigazione, nessun segnale oltre al badge): ora più grandi, con
      sfondo pieno invece di solo bordo (visibili anche senza hover) e
      un'etichetta di sezione sopra, stesso trattamento della navigazione
      principale invece di un dettaglio secondario facile da non notare. */}
      {personaCorrenteId && (onApriChat || onApriTodo) && (
        <div className="border-t border-sidebar-border px-2.5 pb-1 pt-3">
          <div className="mb-1.5 px-1.5 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40">Strumenti</div>
          <div className="flex gap-2">
            {/* ★ FIX (2026-08-27, "facciamo la B") — nascosto da xl in su:
            la rail Comunicazioni fissa (app-shell.tsx) copre già lo stesso
            bisogno lì, un secondo modo di aprire la stessa chat sarebbe
            ridondante e confusionario (due chat visibili insieme). */}
            {onApriChat && (
              <button
                onClick={onApriChat}
                className="relative flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sidebar-accent/60 py-2.5 text-xs font-bold text-sidebar-foreground/85 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground xl:hidden"
              >
                <MessageCircle className="h-4 w-4" strokeWidth={2.25} />
                Chat
                {nonLettiChat > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {nonLettiChat}
                  </span>
                )}
              </button>
            )}
            {onApriTodo && (
              <button
                onClick={onApriTodo}
                className="relative flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sidebar-accent/60 py-2.5 text-xs font-bold text-sidebar-foreground/85 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <ListChecks className="h-4 w-4" strokeWidth={2.25} />
                To-Do
                {todoDaFare > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                    {todoDaFare}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      )}
      <div className="border-t border-sidebar-border px-4 py-4">
        <PersonaSwitcher persone={persone} personaCorrenteId={personaCorrenteId} />
        <div className="mb-3 leading-tight">
          {(isAdmin || personaReparti.length > 0) && (
            <div className="text-[10px] font-bold uppercase tracking-wider text-sidebar-primary">
              {isAdmin ? "Amministratore" : personaReparti.join(" · ")}
            </div>
          )}
          <div className="truncate text-[11px] text-sidebar-foreground/50">{email}</div>
        </div>
        <LogoutButton />
      </div>
    </>
  );

  return (
    <>
      <header className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden print:hidden">
        <button
          onClick={() => setAperta(true)}
          aria-label="Apri il menu"
          className="rounded-md p-1.5 hover:bg-sidebar-accent"
        >
          <Menu className="h-5 w-5" />
        </button>
        <img src="/brand/logo-marchio.png" alt="" className="h-7 w-7 shrink-0" />
        <span className="font-heading text-sm font-bold">
          Done<span className="text-sidebar-primary">Wifi</span>
        </span>
      </header>

      {/* ★ FIX — richiesta esplicita: la sidebar smetteva di restare
      visibile scorrendo una pagina lunga (es. Materiali) — "sticky" in un
      layout flex-row può perdere l'ancoraggio a seconda di come cresce il
      contenuto accanto, un comportamento fragile da CSS a CSS. "fixed"
      la toglie del tutto dal flusso normale e la ancora al viewport senza
      condizioni: resta sempre visibile qualunque cosa faccia il resto
      della pagina. `<main>` (app-shell.tsx) riserva lo spazio con
      `md:ml-72`, stessa larghezza di questa sidebar (w-72). */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden h-screen w-72 flex-col bg-sidebar text-sidebar-foreground md:flex print:hidden">
        {contenuto}
      </aside>

      {aperta && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAperta(false)} />
          <aside className="relative flex h-full w-72 flex-col bg-sidebar text-sidebar-foreground shadow-xl">
            <button
              onClick={() => setAperta(false)}
              aria-label="Chiudi il menu"
              className="absolute right-3 top-4 rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
            >
              <X className="h-4 w-4" />
            </button>
            {contenuto}
          </aside>
        </div>
      )}
    </>
  );
}
