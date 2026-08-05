import { createServiceClient } from "@/lib/supabase/server";

// ★ FIX — stesso `createSignedUrl(percorso, 3600)` + wrapper `{ errore, url }`
// era incollato in 5 file di azioni diverse (richieste-clienti, segnalazioni,
// calendario, chat, tickets), ciascuno con la durata (3600s) e il nome
// bucket ("documenti") scritti a mano. Un solo punto da cui derivano
// entrambi ora. Non tocca i controlli di autorizzazione, che restano
// specifici per ciascun chiamante (chi può vedere quale documento) — solo
// il passo finale, identico ovunque, di generare l'URL firmata.
const BUCKET_DOCUMENTI = "documenti";
const SCADENZA_SECONDI = 3600;

export async function urlFirmataDocumento(percorso: string): Promise<{ errore: string | null; url: string | null }> {
  const service = createServiceClient();
  const { data, error } = await service.storage.from(BUCKET_DOCUMENTI).createSignedUrl(percorso, SCADENZA_SECONDI);
  if (error) return { errore: error.message, url: null };
  return { errore: null, url: data.signedUrl };
}
