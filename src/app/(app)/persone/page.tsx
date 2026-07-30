import { redirect } from "next/navigation";
import { UserCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { PersoneBoard } from "@/components/persone/persone-board";
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
  const { data: righe } = await supabase
    .from("persone")
    .select("id, nome, email, attivo, amministratore, reparti, password_hash, auth_user_id")
    .order("creato_il", { ascending: true });

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
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <UserCircle className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Persone</h1>
          <p className="text-sm text-muted-foreground">
            Il team reale — livello di accesso e password propri, indipendenti dal login condiviso.
          </p>
        </div>
      </div>

      <PersoneBoard persone={persone} />
    </div>
  );
}
