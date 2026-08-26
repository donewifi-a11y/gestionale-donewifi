"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { revalidatePath } from "next/cache";
import type { TecnicoEsterno } from "@/lib/types";

// ★ NUOVA (2026-08-26) — amministrazione degli account pose.donewifi.it
// (sistema separato per i tecnici esterni). Stesso schema di sicurezza di
// persone/actions.ts: verificaAdmin() qui, ogni scrittura con la service
// role (tecnici_esterni non ha policy INSERT/UPDATE per `authenticated`,
// vedi migrazione 0061).
async function verificaAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Non autenticato.";

  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona)) {
    return "Non hai i permessi per gestire i tecnici esterni.";
  }
  return null;
}

export async function getTecniciEsterni(): Promise<TecnicoEsterno[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tecnici_esterni").select("*").order("nome", { ascending: true });
  if (error) console.error("getTecniciEsterni:", error.message);
  return (data as TecnicoEsterno[]) ?? [];
}

function generaPasswordProvvisoria(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let risultato = "";
  for (let i = 0; i < 10; i++) risultato += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return risultato;
}

/** Crea l'account e restituisce la password provvisoria da comunicare al
 * tecnico — mostrata una sola volta, l'hash non torna mai indietro. */
export async function creaTecnicoEsterno(dati: {
  nome: string;
  cognome: string;
  telefono: string;
  email: string;
}): Promise<{ errore: string | null; password: string | null }> {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso, password: null };

  const email = dati.email.trim();
  if (!dati.nome.trim()) return { errore: "Il nome è obbligatorio.", password: null };
  if (!email) return { errore: "L'email è obbligatoria (è l'utente di accesso a pose.donewifi.it).", password: null };

  const service = createServiceClient();
  const password = generaPasswordProvvisoria();

  const { data, error } = await service
    .from("tecnici_esterni")
    .insert({
      nome: dati.nome.trim(),
      cognome: dati.cognome.trim() || null,
      telefono: dati.telefono.trim() || null,
      email,
      // ★ placeholder qualunque: sovrascritto subito sotto da
      // imposta_password_tecnico_esterno() (unica funzione che sa fare
      // l'hash — non lo calcoliamo qui in JS per restare all'unico posto,
      // stesso principio di creaPersona()/imposta_password_persona()).
      password_hash: "-",
    })
    .select("id")
    .single();
  if (error) return { errore: error.message.includes("unique") ? "Esiste già un tecnico con questa email." : error.message, password: null };

  const { error: erroreHash } = await service.rpc("imposta_password_tecnico_esterno", { p_id: data.id, p_password: password });
  if (erroreHash) return { errore: erroreHash.message, password: null };

  revalidatePath("/tecnici-esterni");
  return { errore: null, password };
}

export async function aggiornaTecnicoEsterno(
  id: string,
  dati: { nome: string; cognome: string; telefono: string; email: string; attivo: boolean }
): Promise<{ errore: string | null }> {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso };

  const email = dati.email.trim();
  if (!dati.nome.trim()) return { errore: "Il nome è obbligatorio." };
  if (!email) return { errore: "L'email è obbligatoria." };

  const service = createServiceClient();
  const { error } = await service
    .from("tecnici_esterni")
    .update({ nome: dati.nome.trim(), cognome: dati.cognome.trim() || null, telefono: dati.telefono.trim() || null, email, attivo: dati.attivo })
    .eq("id", id);
  if (error) return { errore: error.message.includes("unique") ? "Esiste già un tecnico con questa email." : error.message };

  revalidatePath("/tecnici-esterni");
  return { errore: null };
}

export async function reimpostaPasswordTecnicoEsterno(id: string): Promise<{ errore: string | null; password: string | null }> {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso, password: null };

  const service = createServiceClient();
  const nuovaPassword = generaPasswordProvvisoria();
  const { error } = await service.rpc("imposta_password_tecnico_esterno", { p_id: id, p_password: nuovaPassword });
  if (error) return { errore: error.message, password: null };

  return { errore: null, password: nuovaPassword };
}
