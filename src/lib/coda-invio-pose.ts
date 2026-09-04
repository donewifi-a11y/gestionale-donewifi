"use client";

import { salvaSchedaLavoroEsterno } from "@/app/pose/actions";
import { caricaFotoScheda } from "@/lib/carica-foto-scheda";
import type { DatiSchedaLavoro } from "@/app/(app)/calendario/actions";
import type { TipoServizioAppuntamento } from "@/lib/types";

/**
 * ★ NUOVA (2026-09-04, richiesta esplicita: "studia le ultime tendenze
 * ui/ux... fammi con artifact delle proposte" → artifact "Proposte UX
 * 2026", proposta ④ (Pose offline-first), primo passo concordato: solo la
 * Scheda di Installazione/Lavorazione, non l'intera app pose) — prima, se
 * la rete cadeva proprio al momento dell'invio finale (zone di montagna,
 * cantine, case in costruzione — reale in Valle d'Aosta), il tecnico
 * vedeva un errore e doveva riprovare finché non tornava il segnale,
 * rischiando di perdere foto/dati se chiudeva l'app nel frattempo. `bozza-
 * scheda.ts` salvava già i campi testo (non le foto, dichiaratamente, "non
 * serializzabili in JSON") — questa è la stessa idea estesa a foto e
 * invio vero e proprio, con IndexedDB (unico storage di un browser capace
 * di contenere dei Blob) invece di localStorage.
 *
 * Nota sul perché basta mettere in coda solo l'ULTIMO passo (foto+invio):
 * la conferma del cliente (`firmaCliente`, un codice via email) richiede
 * comunque una connessione per essere ottenuta — se il tecnico è arrivato
 * fin qui, la rete c'era ancora un momento fa. Il caso reale coperto è
 * "la linea è cascata proprio ora", non "mai stata connessa".
 */

interface VoceCoda {
  id: string;
  tipo: TipoServizioAppuntamento;
  appuntamentoId: string;
  etichetta: string;
  creatoIl: string;
  dati: DatiSchedaLavoro;
  foto: { nome: string; tipo: string; blob: Blob }[];
}

const DB_NOME = "poseCodaInvio";
const STORE = "schede";

function apriDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const richiesta = indexedDB.open(DB_NOME, 1);
    richiesta.onupgradeneeded = () => {
      richiesta.result.createObjectStore(STORE, { keyPath: "id" });
    };
    richiesta.onsuccess = () => resolve(richiesta.result);
    richiesta.onerror = () => reject(richiesta.error);
  });
}

export async function accodaScheda(voce: Omit<VoceCoda, "id" | "creatoIl">): Promise<void> {
  const db = await apriDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ ...voce, id: crypto.randomUUID(), creatoIl: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function elencaCoda(): Promise<VoceCoda[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await apriDb();
  const elenco = await new Promise<VoceCoda[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const richiesta = tx.objectStore(STORE).getAll();
    richiesta.onsuccess = () => resolve(richiesta.result as VoceCoda[]);
    richiesta.onerror = () => reject(richiesta.error);
  });
  db.close();
  return elenco.sort((a, b) => a.creatoIl.localeCompare(b.creatoIl));
}

async function rimuoviDallaCoda(id: string): Promise<void> {
  const db = await apriDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/**
 * Riprova a inviare ogni scheda in coda (carica le foto rimaste sul
 * telefono, poi salva). Una scheda riuscita esce dalla coda; una fallita
 * ci resta — l'errore va segnalato da chi chiama, non qui (questa funzione
 * gira anche in background, senza un posto ovvio dove mostrare un toast).
 */
export async function sincronizzaCodaInvio(): Promise<{ riuscite: number; fallite: { etichetta: string; errore: string }[] }> {
  const coda = await elencaCoda();
  let riuscite = 0;
  const fallite: { etichetta: string; errore: string }[] = [];

  for (const voce of coda) {
    try {
      const foto = await Promise.all(
        voce.foto.map((f) => caricaFotoScheda(new File([f.blob], f.nome, { type: f.tipo }), voce.appuntamentoId))
      );
      const risultato = await salvaSchedaLavoroEsterno(voce.appuntamentoId, voce.tipo, voce.dati, foto);
      if (risultato.errore) {
        fallite.push({ etichetta: voce.etichetta, errore: risultato.errore });
        continue;
      }
      await rimuoviDallaCoda(voce.id);
      riuscite++;
    } catch (err) {
      // ★ ancora offline (o di nuovo) — resta in coda, si riprova al
      // prossimo giro (evento "online", riapertura app, pulsante manuale).
      fallite.push({ etichetta: voce.etichetta, errore: err instanceof Error ? err.message : "Ancora nessuna connessione." });
    }
  }
  return { riuscite, fallite };
}
