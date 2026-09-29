import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** ★ Supabase limita ogni risposta a 1000 righe di default — con 3908
 * clienti importati un solo `.select()` ne perderebbe silenziosamente
 * più della metà. Pagina con `.range()` finché non finiscono le righe
 * (ordinate per id, altrimenti la paginazione non è stabile). */
export async function fetchTuttiClientiEsterni<T>(supabase: Supabase, selectClause: string): Promise<T[]> {
  const PAGINA = 1000;
  let offset = 0;
  const tutte: T[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from("clienti_esterni")
      .select(selectClause)
      .order("id", { ascending: true })
      .range(offset, offset + PAGINA - 1);
    // ★ FIX (2026-09-25, audit modulo Clienti) — un errore Supabase a metà
    // paginazione (query transitoria fallita) lasciava `data` a `null`,
    // trattato come "pagina vuota = fine dei risultati": la funzione
    // restituiva un elenco troncato in silenzio, indistinguibile da un
    // elenco genuinamente più corto. Stesso identico principio già
    // applicato qui per il limite delle 1000 righe (vedi commento sopra),
    // mai esteso al caso di un errore vero e proprio — un elenco clienti
    // (o un conteggio insoluti) silenziosamente incompleto è peggio di un
    // errore visibile.
    if (error) throw new Error(`fetchTuttiClientiEsterni: ${error.message}`);
    tutte.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGINA) break;
    offset += PAGINA;
  }
  return tutte;
}

function normalizza(v: string | null): string {
  return (v || "").trim().toLowerCase();
}

interface ClienteConStato {
  id: number;
  codice_gestionale: string | null;
  /** ★ dopo la migrazione 0059 coincide sempre con `contratto_attivo` — va
   * bene usare l'uno o l'altro come discriminante, `attivo` è più spesso già
   * nelle select esistenti. */
  attivo: boolean;
  /** ★ NUOVA (2026-09-29, bug reale segnalato: "alcuni clienti non li vedo,
   * come Antonio Villa") — vedi il commento completo su
   * dedupClientiPerContratto() sotto: servono per accorgersi di un
   * `codice_gestionale` riciclato tra due persone diverse invece di
   * fonderle in una sola. */
  codice_fiscale: string | null;
  partita_iva: string | null;
}

/** Tra righe che rappresentano LO STESSO contratto/installazione, sceglie
 * quella "vera": se una sola è attiva è sicuramente quella giusta (le altre
 * sono fantasmi di rinnovi/ricodifiche passate); se più righe sono attive
 * insieme si tiene la più recente (`id` più alto) tra quelle; se nessuna è
 * attiva (cliente cessato) si tiene comunque la più recente, come riferimento. */
function scegliCanonica<T extends ClienteConStato>(righe: T[]): T {
  const attive = righe.filter((r) => r.attivo);
  const pool = attive.length > 0 ? attive : righe;
  return pool.reduce((a, b) => (b.id > a.id ? b : a));
}

/**
 * ★ NUOVA (2026-08) — bug reale segnalato dall'utente: "clienti duplicati
 * risultano attivi, altri non attivi in verità lo sono". Causa trovata sui
 * dati reali: ogni rinnovo/adeguamento di un contratto su Aruba scrive una
 * riga NUOVA in `clienti_esterni` invece di aggiornare quella esistente —
 * stesso `codice_gestionale`, `id` diverso. 696 righe su 3914 erano di
 * questo tipo (stesso contratto, versione superata). Un CF/PIVA con più
 * `codice_gestionale` resta invece legittimo (più punti installati dalla
 * stessa persona) — per questo il dedup raggruppa per `codice_gestionale`,
 * non per CF/PIVA. Righe senza `codice_gestionale` passano invariate (troppo
 * poche, e non c'è una chiave affidabile per raggrupparle). Va applicato
 * ovunque si mostri/conti "i clienti" — liste, ricerca, Buy&Go, analytics —
 * altrimenti ogni rinnovo pesa come un cliente a sé.
 *
 * ★ FIX (2026-08, trovato in verifica dati reale PRIMA del deploy) — la
 * prima versione sceglieva sempre la riga con `id` più alto, assumendo che
 * l'ultimo import fosse anche il contratto vivo. Falso in 396 gruppi su
 * dati reali: es. `codice_gestionale=901105` aveva id=50 (attivo=true) e
 * id=1114 (attivo=false, importato dopo ma di un contratto già chiuso) — la
 * vecchia regola avrebbe scartato la riga VERA e tenuto quella morta.
 * `scegliCanonica()` ora guarda `attivo` prima dell'`id`.
 *
 * ★ FIX (2026-09-29, bug reale segnalato: "alcuni clienti non li vedo, come
 * Antonio Villa") — raggruppare per solo `codice_gestionale` presumeva che
 * fosse un identificativo stabile di UN contratto nel tempo. Falso su dati
 * reali: Aruba lo ricicla per persone completamente diverse una volta che
 * il contratto precedente si chiude (161 gruppi trovati su una scansione
 * completa, es. `codice_gestionale=903244` aveva sia "Antonio Villa" — CF
 * `VLLNTN63A21F205F`, contratto `4F1153` — sia "Edi Trento" — CF
 * `TRNDEI66M16A326U`, contratto `4F31619` — entrambi genuinamente attivi).
 * La vecchia regola ne teneva
 * uno solo (id più alto tra gli attivi) e faceva sparire l'altro da OGNI
 * lista che passa da qui — Anagrafica, Ricerca globale, Buy&Go, Analytics.
 * La chiave di raggruppamento ora include anche CF/PIVA normalizzato: righe
 * con lo stesso `codice_gestionale` si fondono solo se rappresentano anche
 * la STESSA persona/azienda (stesso CF/PIVA, il vero identificativo
 * stabile) — un contratto rinnovato più volte dalla stessa persona continua
 * a fondersi come prima, due persone diverse che si sono trovate lo stesso
 * numero riciclato non si fondono più.
 */
export function dedupClientiPerContratto<T extends ClienteConStato>(clienti: T[]): T[] {
  const gruppi = new Map<string, T[]>();
  const senzaContratto: T[] = [];
  for (const c of clienti) {
    if (!c.codice_gestionale) {
      senzaContratto.push(c);
      continue;
    }
    const chiave = `${c.codice_gestionale}|${normalizza(c.codice_fiscale || c.partita_iva)}`;
    if (!gruppi.has(chiave)) gruppi.set(chiave, []);
    gruppi.get(chiave)!.push(c);
  }
  const risultato: T[] = senzaContratto;
  for (const righe of gruppi.values()) risultato.push(scegliCanonica(righe));
  return risultato;
}

interface ClienteConIndirizzo extends ClienteConStato {
  indirizzo: string | null;
  numero_civico: string | null;
  comune: string | null;
}

/** Chiave CF/PIVA + indirizzo normalizzato — `null` se manca CF/PIVA o manca
 * del tutto un indirizzo (non ha senso raggruppare alla cieca su campi vuoti). */
function chiaveIndirizzo(c: ClienteConIndirizzo): string | null {
  const cf = normalizza(c.codice_fiscale || c.partita_iva);
  if (!cf) return null;
  const indirizzo = normalizza(c.indirizzo);
  const comune = normalizza(c.comune);
  if (!indirizzo && !comune) return null;
  return `${cf}|${indirizzo}|${normalizza(c.numero_civico)}|${comune}`;
}

/**
 * ★ NUOVA (2026-08) — secondo livello di dedup, dopo `dedupClientiPerContratto()`.
 * Analisi sui 546 gruppi CF/PIVA residui allo stesso indirizzo (dopo il primo
 * dedup): 512 avevano UNA sola riga attiva (stesso contratto ricodificato più
 * volte da Aruba nel tempo — `codice_gestionale` diverso ma è sempre la
 * stessa installazione), 9 nessuna riga attiva (cliente cessato, righe tutte
 * storiche). Solo 25 avevano 2+ righe attive CONTEMPORANEAMENTE — lì sono
 * installazioni/servizi realmente distinti (es. una riga "Buy & Go" + una
 * riga linea fissa, entrambe vive): quei gruppi restano intatti, non si
 * fondono MAI righe entrambe attive tra `codice_gestionale` diversi (a
 * differenza del primo livello, dove lo stesso `codice_gestionale` è per
 * definizione lo stesso contratto e quindi si fonde sempre).
 */
export function dedupClientiPerInstallazione<T extends ClienteConIndirizzo>(clienti: T[]): T[] {
  const primoLivello = dedupClientiPerContratto(clienti);

  const gruppi = new Map<string, T[]>();
  const senzaChiave: T[] = [];
  for (const c of primoLivello) {
    const chiave = chiaveIndirizzo(c);
    if (!chiave) {
      senzaChiave.push(c);
      continue;
    }
    if (!gruppi.has(chiave)) gruppi.set(chiave, []);
    gruppi.get(chiave)!.push(c);
  }

  const risultato: T[] = senzaChiave;
  for (const righe of gruppi.values()) {
    if (righe.length === 1) {
      risultato.push(righe[0]);
      continue;
    }
    const attive = righe.filter((r) => r.attivo);
    if (attive.length >= 2) {
      risultato.push(...righe); // installazioni/servizi distinti, non fondere
    } else {
      risultato.push(scegliCanonica(righe));
    }
  }
  return risultato;
}
