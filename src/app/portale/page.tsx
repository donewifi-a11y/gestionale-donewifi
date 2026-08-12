import { PortaleTabs } from "@/components/portale/portale-tabs";

export const metadata = { title: "Done Wifi - Area Clienti" };

export default function PortalePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#141414]">
      <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />

      <div className="relative mx-auto min-h-screen max-w-lg px-5 py-10 sm:py-16">
        {/* ★ REBRAND — logo vero (variante bianca, vedi public/brand/) al
        posto dell'icona WiFi generica su sfondo colorato: qui lo sfondo è
        scuro, la variante con wordmark bianco resta leggibile. */}
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/brand/logo-bianco.png" alt="Done Wifi" className="mb-3 h-20 w-20" />
          <p className="text-xs font-bold uppercase tracking-wide text-white/60">Area Clienti</p>
          <p className="mt-2 max-w-xs text-sm text-white/70">Apri una richiesta o verifica lo stato di un ticket esistente.</p>
        </div>
        <PortaleTabs />
      </div>
    </div>
  );
}
