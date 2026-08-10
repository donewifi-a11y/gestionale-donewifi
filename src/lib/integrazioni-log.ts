import { createServiceClient } from "@/lib/supabase/server";

export type ServizioIntegrazione = "email" | "telegram" | "google_calendar";

/**
 * Registra l'esito (ok/errore) di un tentativo di invio verso
 * un'integrazione esterna — mai lanciata verso il chiamante: una riga di
 * log persa non deve mai bloccare l'invio vero, esattamente come l'invio
 * stesso non blocca mai il flusso principale del gestionale.
 */
export async function registraEsitoIntegrazione(servizio: ServizioIntegrazione, esito: "ok" | "errore", dettaglio?: string) {
  try {
    const service = createServiceClient();
    await service.from("integrazioni_log").insert({ servizio, esito, dettaglio: dettaglio || null });
  } catch {
    // logging best-effort.
  }
}
