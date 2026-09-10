import type { createClient } from "@/lib/supabase/server";

/** ★ NUOVA (2026-09-10, richiesta esplicita: "non è possibile chiudere i
 * ticket da parte di fatturazione" — bug gemello di quello già corretto in
 * creaTicket()/tickets/actions.ts il 2026-09-09, stessa persona reale
 * coinvolta) — causa reale più probabile: chi ha inviato l'azione era
 * autenticato su Supabase Auth con un accesso condiviso/vecchio (nato prima
 * del login individuale, oggi collegato a una Persona disattivata) mentre
 * il selettore "Tu sei" in sidebar — un cookie separato, indipendente dalla
 * sessione Supabase Auth vera — mostrava una Persona attiva scelta a parte
 * solo per l'attribuzione. getPersonaCorrente() guarda quel cookie e quindi
 * non si accorge di nulla; la policy RLS reale guarda invece `auth.uid()`
 * (l'accesso condiviso) e blocca la scrittura — da qui il messaggio
 * Postgres grezzo "new row violates row-level security policy...".
 *
 * Estratta qui da creaTicket() (dov'era nata, unico punto già corretto)
 * invece di lasciarla lì sola: ogni azione che scrive su una tabella con
 * RLS `is_active_staff()` può incappare nello stesso caso — ripetere la
 * stessa traduzione a mano ovunque avrebbe significato risolverlo un punto
 * alla volta, sempre dopo che qualcuno se n'è accorto con uno screenshot.
 *
 * Ritorna il messaggio chiaro se `erroreMessage` è davvero un errore RLS
 * (loggando anche chi era realmente autenticato, per la prossima volta che
 * ricapita — i log di Vercel/Supabase non conservano storico a lungo);
 * `null` se l'errore è di un altro tipo, così il chiamante può mostrare
 * `erroreMessage` così com'è. */
export async function messaggioErroreRls(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contesto: string,
  erroreMessage: string,
  persona: { id: string; nome: string }
): Promise<string | null> {
  if (!erroreMessage.includes("row-level security policy")) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  console.error(
    `${contesto} — RLS violata: "Tu sei" mostrava ${persona.nome} (persona ${persona.id}), ma la sessione Supabase Auth reale è ${user?.email ?? "assente"} (auth.uid ${user?.id ?? "null"}).`
  );
  return `Il tuo accesso non risulta più valido per ${contesto} — esci dal gestionale e accedi di nuovo con le tue credenziali personali (non un accesso condiviso). Se il problema resta, contatta un amministratore.`;
}
