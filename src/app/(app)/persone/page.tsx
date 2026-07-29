import { redirect } from "next/navigation";
import { UserCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PersoneBoard } from "@/components/persone/persone-board";
import type { Persona } from "@/lib/types";

export default async function PersonePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: me } = await supabase.from("staff").select("area_accesso").eq("id", user.id).single();
  const autorizzato = me && (me.area_accesso === "Tutto" || me.area_accesso === "Admin");
  if (!autorizzato) redirect("/?errore=non-autorizzato");

  const { data: persone } = await supabase.from("persone").select("*").order("creato_il", { ascending: true });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <UserCircle className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Persone</h1>
          <p className="text-sm text-muted-foreground">
            Il team reale — usato per distinguere chi fa cosa quando più persone condividono lo stesso accesso.
          </p>
        </div>
      </div>

      <PersoneBoard persone={(persone as Persona[]) ?? []} />
    </div>
  );
}
