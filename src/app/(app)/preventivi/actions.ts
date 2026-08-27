"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, personaHaAccessoAdmin, ERRORE_PERSONA_MANCANTE } from "@/lib/persona";
import { inviaEmail, emailPreventivo } from "@/lib/email";
import { notificaSuTuttiICanali } from "@/lib/notifiche-interne";
import { formattaValuta } from "@/lib/types";
import type { RigaPreventivo } from "@/lib/types";

function calcolaTotale(righe: RigaPreventivo[]): number {
  return righe.reduce((somma, r) => somma + r.quantita * r.prezzoUnitario, 0);
}

async function verificaAdmin(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Non autenticato.";
  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona)) return "Solo un amministratore può eliminare un Preventivo.";
  return null;
}

export async function creaPreventivo(dati: {
  clienteNome: string;
  clienteTelefono: string;
  clienteEmail: string;
  tipologiaCliente: "Privato" | "Azienda";
  segnalazioneId?: string | null;
  clienteEsternoId?: number | null;
  righe: RigaPreventivo[];
  note: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();
  if (!personaId) return { errore: ERRORE_PERSONA_MANCANTE };

  if (!dati.clienteNome.trim()) return { errore: "Il nome del cliente è obbligatorio." };
  if (dati.righe.length === 0) return { errore: "Aggiungi almeno una voce al preventivo." };

  const { data, error } = await supabase
    .from("preventivi")
    .insert({
      cliente_nome: dati.clienteNome.trim(),
      cliente_telefono: dati.clienteTelefono.trim() || null,
      cliente_email: dati.clienteEmail.trim() || null,
      tipologia_cliente: dati.tipologiaCliente,
      segnalazione_id: dati.segnalazioneId || null,
      cliente_esterno_id: dati.clienteEsternoId || null,
      righe: dati.righe,
      // ★ il totale si ricalcola sempre qui, lato server, invece di fidarsi
      // di quello inviato dal client — le righe (con prezzi presi da
      // Tariffe/Materiali al momento della composizione) sono comunque
      // quelle scelte dall'operatore, ma il totale che finisce sul
      // preventivo/nell'email deve essere garantito coerente con esse.
      totale: calcolaTotale(dati.righe),
      note: dati.note || null,
      operatore_id: personaId,
    })
    .select("id, numero")
    .single();
  if (error) return { errore: error.message };

  await supabase.from("storico").insert({
    origine: "preventivo",
    riferimento_id: data.id,
    operazione: "Creazione Preventivo",
    valore_dopo: "Bozza",
    operatore_id: personaId,
  });

  revalidatePath("/preventivi");
  return { errore: null, id: data.id, numero: data.numero };
}

export async function aggiornaPreventivo(
  id: string,
  dati: { clienteNome: string; clienteTelefono: string; clienteEmail: string; tipologiaCliente: "Privato" | "Azienda"; righe: RigaPreventivo[]; note: string }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  // ★ solo una Bozza si può modificare: un preventivo già inviato non deve
  // cambiare sotto i piedi del cliente che lo sta guardando/ha già risposto.
  const { data: esistente } = await supabase.from("preventivi").select("stato").eq("id", id).single();
  if (!esistente) return { errore: "Preventivo non trovato." };
  if (esistente.stato !== "Bozza") return { errore: "Solo una Bozza può essere modificata." };

  if (!dati.clienteNome.trim()) return { errore: "Il nome del cliente è obbligatorio." };
  if (dati.righe.length === 0) return { errore: "Aggiungi almeno una voce al preventivo." };

  const { error } = await supabase
    .from("preventivi")
    .update({
      cliente_nome: dati.clienteNome.trim(),
      cliente_telefono: dati.clienteTelefono.trim() || null,
      cliente_email: dati.clienteEmail.trim() || null,
      tipologia_cliente: dati.tipologiaCliente,
      righe: dati.righe,
      totale: calcolaTotale(dati.righe),
      note: dati.note || null,
      aggiornato_il: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/preventivi");
  return { errore: null };
}

// ★ richiesta esplicita: il preventivo deve poter essere approvato O
// rifiutato dal cliente, non solo approvato come già succede per contratti/
// interventi — stesso link monouso via email (token_approvazione), ma con
// un terzo tipo di origine e due esiti possibili gestiti dalla route
// pubblica /api/approva/[token].
export async function inviaPreventivoApprovazione(id: string, origine: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };
  const personaId = await getPersonaCorrenteId();

  const { data: preventivo } = await supabase
    .from("preventivi")
    .select("numero, cliente_nome, cliente_email, totale")
    .eq("id", id)
    .single();
  if (!preventivo) return { errore: "Preventivo non trovato." };
  if (!preventivo.cliente_email) return { errore: "Il cliente non ha un'email registrata su questo preventivo." };

  const service = createServiceClient();
  const { data: creato, error } = await service
    .from("token_approvazione")
    .insert({ preventivo_id: id, origine: "preventivo" })
    .select("token")
    .single();
  if (error) return { errore: error.message };

  const link = `${origine}/approva/${creato.token}`;
  const { oggetto, corpoHtml, corpoTesto } = emailPreventivo(preventivo.cliente_nome, preventivo.numero, formattaValuta(preventivo.totale), link);
  const risultato = await inviaEmail({ a: preventivo.cliente_email, oggetto, corpoHtml, corpoTesto, reparto: "Commerciale" });
  if (risultato.errore) return { errore: risultato.errore };

  await supabase
    .from("preventivi")
    .update({ stato: "Inviato", inviato_il: new Date().toISOString(), aggiornato_il: new Date().toISOString() })
    .eq("id", id);

  await supabase.from("storico").insert({
    origine: "preventivo",
    riferimento_id: id,
    operazione: "Preventivo inviato per approvazione",
    valore_dopo: preventivo.cliente_email,
    operatore_id: personaId,
  });

  // ★ ESTESA (2026-08-27, "fai la A" — Proposta A dell'artifact
  // "Estensione Notifiche") — prima solo Chat interna, ora anche
  // Telegram ed email verso attivazioni@donewifi.it.
  await notificaSuTuttiICanali({
    reparto: "Commerciale",
    telegramHtml: `📄 <b>Preventivo inviato</b>\n\n#${preventivo.numero} — ${preventivo.cliente_nome} (${formattaValuta(preventivo.totale)}).`,
    chatTesto: `📄 Preventivo #${preventivo.numero} inviato a ${preventivo.cliente_nome} (${formattaValuta(preventivo.totale)}).`,
    emailTitolo: `Preventivo #${preventivo.numero} inviato`,
    emailCorpoHtml: `<p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">Cliente: <b>${preventivo.cliente_nome}</b><br>Importo: ${formattaValuta(preventivo.totale)}</p>`,
    emailCorpoTesto: `Cliente: ${preventivo.cliente_nome}\nImporto: ${formattaValuta(preventivo.totale)}`,
    emailLink: "https://gestione.donewifi.it/preventivi",
  });

  revalidatePath("/preventivi");
  return { errore: null };
}

export async function eliminaPreventivo(id: string) {
  const supabase = await createClient();
  const erroreAccesso = await verificaAdmin(supabase);
  if (erroreAccesso) return { errore: erroreAccesso };
  const personaId = await getPersonaCorrenteId();

  const { data: preventivo, error: erroreLettura } = await supabase.from("preventivi").select("numero, cliente_nome").eq("id", id).single();
  if (erroreLettura || !preventivo) return { errore: erroreLettura?.message || "Preventivo non trovato." };

  const service = createServiceClient();
  const { error } = await service.from("preventivi").delete().eq("id", id);
  if (error) return { errore: error.message };

  await service.from("storico").insert({
    origine: "preventivo",
    riferimento_id: id,
    operazione: "Preventivo eliminato",
    valore_prima: `#${preventivo.numero} — ${preventivo.cliente_nome}`,
    operatore_id: personaId,
  });

  revalidatePath("/preventivi");
  return { errore: null };
}

export interface RisultatoRicercaCliente {
  tipo: "segnalazione" | "cliente_esterno";
  id: string | number;
  nome: string;
  telefono: string | null;
  email: string | null;
  tipologiaCliente: "Privato" | "Azienda";
}

// ★ NUOVA — il preventivo si crea da una schermata dedicata (non più
// obbligatoriamente da una Segnalazione), ma restare sganciato da chi già
// esiste nel gestionale vorrebbe dire perdere il collegamento nella scheda
// cliente (vedi getPreventiviCollegati in clienti-esterni/actions.ts) e
// riscrivere a mano dati già noti. Cerca sia tra le Segnalazioni sia tra i
// Clienti Esterni (Aruba), stesso tipo di ricerca testuale già in uso
// altrove nel gestionale.
export async function cercaClientiPerPreventivo(query: string): Promise<RisultatoRicercaCliente[]> {
  const testo = query.trim();
  if (testo.length < 2) return [];
  const supabase = await createClient();

  // ★ FIX — stesso bug già corretto in ricerca/actions.ts e
  // tickets/actions.ts (cercaClientiSimili): virgole/parentesi hanno
  // significato speciale nella sintassi filtro di PostgREST — un cliente
  // con una virgola nel nome (o chiunque digiti per errore "Mario, Rossi")
  // rompeva silenziosamente il filtro `.or()` invece di essere trovato.
  const testoSicuro = testo.replace(/[,()]/g, " ").trim();
  if (testoSicuro.length < 2) return [];

  const [segnalazioni, clientiEsterni] = await Promise.all([
    supabase
      .from("segnalazioni")
      .select("id, nome, telefono, email, tipologia_cliente")
      .or(`nome.ilike.%${testoSicuro}%,telefono.ilike.%${testoSicuro}%`)
      .limit(8),
    supabase
      .from("clienti_esterni")
      .select("id, nome, cognome, ragionesociale, telefono, email")
      .or(`nome.ilike.%${testoSicuro}%,cognome.ilike.%${testoSicuro}%,ragionesociale.ilike.%${testoSicuro}%,telefono.ilike.%${testoSicuro}%`)
      .limit(8),
  ]);

  const risultati: RisultatoRicercaCliente[] = [];
  for (const s of segnalazioni.data ?? []) {
    risultati.push({
      tipo: "segnalazione",
      id: s.id,
      nome: s.nome,
      telefono: s.telefono,
      email: s.email,
      tipologiaCliente: s.tipologia_cliente === "Azienda" ? "Azienda" : "Privato",
    });
  }
  for (const c of clientiEsterni.data ?? []) {
    const nome = c.ragionesociale || [c.cognome, c.nome].filter(Boolean).join(" ") || "—";
    risultati.push({
      tipo: "cliente_esterno",
      id: c.id,
      nome,
      telefono: c.telefono,
      email: c.email,
      tipologiaCliente: c.ragionesociale ? "Azienda" : "Privato",
    });
  }
  return risultati;
}
