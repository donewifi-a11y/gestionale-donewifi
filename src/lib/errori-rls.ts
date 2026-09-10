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

/** ★ NUOVA (2026-09-10, seguito del bug sopra) — l'ipotesi "accesso
 * condiviso" è stata smentita da un test diretto: due Persone diverse,
 * entrambe correttamente configurate (account individuale, Persona attiva,
 * JWT valido — verificato con una pagina di debug dedicata), ricevono lo
 * STESSO errore RLS in modo incoerente — a volte sul proprio reparto, a
 * volte su un altro, senza nessuna logica riconoscibile legata a chi sono
 * o cosa stanno scrivendo. Tutto il resto (policy, funzione is_active_staff(),
 * trigger, regole, vincoli) è stato verificato corretto direttamente in
 * produzione. L'ipotesi più concreta rimasta: il pooler di connessioni di
 * Supabase assegna occasionalmente una connessione con lo stato di sessione
 * "sporco" (un ruolo/JWT rimasto agganciato da una richiesta precedente
 * diversa) invece di una pulita — un problema di infrastruttura, non di
 * questo codice. Un secondo tentativo, su una richiesta HTTP separata (e
 * quindi quasi certamente una connessione diversa dal pool), aggira il
 * sintomo mentre si aspetta una risposta dal supporto Supabase.
 *
 * `operazione` deve restituire lo stesso `{ data, error }` di una chiamata
 * Supabase — se il primo tentativo fallisce con un vero errore RLS, ne fa
 * un secondo dopo una breve pausa e restituisce quello (che sia riuscito o
 * no); qualunque altro tipo di errore, o un primo tentativo riuscito, non
 * tocca affatto il ritentativo. */
export async function conRitentativoRls<T>(
  operazione: () => PromiseLike<{ data: T | null; error: { message: string } | null }>
): Promise<{ data: T | null; error: { message: string } | null }> {
  const primo = await operazione();
  if (!primo.error?.message.includes("row-level security policy")) return primo;

  console.error("conRitentativoRls — primo tentativo bloccato da RLS, ne provo un secondo:", primo.error.message);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const secondo = await operazione();
  if (secondo.error) {
    console.error("conRitentativoRls — anche il secondo tentativo è fallito:", secondo.error.message);
  } else {
    console.error("conRitentativoRls — il secondo tentativo è riuscito (conferma il sospetto di connessione sporca dal pool).");
  }
  return secondo;
}
