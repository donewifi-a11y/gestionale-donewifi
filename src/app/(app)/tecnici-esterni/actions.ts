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
//
// ★ FIX (2026-08-26, richiesta esplicita) — "per i tecnici userei un nome
// utente che definiamo noi e la password la segniamo noi": niente più
// email come identificativo né password provvisoria generata a caso
// (come per Persone) — l'admin sceglie username e password lui stesso,
// se li segna da sé (una password scelta dall'admin non può comunque
// essere "rimostrata" dopo: l'hash resta a senso unico, stesso principio
// di qualunque password su questo progetto).
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

export async function creaTecnicoEsterno(dati: {
  nome: string;
  cognome: string;
  telefono: string;
  username: string;
  password: string;
  email: string;
}): Promise<{ errore: string | null }> {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso };

  const username = dati.username.trim();
  if (!dati.nome.trim()) return { errore: "Il nome è obbligatorio." };
  if (!username) return { errore: "Il nome utente è obbligatorio." };
  if (!dati.password.trim()) return { errore: "La password è obbligatoria." };
  if (dati.password.trim().length < 6) return { errore: "La password deve avere almeno 6 caratteri." };

  const service = createServiceClient();

  const { data, error } = await service
    .from("tecnici_esterni")
    .insert({
      nome: dati.nome.trim(),
      cognome: dati.cognome.trim() || null,
      telefono: dati.telefono.trim() || null,
      username,
      email: dati.email.trim() || null,
      // ★ placeholder qualunque: sovrascritto subito sotto dall'unica
      // funzione che sa fare l'hash — stesso principio di creaPersona().
      password_hash: "-",
    })
    .select("id")
    .single();
  if (error) return { errore: error.message.includes("unique") ? "Esiste già un tecnico con questo nome utente." : error.message };

  const { error: erroreHash } = await service.rpc("imposta_password_tecnico_esterno", { p_id: data.id, p_password: dati.password.trim() });
  if (erroreHash) return { errore: erroreHash.message };

  revalidatePath("/tecnici-esterni");
  return { errore: null };
}

export async function aggiornaTecnicoEsterno(
  id: string,
  dati: { nome: string; cognome: string; telefono: string; username: string; email: string; attivo: boolean; nuovaPassword: string }
): Promise<{ errore: string | null }> {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso };

  const username = dati.username.trim();
  if (!dati.nome.trim()) return { errore: "Il nome è obbligatorio." };
  if (!username) return { errore: "Il nome utente è obbligatorio." };
  if (dati.nuovaPassword.trim() && dati.nuovaPassword.trim().length < 6) return { errore: "La password deve avere almeno 6 caratteri." };

  const service = createServiceClient();
  const { error } = await service
    .from("tecnici_esterni")
    .update({
      nome: dati.nome.trim(),
      cognome: dati.cognome.trim() || null,
      telefono: dati.telefono.trim() || null,
      username,
      email: dati.email.trim() || null,
      attivo: dati.attivo,
    })
    .eq("id", id);
  if (error) return { errore: error.message.includes("unique") ? "Esiste già un tecnico con questo nome utente." : error.message };

  if (dati.nuovaPassword.trim()) {
    const { error: erroreHash } = await service.rpc("imposta_password_tecnico_esterno", { p_id: id, p_password: dati.nuovaPassword.trim() });
    if (erroreHash) return { errore: erroreHash.message };
  }

  revalidatePath("/tecnici-esterni");
  return { errore: null };
}
