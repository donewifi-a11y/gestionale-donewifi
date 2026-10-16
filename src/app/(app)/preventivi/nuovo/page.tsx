import { createClient } from "@/lib/supabase/server";
import { NuovoPreventivoForm, type ClientePrecompilato } from "@/components/preventivi/nuovo-preventivo-form";
import type { Tariffa, MaterialeMagazzino } from "@/lib/types";

// ★ NUOVA (2026-10-15, richiesta esplicita: "devi mettere nelle schede
// cliente per fare preventivi") — `?clienteEsternoId=` (+ nome/telefono/
// email/tipologia) arriva dal bottone "Nuovo preventivo" aggiunto nella
// scheda cliente (clienti-esterni/[id]/page.tsx): stesso risultato di
// cercare e scegliere quel cliente a mano nel form, solo senza doverlo
// rifare ogni volta partendo già dalla sua scheda.
export default async function NuovoPreventivoPage({
  searchParams,
}: {
  searchParams: Promise<{ clienteEsternoId?: string; nome?: string; telefono?: string; email?: string; tipologia?: string; indirizzo?: string; cf?: string; piva?: string }>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;

  const [{ data: tariffe }, { data: materiali }] = await Promise.all([
    supabase.from("tariffe").select("*").eq("attivo", true).order("ordine", { ascending: true }),
    supabase.from("materiali_magazzino").select("*").eq("attivo", true).order("ordine", { ascending: true }),
  ]);

  const clienteEsternoId = sp.clienteEsternoId ? Number(sp.clienteEsternoId) : null;
  const clientePrecompilato: ClientePrecompilato | undefined =
    clienteEsternoId && sp.nome
      ? {
          id: clienteEsternoId,
          nome: sp.nome,
          telefono: sp.telefono || null,
          email: sp.email || null,
          tipologiaCliente: sp.tipologia === "Azienda" ? "Azienda" : "Privato",
          indirizzo: sp.indirizzo || null,
          codiceFiscale: sp.cf || null,
          partitaIva: sp.piva || null,
        }
      : undefined;

  return (
    // ★ ESTESA (2026-10-15, richiesta esplicita: "riepilogo sul lato
    // destro") — il form è passato a due colonne da `lg:` in su
    // (NuovoPreventivoForm), max-w-2xl era troppo stretto per ospitarle
    // comodamente insieme.
    <div className="mx-auto max-w-4xl">
      <NuovoPreventivoForm
        tariffe={(tariffe as Tariffa[]) ?? []}
        materiali={(materiali as MaterialeMagazzino[]) ?? []}
        clientePrecompilato={clientePrecompilato}
      />
    </div>
  );
}
