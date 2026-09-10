import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId } from "@/lib/persona";

/** ★ TEMPORANEA (2026-09-10) — pannello diagnostico per il bug "non è
 * possibile aprire i ticket per i diversi reparti da alcuni account":
 * mostra fianco a fianco chi è DAVVERO autenticato su Supabase Auth
 * (auth.getUser()) e chi dice il cookie "Tu sei" (getPersonaCorrente()),
 * oltre a un vero tentativo di INSERT in tickets fatto qui stesso, per
 * vedere l'errore reale senza passare da nessun altro livello. Da
 * eliminare non appena il bug è chiuso — non è pensata per restare nel
 * gestionale. */
export default async function DebugAccessoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const personaCookieId = await getPersonaCorrenteId();
  const persona = await getPersonaCorrente(supabase);

  let esitoInsertTest: string;
  const { data: inserito, error: erroreInsert } = await supabase
    .from("tickets")
    .insert({
      cliente: "DEBUG ACCESSO - test automatico, cancellabile",
      categoria: "Assistenza",
      priorita: "Bassa",
      reparto: "Analisi Rete",
    })
    .select("id")
    .single();
  if (erroreInsert) {
    esitoInsertTest = `FALLITO: ${erroreInsert.message} (code ${erroreInsert.code})`;
  } else {
    esitoInsertTest = `RIUSCITO (id ${inserito.id}) — elimino subito...`;
    await supabase.from("tickets").delete().eq("id", inserito.id);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-xl font-bold">Debug accesso — pagina temporanea</h1>
      <div className="rounded-lg border p-4">
        <h2 className="mb-2 font-semibold">1. Sessione Supabase Auth reale (auth.getUser())</h2>
        <p>Email: <b>{user?.email ?? "NESSUNA — non autenticato"}</b></p>
        <p>ID (auth.uid): <code>{user?.id ?? "—"}</code></p>
      </div>
      <div className="rounded-lg border p-4">
        <h2 className="mb-2 font-semibold">2. Cookie &quot;Tu sei&quot; (getPersonaCorrente())</h2>
        <p>Persona ID nel cookie: <code>{personaCookieId ?? "nessuno"}</code></p>
        <p>Persona risolta: <b>{persona ? `${persona.nome} (reparti: ${persona.reparti.join(", ") || "nessuno"}, admin: ${persona.amministratore})` : "NESSUNA (null)"}</b></p>
      </div>
      <div className="rounded-lg border p-4">
        <h2 className="mb-2 font-semibold">3. Test reale — INSERT in tickets, reparto=&quot;Analisi Rete&quot;</h2>
        <p className="font-mono text-sm">{esitoInsertTest}</p>
      </div>
    </div>
  );
}
