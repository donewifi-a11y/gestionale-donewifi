import { Sora, Manrope, Space_Mono } from "next/font/google";

// ★ NUOVA (2026-08-26) — identità tipografica propria per pose.donewifi.it
// (Opzione "1 · Segnale" scelta tra 3 proposte con artifact): Sora per i
// titoli, Manrope per il corpo, Space Mono per badge/numeri — deliberatamente
// diversa da Geist (gestionale interno, layout.tsx radice). Un solo layout
// qui invece di ripetere i font in ogni pagina di pose.
const sora = Sora({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-pose-display" });
const manrope = Manrope({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-pose-body" });
const spaceMono = Space_Mono({ subsets: ["latin"], weight: ["700"], variable: "--font-pose-mono" });

export default function PoseLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${sora.variable} ${manrope.variable} ${spaceMono.variable} min-h-screen [font-family:var(--font-pose-body)]`}>
      {children}
    </div>
  );
}
