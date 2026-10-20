import { createServiceClient } from "@/lib/supabase/server";
import { notificaSuTuttiICanali } from "@/lib/notifiche-interne";

/**
 * ★ NUOVA (2026-10-20, richiesta esplicita: "fatturazione... riceve una
 * notifica quando apparati ritirati e che può chiudere la pratica") —
 * unico punto che segna gli apparati di un Ticket di Disdetta come
 * recuperati e avvisa Fatturazione. Chiamato sia dal salvataggio di una
 * Scheda con "Recupero Apparati" (calendario/actions.ts e pose/actions.ts,
 * senza persona per un tecnico esterno) sia dal pulsante "Apparati
 * ritirati" (segnaApparatiRitirati in tickets/actions.ts). Idempotente: se
 * già registrato non rimanda la notifica. Non lancia mai — un errore qui
 * non deve far fallire il salvataggio della Scheda che l'ha chiamato.
 */
export async function registraApparatiRitirati(
  ticketId: string,
  personaId: string | null
): Promise<{ errore: string | null; giaRegistrato?: boolean }> {
  try {
    const service = createServiceClient();
    const { data: t } = await service
      .from("tickets")
      .select("numero, cliente, sottocategoria, disdetta_apparati_ritirati_il")
      .eq("id", ticketId)
      .single();
    if (!t) return { errore: "Ticket non trovato." };
    if (t.sottocategoria !== "Disdetta") return { errore: "Disponibile solo sui Ticket di Disdetta." };
    if (t.disdetta_apparati_ritirati_il) return { errore: null, giaRegistrato: true };

    const { error } = await service
      .from("tickets")
      .update({ disdetta_apparati_ritirati_il: new Date().toISOString(), aggiornato_il: new Date().toISOString() })
      .eq("id", ticketId);
    if (error) return { errore: error.message };

    await Promise.all([
      service.from("note_ticket").insert({
        ticket_id: ticketId,
        autore_id: personaId,
        testo: "Apparati ritirati — Fatturazione può chiudere la pratica.",
      }),
      service.from("storico").insert({
        origine: "ticket",
        riferimento_id: ticketId,
        operazione: "Apparati ritirati",
        operatore_id: personaId,
      }),
      notificaSuTuttiICanali({
        reparto: "Fatturazione",
        telegramHtml: `✅ <b>Disdetta — apparati ritirati</b>\n\nTicket #${t.numero} — ${t.cliente}\nPuoi chiudere la pratica.`,
        chatTesto: `✅ Disdetta Ticket #${t.numero} (${t.cliente}) — apparati ritirati, puoi chiudere la pratica.`,
        emailTitolo: `Disdetta — apparati ritirati, Ticket #${t.numero}`,
        emailCorpoHtml: `<p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Gli apparati del Ticket di Disdetta <b>#${t.numero}</b> — ${t.cliente} — sono stati <b>ritirati</b>: puoi chiudere la pratica.</p>`,
        emailCorpoTesto: `Gli apparati del Ticket di Disdetta #${t.numero} (${t.cliente}) sono stati ritirati: puoi chiudere la pratica.`,
        emailLink: `https://gestione.donewifi.it/tickets?aperto=${ticketId}`,
      }),
    ]);
    return { errore: null };
  } catch (errore) {
    console.error("registraApparatiRitirati:", errore);
    return { errore: "Errore imprevisto." };
  }
}
