import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, AlertTriangle } from "lucide-react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { UtentiBoard } from "@/components/utenti/utenti-board";

export interface StaffCompleto {
  id: string;
  email: string;
  nome: string | null;
  area_accesso: string;
  attivo: boolean;
}

export default async function UtentiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona)) redirect("/?errore=non-autorizzato");

  // ★ FIX — la policy RLS di "staff" lascia leggere solo la propria riga
  // (id = auth.uid()): con il client normale questa lista mostrava sempre
  // e solo l'account con cui si è entrati, mai gli altri login condivisi.
  // L'autorizzazione è già stata verificata sopra, quindi qui si può
  // usare la service role per leggerli tutti.
  const service = createServiceClient();
  const { data: staff } = await service.from("staff").select("*").order("creato_il", { ascending: true });

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <Users className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Utenti</h1>
          <p className="text-sm text-muted-foreground">Chi ha accesso al gestionale e con quale ruolo.</p>
        </div>
      </div>

      {/* ★ FIX — vedi la nota gemella in /persone: le due pagine si
      sovrapponevano senza nessun rimando, un admin doveva già sapere
      quale usare per assumere qualcuno. */}
      <p className="mb-4 flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-xs text-warning">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        Sistema precedente, ad account condivisi — per un nuovo membro dello staff usa{" "}
        <Link href="/persone" className="font-semibold underline-offset-2 hover:underline">
          Persone
        </Link>{" "}
        (login individuale, propria password e reparti). Questa pagina resta solo per gli account
        condivisi non ancora migrati.
      </p>

      <UtentiBoard staff={(staff as StaffCompleto[]) ?? []} currentUserId={user.id} />
    </div>
  );
}
