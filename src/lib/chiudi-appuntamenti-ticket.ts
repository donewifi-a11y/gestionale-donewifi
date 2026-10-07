import type { createServiceClient } from "@/lib/supabase/server";

// ★ NUOVA (2026-10-07, bug reale verificato sui dati di produzione, richiesta
// esplicita: "verificare che tutti i ticket aperti che devono avere una
// lavorazione da parte della squadra in loco siano poi presenti in
// pose.donewifi.it" — nel controllare questo, trovato il problema opposto) —
// un Ticket con un appuntamento "Programmato" collegato (intervento in loco,
// installazione...) può essere chiuso in almeno 3 modi diversi
// (aggiornaStatoTicket, completaTicketConRapportino, la versione pose) senza
// mai passare dalla Scheda di Lavoro legata all'appuntamento stesso (l'unico
// punto che normalmente lo segna "Completato", vedi calendario/actions.ts e
// pose/actions.ts). L'appuntamento restava quindi "Programmato" per sempre:
// verificato sui dati reali, 11 casi, 7 dei quali senza nessun tecnico
// assegnato — visibili su pose.donewifi.it a QUALUNQUE tecnico come lavoro
// "da assegnare", pur essendo già stati completati (in un caso, lo stesso
// giorno). Chiamata da ogni punto che chiude/annulla un Ticket: smaltisce
// gli eventuali appuntamenti ormai senza oggetto invece di lasciarli come
// fantasmi sul calendario della squadra. "Annullato" (non "Completato"):
// nessuna Scheda di Lavoro è mai stata compilata per quell'appuntamento, non
// sarebbe corretto dichiararlo "fatto".
export async function chiudiAppuntamentiApertiDelTicket(
  service: ReturnType<typeof createServiceClient>,
  ticketId: string
): Promise<void> {
  await service.from("appuntamenti").update({ stato: "Annullato" }).eq("ticket_id", ticketId).eq("stato", "Programmato");
}
