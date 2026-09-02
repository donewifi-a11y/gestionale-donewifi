"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";

const BUCKET = "documenti";

async function verificaAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Non autenticato.";
  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona)) return "Non hai i permessi per gestire lo storage.";
  return null;
}

export interface FileMedia {
  percorso: string;
  dimensione: number;
  creatoIl: string | null;
  riferimento: RiferimentoFile | null;
}

/** ★ NUOVA (2026-09-02, richiesta esplicita: "possiamo avere un pulsante
 * allora per pulire la memoria dei media e poter scegliere cosa cancellare,
 * solo per amministratore?" — seguito della domanda su Google Drive) —
 * dove va il file quando viene cancellato: tabella/colonna/id da aggiornare
 * per non lasciare un riferimento morto (es. il pulsante "Vedi contratto"
 * che punta a un file appena cancellato). `tipoValore` distingue una
 * colonna singola (es. `firma_url`) da un array jsonb (es. `foto`) — la
 * cancellazione toglie solo l'elemento giusto dall'array, non l'intera riga. */
export interface RiferimentoFile {
  tabella: string;
  id: string;
  colonna: string;
  tipoValore: "singolo" | "array";
  etichetta: string;
}

/** Percorre ricorsivamente il bucket (le "cartelle" di Supabase Storage
 * sono solo un prefisso nel path — `list()` le restituisce come voci con
 * `id: null`, i file veri hanno un id). Il bucket ha al massimo 2-3 livelli
 * di profondità per come viene scritto altrove nel gestionale, ma la
 * ricorsione non presume una struttura fissa: si adatta da sola se in
 * futuro compare un nuovo prefisso. */
async function elencaRicorsivo(service: ReturnType<typeof createServiceClient>, path: string): Promise<{ percorso: string; dimensione: number; creatoIl: string | null }[]> {
  const risultati: { percorso: string; dimensione: number; creatoIl: string | null }[] = [];
  let offset = 0;
  const limite = 1000;
  for (;;) {
    const { data, error } = await service.storage.from(BUCKET).list(path, { limit: limite, offset, sortBy: { column: "name", order: "asc" } });
    if (error || !data) break;
    for (const voce of data) {
      const percorsoCompleto = path ? `${path}/${voce.name}` : voce.name;
      if (voce.id === null) {
        risultati.push(...(await elencaRicorsivo(service, percorsoCompleto)));
      } else {
        risultati.push({
          percorso: percorsoCompleto,
          dimensione: (voce.metadata?.size as number | undefined) ?? 0,
          creatoIl: voce.created_at ?? null,
        });
      }
    }
    if (data.length < limite) break;
    offset += limite;
  }
  return risultati;
}

/** Costruisce la mappa percorso→riferimento incrociando tutte le tabelle
 * che salvano un percorso dentro il bucket "documenti" (vedi i 6 punti di
 * upload sparsi nel gestionale). Un file assente da questa mappa è
 * probabilmente "orfano" — la riga che lo referenziava è stata cancellata,
 * o l'array `foto`/`documenti` è stato svuotato altrove (es. il cron
 * notturno di pulizia-documenti per le Richieste Clienti scadute). */
async function costruisciRiferimenti(service: ReturnType<typeof createServiceClient>): Promise<Map<string, RiferimentoFile>> {
  const mappa = new Map<string, RiferimentoFile>();

  // ★ lookup unico per numero/cliente Ticket, riusato da schede_lavoro,
  // rapportini_intervento e tickets.dettagli_extra — evita 3 query separate
  // sulla stessa tabella.
  const { data: tickets } = await service.from("tickets").select("id, numero, cliente, dettagli_extra");
  const ticketPerId = new Map((tickets ?? []).map((t) => [t.id, t]));

  const { data: schede } = await service.from("schede_lavoro").select("id, ticket_id, tipo, foto, firma_cliente_url, firma_tecnico_url");
  for (const s of schede ?? []) {
    const ticket = s.ticket_id ? ticketPerId.get(s.ticket_id) : null;
    const etichetta = `Scheda ${s.tipo === "Nuova installazione" ? "Installazione" : "Lavorazione"}${ticket ? ` — Ticket #${ticket.numero} (${ticket.cliente})` : ""}`;
    for (const f of (s.foto as { nome: string; percorso: string }[] | null) ?? []) {
      mappa.set(f.percorso, { tabella: "schede_lavoro", id: s.id, colonna: "foto", tipoValore: "array", etichetta: `${etichetta} — foto` });
    }
    if (s.firma_cliente_url) mappa.set(s.firma_cliente_url, { tabella: "schede_lavoro", id: s.id, colonna: "firma_cliente_url", tipoValore: "singolo", etichetta: `${etichetta} — firma cliente` });
    if (s.firma_tecnico_url) mappa.set(s.firma_tecnico_url, { tabella: "schede_lavoro", id: s.id, colonna: "firma_tecnico_url", tipoValore: "singolo", etichetta: `${etichetta} — firma tecnico` });
  }

  const { data: rapportini } = await service.from("rapportini_intervento").select("id, ticket_id, foto, firma_url");
  for (const r of rapportini ?? []) {
    const ticket = r.ticket_id ? ticketPerId.get(r.ticket_id) : null;
    const etichetta = `Rapportino${ticket ? ` — Ticket #${ticket.numero} (${ticket.cliente})` : ""}`;
    for (const f of (r.foto as { nome: string; percorso: string }[] | null) ?? []) {
      mappa.set(f.percorso, { tabella: "rapportini_intervento", id: r.id, colonna: "foto", tipoValore: "array", etichetta: `${etichetta} — foto` });
    }
    if (r.firma_url) mappa.set(r.firma_url, { tabella: "rapportini_intervento", id: r.id, colonna: "firma_url", tipoValore: "singolo", etichetta: `${etichetta} — firma` });
  }

  const { data: segnalazioni } = await service.from("segnalazioni").select("id, numero, nome, contratto_pdf_url").not("contratto_pdf_url", "is", null);
  for (const s of segnalazioni ?? []) {
    if (s.contratto_pdf_url) mappa.set(s.contratto_pdf_url, { tabella: "segnalazioni", id: s.id, colonna: "contratto_pdf_url", tipoValore: "singolo", etichetta: `Contratto — Segnalazione #${s.numero} (${s.nome})` });
  }

  const { data: richieste } = await service.from("richieste_clienti").select("id, tipo_richiesta, cliente, documenti");
  for (const r of richieste ?? []) {
    for (const d of (r.documenti as { nome: string; percorso: string; tipo?: string }[] | null) ?? []) {
      mappa.set(d.percorso, { tabella: "richieste_clienti", id: r.id, colonna: "documenti", tipoValore: "array", etichetta: `${r.tipo_richiesta} — ${r.cliente}` });
    }
  }

  for (const t of tickets ?? []) {
    const extra = t.dettagli_extra as Record<string, string> | null;
    const percorso = extra?._allegato;
    if (percorso) mappa.set(percorso, { tabella: "tickets", id: t.id, colonna: "dettagli_extra", tipoValore: "singolo", etichetta: `Allegato — Ticket #${t.numero} (${t.cliente})` });
  }

  const { data: messaggi } = await service.from("messaggi_chat").select("id, conversazione_id, allegato_url, allegato_nome").not("allegato_url", "is", null);
  for (const m of messaggi ?? []) {
    if (m.allegato_url) mappa.set(m.allegato_url, { tabella: "messaggi_chat", id: m.id, colonna: "allegato_url", tipoValore: "singolo", etichetta: `Chat — ${m.allegato_nome ?? "allegato"}` });
  }

  return mappa;
}

export async function elencaFileMedia(): Promise<{ errore: string | null; file: FileMedia[] }> {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso, file: [] };

  const service = createServiceClient();
  const [file, riferimenti] = await Promise.all([elencaRicorsivo(service, ""), costruisciRiferimenti(service)]);

  return {
    errore: null,
    file: file.map((f) => ({ ...f, riferimento: riferimenti.get(f.percorso) ?? null })),
  };
}

/** Cancella i file scelti sia dallo storage sia dal riferimento nella
 * tabella d'origine (tolto dall'array `foto`/`documenti`, o la colonna
 * singola messa a null) — senza questo secondo passaggio un pulsante come
 * "Vedi contratto" o "Vedi firma" resterebbe a puntare a un file sparito,
 * fallendo con un errore invece di semplicemente non mostrare più nulla. */
export async function eliminaFileMedia(percorsi: string[]): Promise<{ errore: string | null; eliminati: number }> {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso, eliminati: 0 };
  if (percorsi.length === 0) return { errore: null, eliminati: 0 };

  const service = createServiceClient();
  // ★ i riferimenti si ricalcolano qui, non si fidano di quelli mostrati al
  // client (potrebbero essere di qualche secondo prima) — evita di pulire
  // la colonna sbagliata se nel frattempo la riga è cambiata.
  const riferimenti = await costruisciRiferimenti(service);

  for (const percorso of percorsi) {
    const rif = riferimenti.get(percorso);
    if (!rif) continue;
    if (rif.tipoValore === "singolo") {
      await service.from(rif.tabella).update({ [rif.colonna]: null }).eq("id", rif.id);
    } else {
      const { data: riga } = await service.from(rif.tabella).select(rif.colonna).eq("id", rif.id).maybeSingle();
      const arrayAttuale = (riga as Record<string, { percorso: string }[]> | null)?.[rif.colonna] ?? [];
      const arrayFiltrato = arrayAttuale.filter((v) => v.percorso !== percorso);
      await service.from(rif.tabella).update({ [rif.colonna]: arrayFiltrato }).eq("id", rif.id);
    }
  }

  const { error, data } = await service.storage.from(BUCKET).remove(percorsi);
  if (error) return { errore: error.message, eliminati: 0 };

  return { errore: null, eliminati: data?.length ?? percorsi.length };
}
