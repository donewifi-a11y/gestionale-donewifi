import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrenteId } from "@/lib/persona";
import { AppSidebar } from "@/components/app-sidebar";
import type { Persona } from "@/lib/types";

/**
 * ★ NUOVA — shell condivisa per tutte le pagine autenticate (equivalente
 * di Navbar.html incluso in ogni pagina del gestionale precedente): sidebar
 * persistente con marchio, navigazione, ruolo dell'utente e logout — così
 * passare da Ticket a Segnalazioni è un solo click invece di tornare
 * prima alla home.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: staff } = await supabase
    .from("staff")
    .select("email, nome, area_accesso, attivo")
    .eq("id", user.id)
    .single();

  if (!staff || !staff.attivo) {
    redirect("/login?errore=account-non-attivo");
  }

  const { data: persone } = await supabase.from("persone").select("*").eq("attivo", true).order("nome");
  const personaCorrenteId = await getPersonaCorrenteId();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar
        email={staff.email}
        areaAccesso={staff.area_accesso}
        persone={(persone as Persona[]) ?? []}
        personaCorrenteId={personaCorrenteId}
      />
      <main className="flex-1 bg-background p-5 [background-image:radial-gradient(900px_500px_at_100%_-10%,color-mix(in_oklch,var(--primary),transparent_85%),transparent_60%),radial-gradient(700px_420px_at_-5%_100%,color-mix(in_oklch,var(--success),transparent_92%),transparent_55%)] md:p-8">
        {children}
      </main>
    </div>
  );
}
