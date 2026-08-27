import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";

// ★ NUOVA (2026-08-26) — sessione per pose.donewifi.it, il sistema
// semplificato per i tecnici esterni (richiesta esplicita: "non passare
// dal gestionale"). Deliberatamente NON Supabase Auth e NON persona.ts:
// un tecnico esterno non ha un login condiviso né reparti/permessi sul
// gestionale — solo un account fisso (email+password) proprio, verificato
// via RPC `verifica_login_tecnico_esterno()` (migrazione 0061). Cookie
// firmato con lo stesso schema HMAC di persona.ts (COOKIE_PERSONA) per lo
// stesso motivo: senza firma, chiunque potrebbe scrivere
// `document.cookie = "tecnico_esterno_id=..."` dai DevTools e vedere gli
// interventi di un altro tecnico.
const COOKIE_TECNICO = "tecnico_esterno_id";

function segreto(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("SUPABASE_SERVICE_ROLE_KEY mancante: impossibile firmare il cookie tecnico esterno.");
  // ★ prefisso diverso da persona.ts pur usando lo stesso segreto: una
  // firma valida per il cookie persona non deve valere anche per questo,
  // e viceversa (due namespace di sessione indipendenti sullo stesso HMAC key).
  return `tecnico-esterno:${s}`;
}

function firma(tecnicoId: string): string {
  return createHmac("sha256", segreto()).update(tecnicoId).digest("hex");
}

function verificaFirma(tecnicoId: string, firmaRicevuta: string): boolean {
  const attesa = Buffer.from(firma(tecnicoId));
  const ricevuta = Buffer.from(firmaRicevuta);
  return attesa.length === ricevuta.length && timingSafeEqual(attesa, ricevuta);
}

export async function getTecnicoEsternoCorrenteId(): Promise<string | null> {
  const store = await cookies();
  const valore = store.get(COOKIE_TECNICO)?.value;
  if (!valore) return null;

  const separatore = valore.lastIndexOf(".");
  if (separatore === -1) return null;
  const id = valore.slice(0, separatore);
  const firmaRicevuta = valore.slice(separatore + 1);
  if (!verificaFirma(id, firmaRicevuta)) return null;
  return id;
}

export async function impostaCookieTecnicoEsterno(tecnicoId: string) {
  const store = await cookies();
  store.set(COOKIE_TECNICO, `${tecnicoId}.${firma(tecnicoId)}`, {
    maxAge: 60 * 60 * 24 * 180,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    // ★ FIX (2026-08-27, trovato in un giro di test pre-lancio) — stesso
    // fix di persona.ts, vedi lì per il commento completo.
    secure: process.env.NODE_ENV === "production",
  });
}

export async function rimuoviCookieTecnicoEsterno() {
  const store = await cookies();
  store.delete(COOKIE_TECNICO);
}

export interface TecnicoEsternoSessione {
  id: string;
  nome: string;
  cognome: string | null;
}

/** Il tecnico esterno collegato (cookie firmato) — o null se non attivo/non valido. */
export async function getTecnicoEsternoCorrente(): Promise<TecnicoEsternoSessione | null> {
  const id = await getTecnicoEsternoCorrenteId();
  if (!id) return null;
  const service = createServiceClient();
  const { data } = await service
    .from("tecnici_esterni")
    .select("id, nome, cognome")
    .eq("id", id)
    .eq("attivo", true)
    .maybeSingle();
  return data ?? null;
}
