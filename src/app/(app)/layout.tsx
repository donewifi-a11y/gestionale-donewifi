import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";

/**
 * ★ NUOVA — shell condivisa per tutte le pagine autenticate (equivalente
 * di Navbar.html incluso in ogni pagina del gestionale precedente): barra
 * in alto con marchio, ruolo dell'utente e logout.
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
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-4 border-b bg-foreground px-6 py-3 text-background">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
            DW
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold">
              Done<span className="text-primary">Wifi</span>
            </div>
            <div className="text-[10px] uppercase tracking-wide text-background/60">
              Gestionale CRM
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3 text-right text-xs">
          <div>
            <div className="text-background/80">{staff.email}</div>
            <div className="font-bold uppercase tracking-wide text-primary">
              {staff.area_accesso}
            </div>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 bg-muted/30 p-6">{children}</main>
    </div>
  );
}
