"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Ticket, PhoneCall, Users2, CalendarDays, HardHat, Archive, Gauge, Users, UserCircle, Menu, X, Tags, ClipboardList } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { PersonaSwitcher } from "@/components/persona-switcher";
import { RicercaGlobale } from "@/components/ricerca-globale";
import type { Persona } from "@/lib/types";

const VOCI_NAV = [
  { href: "/", etichetta: "Mondo Ticket", icona: LayoutGrid, esatto: true },
  { href: "/tickets", etichetta: "Ticket", icona: Ticket, esatto: false },
  { href: "/segnalazioni", etichetta: "Segnalazioni", icona: PhoneCall, esatto: false },
  { href: "/clienti", etichetta: "Clienti", icona: Users2, esatto: false },
  { href: "/calendario", etichetta: "Calendario", icona: CalendarDays, esatto: false },
  { href: "/vista-tecnico", etichetta: "Vista Tecnico", icona: HardHat, esatto: false },
  { href: "/archivio", etichetta: "Archivio", icona: Archive, esatto: false },
  { href: "/dashboard", etichetta: "Dashboard", icona: Gauge, esatto: false },
];

export function AppSidebar({
  email,
  persone,
  personaCorrenteId,
  personaAreaAccesso,
}: {
  email: string;
  persone: Persona[];
  personaCorrenteId: string | null;
  personaAreaAccesso: string | null;
}) {
  const pathname = usePathname();
  const [aperta, setAperta] = useState(false);
  // ★ i link admin (Persone/Utenti) seguono il livello della PERSONA
  // scelta, non più quello dell'account condiviso usato per accedere.
  const isAdmin = personaAreaAccesso === "Tutto" || personaAreaAccesso === "Admin";
  // ★ Tariffe e Richieste Clienti seguono i reparti che le usano nel
  // vecchio gestionale (Commerciale gestiva tariffe/promo, Commerciale
  // e Fatturazione lavoravano le richieste clienti) — oltre agli admin.
  const vedeTariffe = isAdmin || personaAreaAccesso === "Commerciale";
  const vedeRichieste = isAdmin || personaAreaAccesso === "Commerciale" || personaAreaAccesso === "Fatturazione";
  // ★ cruscotti per reparto — un admin vede tutti e tre, chi ha un solo
  // reparto vede solo il proprio.
  const REPARTI_SLUG: { slug: string; reparto: string; etichetta: string }[] = [
    { slug: "analisi-rete", reparto: "Analisi Rete", etichetta: "Dash. Analisi Rete" },
    { slug: "commerciale", reparto: "Commerciale", etichetta: "Dash. Commerciale" },
    { slug: "fatturazione", reparto: "Fatturazione", etichetta: "Dash. Fatturazione" },
  ];
  const dashboardReparti = isAdmin ? REPARTI_SLUG : REPARTI_SLUG.filter((r) => r.reparto === personaAreaAccesso);
  const voci = [
    ...VOCI_NAV,
    ...dashboardReparti.map((r) => ({ href: `/dashboard/${r.slug}`, etichetta: r.etichetta, icona: Gauge, esatto: false })),
    ...(vedeRichieste ? [{ href: "/richieste-clienti", etichetta: "Richieste Clienti", icona: ClipboardList, esatto: false }] : []),
    ...(vedeTariffe ? [{ href: "/tariffe", etichetta: "Tariffe", icona: Tags, esatto: false }] : []),
    ...(isAdmin
      ? [
          { href: "/persone", etichetta: "Persone", icona: UserCircle, esatto: false },
          { href: "/utenti", etichetta: "Utenti", icona: Users, esatto: false },
        ]
      : []),
  ];

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

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {voci.map((voce) => {
          const attivo = voce.esatto ? pathname === voce.href : pathname.startsWith(voce.href);
          const Icona = voce.icona;
          return (
            <Link
              key={voce.href}
              href={voce.href}
              onClick={() => setAperta(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                attivo
                  ? "bg-gradient-to-r from-sidebar-primary to-[color-mix(in_oklch,var(--sidebar-primary),black_20%)] text-sidebar-primary-foreground shadow-md shadow-black/25"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icona className="h-4 w-4 shrink-0" strokeWidth={2.25} />
              {voce.etichetta}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-4 py-4">
        <PersonaSwitcher persone={persone} personaCorrenteId={personaCorrenteId} />
        <div className="mb-3 leading-tight">
          {personaAreaAccesso && (
            <div className="text-[10px] font-bold uppercase tracking-wider text-sidebar-primary">
              {personaAreaAccesso}
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
      <header className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground md:hidden">
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

      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        {contenuto}
      </aside>

      {aperta && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAperta(false)} />
          <aside className="relative flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground shadow-xl">
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