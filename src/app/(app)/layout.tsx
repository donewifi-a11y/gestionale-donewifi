import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrenteId, getPersonaCorrente, impostaCookiePersona } from "@/lib/persona";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatWidget } from "@/components/chat/chat-widget";
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

  // ★ login individuale — un account può ora essere autorizzato in due
  // modi: un login diretto collegato a una Persona (persone.auth_user_id,
  // il caso normale ora) oppure, ancora per transizione, un vecchio
  // account condiviso in "staff". Si usa la service role solo per QUESTA
  // verifica sul proprio utente autenticato (auth.uid()) — non su dati
  // altrui — perché finché la migrazione 0012 non è applicata, is_active_staff()
  // (letta dalle policy RLS) controlla ancora "staff", quindi un login
  // individuale nuovo non passerebbe la RLS del client normale.
  const service = createServiceClient();
  const { data: personaLoggata } = await service
    .from("persone")
    .select("id, nome, email, attivo, password_hash")
    .eq("auth_user_id", user.id)
    .eq("attivo", true)
    .maybeSingle();

  let emailVisualizzata = user.email ?? "";

  if (personaLoggata) {
    // ★ rete di sicurezza: se per qualsiasi motivo il cookie persona non
    // fosse ancora allineato a questo login individuale, lo si allinea
    // qui — così non serve mai passare da "Tu sei" per il proprio account.
    const idCorrente = await getPersonaCorrenteId();
    if (idCorrente !== personaLoggata.id) {
      await impostaCookiePersona(personaLoggata.id);
    }
    emailVisualizzata = personaLoggata.email || emailVisualizzata;
  } else {
    const { data: staff } = await service
      .from("staff")
      .select("email, nome, area_accesso, attivo")
      .eq("id", user.id)
      .maybeSingle();
    if (!staff || !staff.attivo) {
      redirect("/login?errore=account-non-attivo");
    }
    emailVisualizzata = staff.email;
  }

  // ★ password_hash si legge qui solo per calcolare "richiede_password" —
  // non passa mai, come valore vero, al componente client sotto.
  const { data: righe } = await service
    .from("persone")
    .select("id, nome, attivo, amministratore, reparti, password_hash")
    .eq("attivo", true)
    .order("nome");
  const persone: Persona[] = (righe ?? []).map((p) => ({
    id: p.id,
    nome: p.nome,
    attivo: p.attivo,
    amministratore: p.amministratore,
    reparti: p.reparti,
    richiede_password: p.password_hash !== null,
  }));

  const personaCorrenteId = await getPersonaCorrenteId();
  const personaCorrente = await getPersonaCorrente(supabase);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar
        email={emailVisualizzata}
        persone={persone}
        personaCorrenteId={personaCorrenteId}
        personaAmministratore={personaCorrente?.amministratore ?? false}
        personaReparti={personaCorrente?.reparti ?? []}
      />
      <main className="flex-1 bg-background p-5 [background-image:radial-gradient(900px_500px_at_100%_-10%,color-mix(in_oklch,var(--primary),transparent_85%),transparent_60%),radial-gradient(700px_420px_at_-5%_100%,color-mix(in_oklch,var(--success),transparent_92%),transparent_55%)] md:p-8">
        {children}
      </main>
      <ChatWidget personaCorrenteId={personaCorrenteId} />
    </div>
  );
}
