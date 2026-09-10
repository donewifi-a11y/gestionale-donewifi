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
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DebugAccessoPage() {
  const oraServer = new Date().toISOString();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ★ decodifica il JWT della sessione reale (solo il "payload", nessuna
  // firma/segreto) per vedere se porta davvero role/aud "authenticated" —
  // senza questo, PostgREST tratterebbe la richiesta come "anon"
  // indipendentemente da chi sia realmente autenticato.
  const { data: sessioneData } = await supabase.auth.getSession();
  let jwtPayload: Record<string, unknown> | null = null;
  let erroreJwt: string | null = null;
  try {
    const token = sessioneData.session?.access_token;
    if (token) {
      const parte = token.split(".")[1];
      jwtPayload = JSON.parse(Buffer.from(parte, "base64").toString("utf8"));
    } else {
      erroreJwt = "Nessun access_token nella sessione.";
    }
  } catch (err) {
    erroreJwt = err instanceof Error ? err.message : "Errore imprevisto nella decodifica.";
  }

  const personaCookieId = await getPersonaCorrenteId();
  const persona = await getPersonaCorrente(supabase);

  // ★ is_active_staff() chiamata QUI, con lo stesso identico client/richiesta
  // usato per l'INSERT sotto — finora era sempre stata verificata con un
  // canale diverso (script a parte, o solo indirettamente tramite la
  // risoluzione della Persona). Se qui risulta true e l'INSERT fallisce
  // comunque, la contraddizione è nello stesso identico contesto.
  const { data: staffAttivoOra, error: erroreRpc } = await supabase.rpc("is_active_staff");

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

  // ★ stesso identico test ma con reparto = il proprio (Fatturazione) —
  // nella stessa identica richiesta/contesto di sopra, per un confronto
  // diretto senza nessuna variabile di mezzo.
  let esitoInsertProprio: string;
  const { data: insProprio, error: erroreInsProprio } = await supabase
    .from("tickets")
    .insert({
      cliente: "DEBUG ACCESSO - test reparto proprio, cancellabile",
      categoria: "Amministrativa",
      priorita: "Bassa",
      reparto: "Fatturazione",
    })
    .select("id")
    .single();
  if (erroreInsProprio) {
    esitoInsertProprio = `FALLITO: ${erroreInsProprio.message} (code ${erroreInsProprio.code})`;
  } else {
    esitoInsertProprio = `RIUSCITO (id ${insProprio.id}) — elimino subito...`;
    await supabase.from("tickets").delete().eq("id", insProprio.id);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-xl font-bold">Debug accesso — pagina temporanea</h1>
      <p className="text-xs text-muted-foreground">Ora del server a questo caricamento: <b>{oraServer}</b> — se ricarichi e non cambia, la pagina è in cache.</p>
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
        <h2 className="mb-2 font-semibold">3a. is_active_staff() — chiamata nello stesso identico contesto dell&apos;INSERT sotto</h2>
        <p className="font-mono text-sm">{erroreRpc ? `ERRORE: ${erroreRpc.message}` : `is_active_staff() = ${staffAttivoOra}`}</p>
      </div>
      <div className="rounded-lg border p-4">
        <h2 className="mb-2 font-semibold">3b. INSERT reparto DIVERSO dal proprio (&quot;Analisi Rete&quot;)</h2>
        <p className="font-mono text-sm">{esitoInsertTest}</p>
      </div>
      <div className="rounded-lg border p-4">
        <h2 className="mb-2 font-semibold">3c. INSERT sul PROPRIO reparto ({persona?.reparti.join(", ") || "nessuno"})</h2>
        <p className="font-mono text-sm">{esitoInsertProprio}</p>
      </div>
      <div className="rounded-lg border p-4">
        <h2 className="mb-2 font-semibold">4. Token della sessione (payload JWT, decodificato)</h2>
        {erroreJwt ? (
          <p className="font-mono text-sm text-red-600">{erroreJwt}</p>
        ) : (
          <>
            <p>role: <b>{String(jwtPayload?.role ?? "—")}</b></p>
            <p>aud: <b>{String(jwtPayload?.aud ?? "—")}</b></p>
            <p>sub: <code>{String(jwtPayload?.sub ?? "—")}</code></p>
            <p>exp: <b>{jwtPayload?.exp ? new Date(Number(jwtPayload.exp) * 1000).toISOString() : "—"}</b> (scaduto? {jwtPayload?.exp && Number(jwtPayload.exp) * 1000 < Date.now() ? "SÌ" : "no"})</p>
            <p>iat: <b>{jwtPayload?.iat ? new Date(Number(jwtPayload.iat) * 1000).toISOString() : "—"}</b></p>
          </>
        )}
      </div>
    </div>
  );
}
