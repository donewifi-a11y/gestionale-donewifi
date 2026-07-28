"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Copertura, StatoSegnalazione } from "@/lib/types";

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
  if (!user) throw new Error("Non autenticato.");

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
      operatore_id: user.id,
    })
    .select("id, numero")
    .single();

  if (error) throw new Error(error.message);

  await supabase.from("storico").insert({
    origine: "segnalazione",
    riferimento_id: data.id,
    operazione: "Creazione Segnalazione",
    valore_dopo: "Da Contattare",
    operatore_id: user.id,
  });

  revalidatePath("/segnalazioni");
  return data;
}

export async function cambiaStatoSegnalazione(id: string, statoNuovo: StatoSegnalazione, statoVecchio: StatoSegnalazione) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autenticato.");

  const aggiornamento: Record<string, unknown> = { stato: statoNuovo, aggiornato_il: new Date().toISOString() };
  if (statoNuovo === "Gestione Cliente") {
    aggiornamento.documenti_richiesti_at = new Date().toISOString();
  }

  const { error } = await supabase.from("segnalazioni").update(aggiornamento).eq("id", id);
  if (error) throw new Error(error.message);

  await supabase.from("storico").insert({
    origine: "segnalazione",
    riferimento_id: id,
    operazione: "Cambio Stato",
    valore_prima: statoVecchio,
    valore_dopo: statoNuovo,
    operatore_id: user.id,
  });

  revalidatePath("/segnalazioni");
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
  if (!user) throw new Error("Non autenticato.");

  const { data: segnalazione, error: erroreLettura } = await supabase
    .from("segnalazioni")
    .select("*")
    .eq("id", segnalazioneId)
    .single();
  if (erroreLettura || !segnalazione) throw new Error(erroreLettura?.message || "Segnalazione non trovata.");

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
      creato_da: user.id,
    })
    .select("id, numero")
    .single();
  if (erroreTicket) throw new Error(erroreTicket.message);

  const { error: erroreStato } = await supabase
    .from("segnalazioni")
    .update({ stato: "Trasmessa", aggiornato_il: new Date().toISOString() })
    .eq("id", segnalazioneId);
  if (erroreStato) throw new Error(erroreStato.message);

  await supabase.from("storico").insert([
    {
      origine: "segnalazione",
      riferimento_id: segnalazioneId,
      operazione: "Trasmessa per installazione",
      valore_prima: segnalazione.stato,
      valore_dopo: "Trasmessa",
      operatore_id: user.id,
    },
    {
      origine: "ticket",
      riferimento_id: ticket.id,
      operazione: "Creato da Segnalazione",
      valore_dopo: `Segnalazione #${segnalazione.numero}`,
      operatore_id: user.id,
    },
  ]);

  revalidatePath("/segnalazioni");
  revalidatePath("/tickets");
  return ticket;
}
