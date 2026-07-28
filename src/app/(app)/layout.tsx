import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";

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

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar email={staff.email} areaAccesso={staff.area_accesso} />
      <main className="flex-1 bg-background p-5 md:p-8">{children}</main>
    </div>
  );
}
