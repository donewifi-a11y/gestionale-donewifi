"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import { revalidatePath } from "next/cache";
import { inviaEmail, emailRichiestaDatiSegnalazione } from "@/lib/email";
import type { Copertura, StatoSegnalazione } from "@/lib/types";

// ★ invia davvero l'email (Resend) dall'indirizzo del reparto Commerciale
// invece del mailto: che apriva il client di posta personale dell'operatore
// — il cliente riceve sempre da commerciale@donewifi.it, non da un
// indirizzo diverso a seconda di chi ha in mano la pratica in quel momento.
export async function inviaEmailRichiestaDatiSegnalazione(segnalazioneId: string, origine: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { data: segnalazione } = await supabase.from("segnalazioni").select("nome, email").eq("id", segnalazioneId).single();
  if (!segnalazione) return { errore: "Segnalazione non trovata." };
  if (!segnalazione.email) return { errore: "Il cliente non ha un'email registrata su questa segnalazione." };

  const link = `${origine}/richiesta-dati/${segnalazioneId}`;
  const { oggetto, corpoHtml } = emailRichiestaDatiSegnalazione(segnalazione.nome, link);
  const risultato = await inviaEmail({
    a: segnalazione.email,
    oggetto,
    corpoHtml,
    reparto: "Commerciale",
  });
  return risultato;
}

// ★ le Server Action, in produzione, nascondono al client il messaggio di
// un errore lanciato con "throw" — per mostrare messaggi utili bisogna
// restituirli come dato ({ errore }), non lanciarli.

// ★ NUOVA — i contratti oggi si generano su un altro gestionale: qui non
// li si genera, li si carica come PDF già pronto sulla Segnalazione,
// prima di trasmettere per l'installazione. Il bucket è privato: upload
// e lettura passano dalla service role (stesso pattern del modulo
// pubblico Richiesta Dati), l'URL restituito al browser è sempre firmato
// e a scadenza breve.
export async function caricaContrattoSegnalazione(segnalazioneId: string, formData: FormData) {
  const supabase = await createClient();
  // ★ FIX SICUREZZA — controllava solo che ci fosse un cookie persona
  // valido (getPersonaCorrenteId), non che lo staff fosse ancora attivo:
  // sotto si passa alla service role per l'upload, che bypassa la RLS.
  // Stesso pattern già corretto per le funzioni "URL firmata documento".
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: ERRORE_PERSONA_MANCANTE };
  const personaId = persona.id;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { errore: "Nessun file selezionato." };
  if (file.type !== "application/pdf") return { errore: "Il contratto deve essere un file PDF." };

  const service = createServiceClient();
  const percorso = `contratti/${segnalazioneId}-${Date.now()}-${file.name}`;
  const { error: erroreUpload } = await service.storage
    .from("documenti")
    .upload(percorso, file, { contentType: "application/pdf" });
  if (erroreUpload) return { errore: erroreUpload.message };

  const { error } = await supabase
    .from("segnalazioni")
    .update({ contratto_pdf_url: percorso, aggiornato_il: new Date().toISOString() })
    .eq("id", segnalazioneId);
  if (error) return { errore: error.message };

  await supabase.from("storico").insert({
    origine: "segnalazione",
    riferimento_id: segnalazioneId,
    operazione: "Contratto caricato",
    valore_dopo: file.name,
    operatore_id: personaId,
  });

  revalidatePath("/segnalazioni");
  return { errore: null, percorso };
}

export async function urlContratto(percorso: string) {
  const supabase = await createClient();
  // ★ FIX SICUREZZA — vedi urlDocumentoRichiesta(): controllava solo la
  // sessione Auth, non `persone.attivo`, mentre sotto la service role
  // bypassa la RLS per generare l'URL firmata.
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: "Non autenticato.", url: null };

  const service = createServiceClient();
  const { data, error } = await service.storage.from("documenti").createSignedUrl(percorso, 3600);
  if (error) return { errore: error.message, url: null };
  return { errore: null, url: data.signedUrl };
}

export async function creaSegnalazione(dati: {
  nome: string;
  telefono: string;
  email: string;
  via: string;
  civico: string;
  comune: string;
  cap: string;
  copertura: Copertura;
  note: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

  const { data, error } = await supabase
    .from("segnalazioni")
    .insert({
      nome: dati.nome,
      telefono: dati.telefono,
      email: dati.email || null,
      via: dati.via,
      civico: dati.civico,
      comune: dati.comune,
      cap: dati.cap,
      copertura: dati.copertura,
      note: dati.note || null,
      operatore_id: personaId,
    })
    .select("id, numero")
    .single();

  if (error) return { errore: error.message };

  await supabase.from("storico").insert({
    origine: "segnalazione",
    riferimento_id: data.id,
    operazione: "Creazione Segnalazione",
    valore_dopo: "Da Contattare",
    operatore_id: personaId,
  });

  revalidatePath("/segnalazioni");
  return { errore: null, id: data.id, numero: data.numero };
}

export async function cambiaStatoSegnalazione(id: string, statoNuovo: StatoSegnalazione, statoVecchio: StatoSegnalazione) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

  const aggiornamento: Record<string, unknown> = { stato: statoNuovo, aggiornato_il: new Date().toISOString() };
  if (statoNuovo === "Gestione Cliente") {
    aggiornamento.documenti_richiesti_at = new Date().toISOString();
  }

  const { error } = await supabase.from("segnalazioni").update(aggiornamento).eq("id", id);
  if (error) return { errore: error.message };

  await supabase.from("storico").insert({
    origine: "segnalazione",
    riferimento_id: id,
    operazione: "Cambio Stato",
    valore_prima: statoVecchio,
    valore_dopo: statoNuovo,
    operatore_id: personaId,
  });

  revalidatePath("/segnalazioni");
  return { errore: null };
}

// ★ NUOVA — a differenza del gestionale precedente (dove "Trasmetti per
// l'installazione" creava il Ticket in un foglio separato senza un
// collegamento affidabile alla Segnalazione d'origine, vedi bug risolto
// in Codice.js/_trovaRigaSegnalazionePerIdTicket), qui il ticket porta
// segnalazione_id come FK reale fin dalla creazione.
export async function trasmettiPerInstallazione(segnalazioneId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

  const { data: segnalazione, error: erroreLettura } = await supabase
    .from("segnalazioni")
    .select("*")
    .eq("id", segnalazioneId)
    .single();
  if (erroreLettura || !segnalazione) return { errore: erroreLettura?.message || "Segnalazione non trovata." };

  const { data: ticket, error: erroreTicket } = await supabase
    .from("tickets")
    .insert({
      cliente: segnalazione.nome,
      telefono: segnalazione.telefono,
      email: segnalazione.email,
      indirizzo: `${segnalazione.via} ${segnalazione.civico}, ${segnalazione.comune} (${segnalazione.cap})`,
      categoria: "Commerciale",
      problema: `Installazione da segnalazione #${segnalazione.numero}.${segnalazione.note ? " Note: " + segnalazione.note : ""}`,
      priorita: "Normale",
      reparto: "Analisi Rete",
      tipologia_cliente: segnalazione.tipologia_cliente,
      profilo_internet: segnalazione.profilo_internet,
      contratto_pdf_url: segnalazione.contratto_pdf_url,
      segnalazione_id: segnalazione.id,
      creato_da: personaId,
    })
    .select("id, numero")
    .single();
  if (erroreTicket || !ticket) return { errore: erroreTicket?.message || "Creazione del Ticket non riuscita." };

  const { error: erroreStato } = await supabase
    .from("segnalazioni")
    .update({ stato: "Trasmessa", aggiornato_il: new Date().toISOString() })
    .eq("id", segnalazioneId);
  if (erroreStato) return { errore: erroreStato.message };

  await supabase.from("storico").insert([
    {
      origine: "segnalazione",
      riferimento_id: segnalazioneId,
      operazione: "Trasmessa per installazione",
      valore_prima: segnalazione.stato,
      valore_dopo: "Trasmessa",
      operatore_id: personaId,
    },
    {
      origine: "ticket",
      riferimento_id: ticket.id,
      operazione: "Creato da Segnalazione",
      valore_dopo: `Segnalazione #${segnalazione.numero}`,
      operatore_id: personaId,
    },
  ]);

  revalidatePath("/segnalazioni");
  revalidatePath("/tickets");
  return { errore: null, id: ticket.id, numero: ticket.numero };
}
