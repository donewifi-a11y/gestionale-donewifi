import Link from "next/link";
import { PhoneCall, Plus } from "lucide-react";
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
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <PhoneCall className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Segnalazioni</h1>
            <p className="text-sm text-muted-foreground">
              Nuovi contatti, richiesta dati e trasmissione per l&apos;installazione.
            </p>
          </div>
        </div>
        <Link href="/segnalazioni/nuovo">
          <Button>
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Nuova Segnalazione
          </Button>
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
