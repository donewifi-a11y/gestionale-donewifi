"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Ticket, PhoneCall, CalendarDays, Users, Menu, X } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";

const VOCI_NAV = [
  { href: "/", etichetta: "Centro Operativo", icona: LayoutGrid, esatto: true },
  { href: "/tickets", etichetta: "Ticket", icona: Ticket, esatto: false },
  { href: "/segnalazioni", etichetta: "Segnalazioni", icona: PhoneCall, esatto: false },
  { href: "/calendario", etichetta: "Calendario", icona: CalendarDays, esatto: false },
];

export function AppSidebar({ email, areaAccesso }: { email: string; areaAccesso: string }) {
  const pathname = usePathname();
  const [aperta, setAperta] = useState(false);
  const isAdmin = areaAccesso === "Tutto" || areaAccesso === "Admin";
  const voci = isAdmin
    ? [...VOCI_NAV, { href: "/utenti", etichetta: "Utenti", icona: Users, esatto: false }]
    : VOCI_NAV;

  const contenuto = (
    <>
      <div className="flex items-center gap-2.5 px-4 py-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
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
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
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
        <div className="mb-3 leading-tight">
          <div className="truncate text-xs font-medium text-sidebar-foreground/90">{email}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-sidebar-primary">
            {areaAccesso}
          </div>
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
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar-primary text-[11px] font-bold text-sidebar-primary-foreground">
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