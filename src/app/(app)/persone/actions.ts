"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin, impostaCookiePersona } from "@/lib/persona";
import { revalidatePath } from "next/cache";
import type { AreaAccesso } from "@/lib/types";

// ★ le Server Action, in produzione, nascondono al client il messaggio di
// un errore lanciato con "throw" — per mostrare messaggi utili bisogna
// restituirli come dato, non lanciarli.
async function verificaAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Non autenticato.";

  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona)) {
    return "Non hai i permessi per gestire le persone.";
  }
  return null;
}

// ★ FIX SICUREZZA — "persone" non ha più policy RLS di scrittura per il
// ruolo "authenticated" (vedi 0008_sicurezza_persone.sql): l'unico modo
// di scrivere è tramite la service role, qui, dopo che verificaAdmin() ha
// già controllato il livello della persona corrente. Prima, chiunque
// avesse la sessione poteva scrivere direttamente via REST bypassando
// quel controllo, che viveva solo nel codice dell'app.
export async function creaPersona(dati: { nome: string; area_accesso: AreaAccesso; password: string }) {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso };

  const service = createServiceClient();
  const { data, error } = await service
    .from("persone")
    .insert({ nome: dati.nome, area_accesso: dati.area_accesso })
    .select("id")
    .single();
  if (error) return { errore: error.message };

  if (dati.password.trim()) {
    const { error: errorePwd } = await service.rpc("imposta_password_persona", {
      p_persona_id: data.id,
      p_password: dati.password.trim(),
    });
    if (errorePwd) return { errore: errorePwd.message };
  }

  revalidatePath("/persone");
  return { errore: null };
}

export async function aggiornaPersona(
  id: string,
  dati: { nome: string; area_accesso: AreaAccesso; attivo: boolean; password: string }
) {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso };

  const service = createServiceClient();
  const { error } = await service
    .from("persone")
    .update({ nome: dati.nome, area_accesso: dati.area_accesso, attivo: dati.attivo })
    .eq("id", id);
  if (error) return { errore: error.message };

  if (dati.password.trim()) {
    const { error: errorePwd } = await service.rpc("imposta_password_persona", {
      p_persona_id: id,
      p_password: dati.password.trim(),
    });
    if (errorePwd) return { errore: errorePwd.message };
  }

  revalidatePath("/persone");
  return { errore: null };
}

/** Chiunque sia autenticato può scegliere "chi è" tra le persone attive — con password se ne hanno una impostata. */
export async function scegliPersonaCorrente(id: string, password: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { data: valida, error } = await supabase.rpc("verifica_password_persona", {
    p_persona_id: id,
    p_password: password,
  });
  if (error) return { errore: error.message };
  if (!valida) return { errore: "Password errata." };

  await impostaCookiePersona(id);
  return { errore: null };
}
