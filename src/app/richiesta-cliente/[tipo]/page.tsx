import { notFound } from "next/navigation";
import { RichiestaClienteForm } from "@/components/richiesta-cliente/richiesta-cliente-form";
import { RICHIESTE_CLIENTE_CONFIG, SLUG_RICHIESTE_CLIENTE, type SlugRichiestaCliente } from "@/lib/richieste-cliente-config";

export default async function RichiestaClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ tipo: string }>;
  searchParams: Promise<{ ticketId?: string; praticaId?: string }>;
}) {
  const { tipo } = await params;
  const { ticketId, praticaId } = await searchParams;

  if (!SLUG_RICHIESTE_CLIENTE.includes(tipo as SlugRichiestaCliente)) notFound();
  const config = RICHIESTE_CLIENTE_CONFIG[tipo as SlugRichiestaCliente];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#141414]">
      <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />

      <div className="relative mx-auto min-h-screen max-w-lg px-5 py-10 sm:py-16">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/brand/logo-bianco.png" alt="Done Wifi" className="mb-3 h-20 w-20" />
          <p className="text-xs font-bold uppercase tracking-wide text-white/60">{config.titolo}</p>
          <p className="mt-2 max-w-xs text-sm text-white/70">{config.intro}</p>
        </div>
        <RichiestaClienteForm slug={tipo as SlugRichiestaCliente} ticketId={ticketId || null} praticaId={praticaId || null} />
      </div>
    </div>
  );
}
