import Link from "next/link";
import { Gift } from "lucide-react";

const SCHEDE = [
  { id: "coupon", href: "/fortuna", etichetta: "Coupon", soloAdmin: false },
  { id: "campagne", href: "/fortuna/campagne", etichetta: "Campagne e prodotti", soloAdmin: true },
  { id: "qr", href: "/fortuna/qr", etichetta: "QR di partecipazione", soloAdmin: false },
] as const;

/** ★ NUOVA — intestazione condivisa del modulo Fortuna (stesso stile di Tariffe) con le schede. */
export function FortunaIntestazione({ attiva, isAdmin }: { attiva: (typeof SCHEDE)[number]["id"]; isAdmin: boolean }) {
  return (
    <div className="mb-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <Gift className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Fortuna</h1>
          <p className="text-sm text-muted-foreground">Il concorso «Tenta la fortuna» di fortuna.donewifi.it: coupon, campagne e premi.</p>
        </div>
      </div>
      <nav className="flex gap-1 border-b">
        {SCHEDE.filter((s) => isAdmin || !s.soloAdmin).map((s) => (
          <Link
            key={s.id}
            href={s.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${s.id === attiva ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {s.etichetta}
          </Link>
        ))}
      </nav>
    </div>
  );
}
