import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { SegnalazioniBoard } from "@/components/segnalazioni/segnalazioni-board";
import type { Segnalazione } from "@/lib/types";

export default async function SegnalazioniPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: segnalazioni } = await supabase
    .from("segnalazioni")
    .select("*")
    .order("data", { ascending: false });

  const { data: richieste } = await supabase
    .from("richieste_clienti")
    .select("*")
    .order("data", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">📋 Segnalazioni</h1>
          <p className="text-muted-foreground">Nuovi contatti, richiesta dati e trasmissione per l&apos;installazione.</p>
        </div>
        <Link href="/segnalazioni/nuovo">
          <Button>➕ Nuova Segnalazione</Button>
        </Link>
      </div>

      <SegnalazioniBoard
        segnalazioni={(segnalazioni as Segnalazione[]) ?? []}
        richieste={richieste ?? []}
        currentUserId={user?.id ?? ""}
      />
    </div>
  );
}
