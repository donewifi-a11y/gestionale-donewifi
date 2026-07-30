import { Wifi } from "lucide-react";
import { PortaleTabs } from "@/components/portale/portale-tabs";

export const metadata = { title: "Done Wifi - Area Clienti" };

export default function PortalePage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[oklch(0.22_0.035_255)]">
      <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-32 h-96 w-96 rounded-full bg-[#6E9FDB]/20 blur-3xl" />

      <div className="relative mx-auto min-h-screen max-w-lg px-5 py-10 sm:py-16">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Wifi className="h-6 w-6" strokeWidth={2.5} />
          </div>
          <h1 className="font-heading text-2xl font-bold text-white">
            Done<span className="text-[#8FB3EA]">Wifi</span> — Area Clienti
          </h1>
          <p className="mt-2 max-w-xs text-sm text-white/70">Apri una richiesta o verifica lo stato di un ticket esistente.</p>
        </div>
        <PortaleTabs />
      </div>
    </div>
  );
}
