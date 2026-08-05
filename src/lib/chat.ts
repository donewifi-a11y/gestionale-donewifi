import { createServiceClient } from "@/lib/supabase/server";
import type { AreaAccesso } from "@/lib/types";

const NOME_PERSONA_SISTEMA = "Sistema";

/**
 * Invia un messaggio automatico nella Chat interna del reparto indicato —
 * analogo di inviaNotificaTelegram() (src/lib/telegram.ts) ma per la Chat,
 * usato ad es. quando arriva una Richiesta Dati da un cliente. Il mittente è
 * una Persona dedicata "Sistema" (attivo=false: non selezionabile in nessun
 * form/assegnazione, esiste solo perché messaggi_chat.mittente_id è NOT
 * NULL con FK a persone). Il messaggio va nel gruppo di reparto già
 * esistente (una riga per reparto, dalla migrazione 0021): la RLS decide da
 * sola chi lo vede (chiunque abbia quel reparto, o sia amministratore),
 * niente fan-out manuale persona per persona. Non lancia mai un errore
 * verso il chiamante: una notifica mancata non deve mai bloccare il flusso
 * principale (stesso principio di inviaNotificaTelegram()).
 */
export async function inviaMessaggioChatSistema(reparto: AreaAccesso, testo: string) {
  try {
    const supabase = createServiceClient();

    const { data: sistema } = await supabase.from("persone").select("id").eq("nome", NOME_PERSONA_SISTEMA).maybeSingle();
    if (!sistema) return;

    const { data: conversazione } = await supabase
      .from("conversazioni")
      .select("id")
      .eq("tipo", "gruppo")
      .eq("reparto", reparto)
      .maybeSingle();
    if (!conversazione) return;

    await supabase.from("messaggi_chat").insert({
      conversazione_id: conversazione.id,
      mittente_id: sistema.id,
      testo,
    });
  } catch {
    // notifica persa, non bloccante — l'operatore vede comunque i dati nel gestionale.
  }
}
