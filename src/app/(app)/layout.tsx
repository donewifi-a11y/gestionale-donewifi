import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrenteId, getPersonaCorrente, impostaCookiePersona } from "@/lib/persona";
import { AppShell } from "@/components/app-shell";
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
    <AppShell
      email={emailVisualizzata}
      persone={persone}
      personaCorrenteId={personaCorrenteId}
      personaAmministratore={personaCorrente?.amministratore ?? false}
      personaReparti={personaCorrente?.reparti ?? []}
    >
      {children}
    </AppShell>
  );
}
