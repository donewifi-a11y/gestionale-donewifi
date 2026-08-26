"use server";

import { createServiceClient } from "@/lib/supabase/server";
import {
  getTecnicoEsternoCorrente,
  impostaCookieTecnicoEsterno,
  rimuoviCookieTecnicoEsterno,
} from "@/lib/tecnico-esterno";
import { urlFirmataDocumento } from "@/lib/documenti";
import { inviaEmail, emailChiusuraTicket } from "@/lib/email";
import { revalidatePath } from "next/cache";
import type { FirmaClienteApprovata } from "@/app/(app)/calendario/actions";
import type { Appuntamento, StatoTicket, Ticket } from "@/lib/types";

// ============================================================
// pose.donewifi.it — sistema separato per i tecnici esterni
// (2026-08-26, richiesta esplicita: "semplificare la procedura per i
// tecnici esterni, non passare dal gestionale"). Nessuna dipendenza da
// persona.ts/Supabase Auth: solo il cookie firmato di tecnico-esterno.ts
// e la service role (bypassa RLS, stesso principio già usato da tutte le
// route pubbliche del gestionale — Portale, Richiesta Dati, ecc.).
// ============================================================

export async function loginTecnicoEsterno(email: string, password: string): Promise<{ errore: string | null }> {
  const emailPulita = email.trim();
  if (!emailPulita || !password) return { errore: "Inserisci email e password." };

  const service = createServiceClient();
  const { data: id, error } = await service.rpc("verifica_login_tecnico_esterno", {
    p_email: emailPulita,
    p_password: password,
  });
  if (error) return { errore: error.message };
  if (!id) return { errore: "Email o password errati." };

  await impostaCookieTecnicoEsterno(id);
  return { errore: null };
}

export async function logoutTecnicoEsterno() {
  await rimuoviCookieTecnicoEsterno();
}

export interface InterventiTecnicoEsterno {
  tecnico: { id: string; nome: string; cognome: string | null };
  tickets: Ticket[];
  appuntamenti: Appuntamento[];
}

/** Tutto ciò che è assegnato al tecnico esterno collegato — o `null` se
 * nessuna sessione valida (la pagina reindirizza al login in quel caso). */
export async function getInterventiTecnicoEsterno(): Promise<InterventiTecnicoEsterno | null> {
  const tecnico = await getTecnicoEsternoCorrente();
  if (!tecnico) return null;

  const service = createServiceClient();
  const oraInizio = new Date();
  oraInizio.setHours(0, 0, 0, 0);

  const [{ data: tickets }, { data: appuntamenti }] = await Promise.all([
    service
      .from("tickets")
      .select("*")
      .eq("tecnico_esterno_id", tecnico.id)
      .not("stato", "in", "(Completato,Annullato)")
      .order("data_creazione", { ascending: false }),
    service
      .from("appuntamenti")
      .select("*")
      .eq("tecnico_esterno_id", tecnico.id)
      .eq("stato", "Programmato")
      .gte("data_ora", oraInizio.toISOString())
      .order("data_ora", { ascending: true }),
  ]);

  return { tecnico, tickets: (tickets as Ticket[]) ?? [], appuntamenti: (appuntamenti as Appuntamento[]) ?? [] };
}

/** Il Ticket, solo se assegnato al tecnico esterno collegato — mai un altro. */
export async function getTicketTecnicoEsterno(ticketId: string): Promise<Ticket | null> {
  const tecnico = await getTecnicoEsternoCorrente();
  if (!tecnico) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("tickets")
    .select("*")
    .eq("id", ticketId)
    .eq("tecnico_esterno_id", tecnico.id)
    .maybeSingle();
  return (data as Ticket | null) ?? null;
}

export async function urlDocumentoRapportinoEsterno(percorso: string): Promise<{ errore: string | null; url: string | null }> {
  const tecnico = await getTecnicoEsternoCorrente();
  if (!tecnico) return { errore: "Sessione scaduta — accedi di nuovo.", url: null };
  return urlFirmataDocumento(percorso);
}

/**
 * ★ Equivalente di `completaTicketConRapportino()` (tickets/actions.ts) ma
 * per un tecnico esterno: stessa logica di business (rapportino + chiusura
 * Ticket + storico + email cliente), gate e scrittura diversi — nessuna
 * sessione Supabase Auth qui, solo service role, e `creato_da_tecnico_esterno_id`
 * al posto di `creato_da` (FK diverse, vedi migrazione 0061). Tenuta
 * volutamente separata invece di generalizzare l'originale: i due percorsi
 * di autenticazione sono troppo diversi per un parametro opzionale senza
 * confondere chi legge quale delle due può scrivere cosa.
 */
export async function completaTicketConRapportinoEsterno(
  ticketId: string,
  statoVecchio: StatoTicket,
  dati: { esito: string; lavoriSvolti: string; materiali: string; firmaCliente: FirmaClienteApprovata; importoFatturato: string },
  foto: File[]
): Promise<{ errore: string | null }> {
  const tecnico = await getTecnicoEsternoCorrente();
  if (!tecnico) return { errore: "Sessione scaduta — accedi di nuovo." };
  if (!dati.esito.trim()) return { errore: "L'esito dell'intervento è obbligatorio." };
  if (!dati.firmaCliente?.email || !dati.firmaCliente?.metodo) {
    return { errore: "Manca la conferma del cliente (codice email o link di approvazione)." };
  }
  if (dati.firmaCliente.metodo === "otp_email" && !dati.firmaCliente.verificatoIl) {
    return { errore: "Il codice inviato al cliente non risulta verificato." };
  }

  const service = createServiceClient();

  const { data: ticketRiga } = await service
    .from("tickets")
    .select("cliente, numero, email, reparto, tecnico_esterno_id")
    .eq("id", ticketId)
    .single();
  if (!ticketRiga || ticketRiga.tecnico_esterno_id !== tecnico.id) {
    return { errore: "Questo intervento non risulta assegnato a te." };
  }

  const fotoSalvate: { nome: string; percorso: string }[] = [];
  for (const file of foto) {
    if (file.size === 0) continue;
    const percorso = `rapportini/${ticketId}/${Date.now()}-${file.name}`;
    const { error: erroreFoto } = await service.storage.from("documenti").upload(percorso, file, {
      contentType: file.type || "application/octet-stream",
    });
    if (erroreFoto) return { errore: `Errore caricamento "${file.name}": ${erroreFoto.message}` };
    fotoSalvate.push({ nome: file.name, percorso });
  }

  const { error: erroreRapportino } = await service.from("rapportini_intervento").insert({
    ticket_id: ticketId,
    esito: dati.esito.trim(),
    lavori_svolti: dati.lavoriSvolti.trim() || null,
    materiali: dati.materiali.trim() || null,
    firma_url: null,
    firma_metodo: dati.firmaCliente.metodo,
    firma_email: dati.firmaCliente.email,
    firma_verificato_il: dati.firmaCliente.verificatoIl,
    foto: fotoSalvate,
    creato_da: null,
    creato_da_tecnico_esterno_id: tecnico.id,
  });
  if (erroreRapportino) return { errore: erroreRapportino.message };

  const importo = dati.importoFatturato.trim() ? Number(dati.importoFatturato) : null;
  const { error: erroreStato } = await service
    .from("tickets")
    .update({ stato: "Completato", aggiornato_il: new Date().toISOString(), importo_fatturato: importo })
    .eq("id", ticketId);
  if (erroreStato) return { errore: erroreStato.message };

  // ★ `storico.operatore_id` è `references persone(id)` — un tecnico
  // esterno non può comparire lì (violerebbe la FK): resta null, il nome
  // va nel testo dell'operazione invece che in una colonna che non può
  // ospitarlo, stesso compromesso di rapportini_intervento sopra.
  await service.from("storico").insert({
    origine: "ticket",
    riferimento_id: ticketId,
    operazione: "Cambio Stato",
    valore_prima: statoVecchio,
    valore_dopo: `Completato (tecnico esterno: ${tecnico.nome}${tecnico.cognome ? ` ${tecnico.cognome}` : ""})`,
    operatore_id: null,
  });

  if (ticketRiga.email) {
    const { oggetto, corpoHtml, corpoTesto } = emailChiusuraTicket(ticketRiga.cliente, ticketRiga.numero);
    await inviaEmail({ a: ticketRiga.email, oggetto, corpoHtml, corpoTesto, reparto: ticketRiga.reparto });
  }

  revalidatePath("/pose");
  return { errore: null };
}
