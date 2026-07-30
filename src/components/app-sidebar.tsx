"use client";

import { useMemo, useState } from "react";
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
  ClipboardList,
  LayoutGrid,
  BarChart3,
  UsersRound,
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
}

interface Mondo {
  id: string;
  etichetta: string;
  icona: typeof Ticket;
  voci: VoceNav[];
}

export function AppSidebar({
  email,
  persone,
  personaCorrenteId,
  personaAmministratore,
  personaReparti,
}: {
  email: string;
  persone: Persona[];
  personaCorrenteId: string | null;
  personaAmministratore: boolean;
  personaReparti: AreaAccesso[];
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

  // ★ NUOVA — la sidebar è ora divisa in "mondi" (tab laterali): invece di
  // un'unica lista fino a 15 voci, ogni mondo ha le proprie 4-7 voci. Un
  // mondo compare solo se l'utente ha almeno una voce da vederci dentro.
  const mondi: Mondo[] = useMemo(() => {
    const lista: Mondo[] = [
      {
        id: "ticket",
        etichetta: "Mondo Ticket",
        icona: LayoutGrid,
        voci: [
          { href: "/", etichetta: "Mondo Ticket", icona: LayoutGrid, esatto: true },
          { href: "/tickets", etichetta: "Ticket", icona: Ticket },
          { href: "/segnalazioni", etichetta: "Segnalazioni", icona: PhoneCall },
          { href: "/clienti", etichetta: "Clienti", icona: Users2 },
          { href: "/calendario", etichetta: "Calendario", icona: CalendarDays },
          { href: "/vista-tecnico", etichetta: "Vista Tecnico", icona: HardHat },
          { href: "/archivio", etichetta: "Archivio", icona: Archive },
        ],
      },
      {
        id: "business",
        etichetta: "Mondo Business",
        icona: BarChart3,
        voci: [
          { href: "/dashboard", etichetta: "Dashboard generale", icona: Gauge },
          ...dashboardReparti.map((r) => ({ href: `/dashboard/${r.slug}`, etichetta: r.etichetta, icona: Gauge })),
          ...(vedeRichieste ? [{ href: "/richieste-clienti", etichetta: "Richieste Clienti", icona: ClipboardList }] : []),
          ...(vedeTariffe ? [{ href: "/tariffe", etichetta: "Tariffe", icona: Tags }] : []),
        ],
      },
      {
        id: "team",
        etichetta: "Mondo Team",
        icona: UsersRound,
        // ★ "Utenti" (account condivisi) non è più promosso qui: dal login
        // individuale, l'accesso vero passa da Persone — Utenti resta
        // raggiungibile su /utenti per chi lo conosce già, solo non in menu.
        voci: isAdmin ? [{ href: "/persone", etichetta: "Persone", icona: UserCircle }] : [],
      },
    ];
    return lista.filter((m) => m.voci.length > 0);
  }, [dashboardReparti, vedeRichieste, vedeTariffe, isAdmin]);

  // ★ il mondo attivo segue la pagina corrente (es. aprendo /tariffe si
  // apre già "Mondo Business"), con ricordo della scelta manuale sopra.
  const mondoDaPercorso = useMemo(() => {
    for (const m of mondi) {
      if (m.voci.some((v) => (v.esatto ? pathname === v.href : pathname.startsWith(v.href)))) return m.id;
    }
    return mondi[0]?.id ?? "ticket";
  }, [pathname, mondi]);
  const [mondoScelto, setMondoScelto] = useState<string | null>(null);
  const mondoAttivoId = mondoScelto ?? mondoDaPercorso;
  const mondoAttivo = mondi.find((m) => m.id === mondoAttivoId) ?? mondi[0];

  const contenuto = (
    <>
      <div className="flex items-center gap-2.5 px-4 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sidebar-primary to-[color-mix(in_oklch,var(--sidebar-primary),black_25%)] text-sm font-bold text-sidebar-primary-foreground shadow-md shadow-black/30">
          DW
        </div>
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

      <div className="flex flex-1 overflow-hidden">
        {/* ★ rail dei "mondi" — tab laterali, sempre visibili */}
        <div className="flex w-16 shrink-0 flex-col items-center gap-1.5 border-r border-sidebar-border px-1.5 pt-1">
          {mondi.map((m) => {
            const Icona = m.icona;
            const attivo = m.id === mondoAttivoId;
            return (
              <button
                key={m.id}
                onClick={() => setMondoScelto(m.id)}
                title={m.etichetta}
                className={`flex w-full flex-col items-center gap-1 rounded-lg py-2.5 text-center transition ${
                  attivo
                    ? "bg-gradient-to-b from-sidebar-primary to-[color-mix(in_oklch,var(--sidebar-primary),black_20%)] text-sidebar-primary-foreground shadow-md shadow-black/25"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icona className="h-4 w-4 shrink-0" strokeWidth={2.25} />
                <span className="text-[9px] font-bold leading-tight">{m.etichetta.replace("Mondo ", "")}</span>
              </button>
            );
          })}
        </div>

        {/* ★ voci del mondo selezionato */}
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2.5 pt-1">
          <div className="mb-1 px-1.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40">
            {mondoAttivo?.etichetta}
          </div>
          {mondoAttivo?.voci.map((voce) => {
            const attivo = voce.esatto ? pathname === voce.href : pathname.startsWith(voce.href);
            const Icona = voce.icona;
            return (
              <Link
                key={voce.href}
                href={voce.href}
                onClick={() => setAperta(false)}
                className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition ${
                  attivo
                    ? "bg-gradient-to-r from-sidebar-primary to-[color-mix(in_oklch,var(--sidebar-primary),black_20%)] text-sidebar-primary-foreground shadow-md shadow-black/25"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icona className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                <span className="truncate">{voce.etichetta}</span>
              </Link>
            );
          })}
        </nav>
      </div>

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
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-sidebar-primary to-[color-mix(in_oklch,var(--sidebar-primary),black_25%)] text-[11px] font-bold text-sidebar-primary-foreground shadow-md shadow-black/30">
          DW
        </div>
        <span className="font-heading text-sm font-bold">
          Done<span className="text-sidebar-primary">Wifi</span>
        </span>
      </header>

      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex print:hidden">
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
