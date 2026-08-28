import { redirect } from "next/navigation";
import { UserCircle, Info } from "lucide-react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { getTecniciEsterni } from "@/app/(app)/tecnici-esterni/actions";
import { PersoneBoard } from "@/components/persone/persone-board";
import type { StaffCompleto } from "@/app/(app)/utenti/page";
import type { Persona } from "@/lib/types";

export default async function PersonePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona)) redirect("/?errore=non-autorizzato");

  // ★ la colonna password_hash si legge qui (Server Component, mai
  // inviata al browser di suo) solo per calcolare un booleano — l'hash
  // vero non viene mai passato al componente client sotto.
  // ★ NUOVA (2026-08) — "Utenti" (accessi condivisi) è ora una seconda tab
  // qui invece di una pagina a sé introvabile dal menu (vedi PersoneBoard)
  // — stessa lettura via service role già usata da /utenti/page.tsx, la
  // RLS di "staff" lascia leggere solo la propria riga.
  const [{ data: righe }, { data: staff }, tecnici] = await Promise.all([
    supabase
      .from("persone")
      .select("id, nome, email, attivo, amministratore, reparti, password_hash, auth_user_id")
      .order("creato_il", { ascending: true }),
    createServiceClient().from("staff").select("*").order("creato_il", { ascending: true }),
    getTecniciEsterni(),
  ]);

  const persone: Persona[] = (righe ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    email: p.email,
    attivo: p.attivo,
    amministratore: p.amministratore,
    reparti: p.reparti,
    richiede_password: p.password_hash !== null,
    ha_login: p.auth_user_id !== null,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <UserCircle className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Persone</h1>
          <p className="text-sm text-muted-foreground">
            Il team reale, gli accessi condivisi e i tecnici esterni — tutto l&apos;accesso al gestionale in un solo posto.
          </p>
        </div>
      </div>

      {/* ★ FIX — "Persone" e "Utenti" gestiscono entrambe l'accesso, con
      nomi simili: chi assume qualcuno di nuovo doveva già sapere quale
      delle due usare. Ora sono nella stessa pagina (tab "Accessi
      condivisi" qui sotto), non serve più saperlo in anticipo.
      ★ ESTESA (2026-08-28) — stesso motivo, terza tab "Tecnici esterni":
      era l'ultima pagina di amministrazione-accessi rimasta staccata. */}
      <p className="mb-4 flex items-start gap-2 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.25} />
        Per aggiungere un nuovo membro dello staff resta sempre la tab &quot;Persone&quot;: login individuale, password e
        reparti propri. &quot;Accessi condivisi&quot; è il vecchio sistema ad account condivisi, mantenuto solo per
        compatibilità. &quot;Tecnici esterni&quot; sono gli account per pose.donewifi.it.
      </p>

      <PersoneBoard persone={persone} staff={(staff as StaffCompleto[]) ?? []} tecnici={tecnici} currentUserId={user.id} />
    </div>
  );
}
