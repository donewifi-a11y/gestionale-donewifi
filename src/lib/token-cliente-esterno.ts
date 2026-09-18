import { createHmac, timingSafeEqual } from "crypto";

/**
 * ★ NUOVA (2026-09-18, audit Portale/Richiesta Cliente, Bug Critico
 * confermato — IDOR) — `api/richiesta-cliente/route.ts` accettava
 * `clienteEsternoId` come numero grezzo mandato dal client (sia dal flusso
 * di autoidentificazione nel Portale — telefono+CF — sia dal link generato
 * dallo staff dalla scheda Cliente Esterno), senza alcuna verifica che chi
 * lo inviava avesse davvero superato l'identificazione o ricevuto quel
 * link. `clienti_esterni.id` è una colonna intera sequenziale (non un
 * UUID): chiunque poteva enumerarla e agganciare una pratica (Cambio IBAN,
 * Cambio Anagrafica, Trasferimento) a un cliente reale a piacere.
 *
 * Stesso schema HMAC già in uso in persona.ts/tecnico-esterno.ts per i
 * cookie firmati, qui applicato a un token con scadenza incluso nel
 * payload (non in un cookie): l'id del Cliente Esterno passa sempre e solo
 * come questo token firmato, mai come numero nudo — verificato lato server
 * prima di essere usato per davvero.
 */
const DURATA_TOKEN_MS = 30 * 24 * 60 * 60 * 1000; // 30 giorni — un link mandato al cliente deve restare valido per un tempo ragionevole, non solo per la sessione in corso.

function segreto(): string {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("SUPABASE_SERVICE_ROLE_KEY mancante: impossibile firmare il token Cliente Esterno.");
  // ★ prefisso diverso dagli altri usi dello stesso segreto (persona,
  // tecnico esterno) pur condividendone la chiave — namespace di firma
  // indipendenti, una firma valida per uno non deve valere per l'altro.
  return `cliente-esterno-token:${s}`;
}

function firma(payload: string): string {
  return createHmac("sha256", segreto()).update(payload).digest("hex");
}

/** Genera un token firmato per un id di `clienti_esterni`, valido 30 giorni. */
export function firmaClienteEsterno(id: number): string {
  const scadenza = Date.now() + DURATA_TOKEN_MS;
  const payload = `${id}.${scadenza}`;
  return `${payload}.${firma(payload)}`;
}

/** Verifica un token generato da `firmaClienteEsterno()` — `null` se assente, scaduto o manomesso. */
export function verificaTokenClienteEsterno(token: string | null | undefined): number | null {
  if (!token) return null;
  const parti = token.split(".");
  if (parti.length !== 3) return null;
  const [idStr, scadenzaStr, firmaRicevuta] = parti;
  const id = Number(idStr);
  const scadenza = Number(scadenzaStr);
  if (!Number.isInteger(id) || !Number.isFinite(scadenza)) return null;
  if (Date.now() > scadenza) return null;

  const attesa = Buffer.from(firma(`${idStr}.${scadenzaStr}`));
  const ricevuta = Buffer.from(firmaRicevuta);
  if (attesa.length !== ricevuta.length || !timingSafeEqual(attesa, ricevuta)) return null;
  return id;
}
