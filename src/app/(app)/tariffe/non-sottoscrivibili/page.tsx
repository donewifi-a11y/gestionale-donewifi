import Link from "next/link";
import { ArrowLeft, Archive } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { TariffeArchivioBoard } from "@/components/tariffe/tariffe-archivio-board";
import type { Tariffa } from "@/lib/types";

export default async function TariffeNonSottoscrivibiliPage() {
  const supabase = await createClient();
  const [{ data: tariffe }, persona] = await Promise.all([
    supabase.from("tariffe").select("*").eq("attivo", false).order("ordine", { ascending: true }),
    getPersonaCorrente(supabase),
  ]);
  const isAdmin = personaHaAccessoAdmin(persona);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/tariffe" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
        Torna a Tariffe
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-sm">
          <Archive className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Tariffe non più sottoscrivibili</h1>
          <p className="text-sm text-muted-foreground">
            Non proposte ai nuovi clienti, ma restano salvate per chi ce l&apos;ha già sottoscritta.
          </p>
        </div>
      </div>

      <TariffeArchivioBoard tariffe={(tariffe as Tariffa[]) ?? []} isAdmin={isAdmin} />
    </div>
  );
}
