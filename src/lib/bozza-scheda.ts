// ★ NUOVA — richiesta esplicita: se il tecnico perde la connessione (o
// chiude per sbaglio) a metà compilazione di una Scheda sul campo, non
// deve perdere quanto già scritto. Salva i campi testuali/numerici in
// localStorage (mai foto o firme — non serializzabili in JSON, e comunque
// rapide da rifare), letti di nuovo all'apertura della stessa scheda.
// Solo lato client: su un dispositivo diverso la bozza non c'è, si
// riparte da zero — accettabile, il caso reale è "stesso telefono, tocco
// per sbaglio indietro/chiudo l'app".
export function leggiBozzaScheda<T>(chiave: string): Partial<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`bozza-scheda:${chiave}`);
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    return null;
  }
}

export function salvaBozzaScheda<T>(chiave: string, dati: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`bozza-scheda:${chiave}`, JSON.stringify(dati));
  } catch {
    // storage pieno/non disponibile — la bozza è un extra, non deve rompere la scheda.
  }
}

export function cancellaBozzaScheda(chiave: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`bozza-scheda:${chiave}`);
  } catch {
    // vedi sopra.
  }
}
