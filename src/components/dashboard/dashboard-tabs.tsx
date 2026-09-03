"use client";

import { useState, type ReactNode } from "react";

export interface TabDashboard {
  chiave: string;
  etichetta: string;
  contenuto: ReactNode;
}

/** ★ NUOVA (2026-09-03, "meno voci di menu possibili" — artifact "Meno
 * Voci nel Menu", confermata) — "Dashboard generale" e le Dashboard per
 * reparto erano 4 voci di menu separate che mostrano la stessa cosa
 * (statistiche) filtrata diversamente — un pattern già visto e già risolto
 * altrove nel gestionale (Persone/Utenti/Tecnici esterni, un'unica pagina a
 * tab). Il contenuto di ciascun tab arriva già pronto dal Server Component
 * chiamante (`dashboard/page.tsx`, che fa tutte le query pesanti) — questo
 * componente sa solo quale mostrare, non fa mai fetching lui stesso. */
export function DashboardTabs({ tabs }: { tabs: TabDashboard[] }) {
  const [attivo, setAttivo] = useState(tabs[0]?.chiave ?? "");

  if (tabs.length <= 1) return <>{tabs[0]?.contenuto}</>;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-1 rounded-full border bg-card p-1 shadow-sm print:hidden">
        {tabs.map((t) => (
          <button
            key={t.chiave}
            type="button"
            onClick={() => setAttivo(t.chiave)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
              attivo === t.chiave ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.etichetta}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.chiave} hidden={attivo !== t.chiave}>
          {t.contenuto}
        </div>
      ))}
    </div>
  );
}
