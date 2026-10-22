import { createClient } from "@supabase/supabase-js";

/**
 * ★ NUOVA — Fortuna (concorso "Tenta la fortuna", fortuna.donewifi.it) vive in un progetto Supabase
 * SEPARATO da questo gestionale, così i dati dei partecipanti (pubblici, raccolti da un QR) non si
 * mescolano con quelli interni. Il gestionale ci parla solo dal server con la chiave segreta del
 * progetto Fortuna e applica qui i PROPRI permessi (vedi permessi.ts): non esistono utenti staff
 * nel progetto Fortuna. SOLO lato server — la chiave segreta non deve mai arrivare al browser.
 */
export function createFortunaClient() {
  const url = process.env.NEXT_PUBLIC_FORTUNA_SUPABASE_URL;
  const chiave = process.env.FORTUNA_SUPABASE_SECRET_KEY;
  if (!url || !chiave) throw new Error("Fortuna non configurata: mancano NEXT_PUBLIC_FORTUNA_SUPABASE_URL / FORTUNA_SUPABASE_SECRET_KEY.");
  return createClient(url, chiave, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function fortunaConfigurata(): boolean {
  return !!process.env.NEXT_PUBLIC_FORTUNA_SUPABASE_URL && !!process.env.FORTUNA_SUPABASE_SECRET_KEY;
}
