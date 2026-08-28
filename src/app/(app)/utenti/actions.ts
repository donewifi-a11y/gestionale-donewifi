"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { revalidatePath } from "next/cache";
import type { AreaAccesso } from "@/lib/types";

// ★ le Server Action, in produzione, nascondono al client il messaggio di
// un errore lanciato con "throw" (Next.js lo sostituisce con un digest
// generico per sicurezza) — per mostrare messaggi utili all'utente
// bisogna restituirli come dato, non lanciarli. "errore" qui è quel dato.
// ★ il permesso di gestire gli Utenti (login condivisi) segue ora il
// livello di accesso della PERSONA corrente, non più quello dell'account
// condiviso: un login "Tutto" può ospitare persone con ruoli diversi.
async function verificaAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Non autenticato.";

  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona)) {
    return "Non hai i permessi per gestire gli utenti.";
  }
  return null;
}

export async function creaStaff(dati: { email: string; password: string; nome: string; area_accesso: AreaAccesso }) {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso };

  const service = createServiceClient();

  const { data: creato, error: erroreAuth } = await service.auth.admin.createUser({
    email: dati.email,
    password: dati.password,
    email_confirm: true,
  });
  if (erroreAuth || !creato?.user) {
    return { errore: erroreAuth?.message || "Creazione dell'accesso non riuscita." };
  }

  const { error: erroreStaff } = await service.from("staff").insert({
    id: creato.user.id,
    email: dati.email,
    nome: dati.nome || null,
    area_accesso: dati.area_accesso,
    permessi: [],
    attivo: true,
  });
  if (erroreStaff) return { errore: erroreStaff.message };

  revalidatePath("/persone");
  return { errore: null };
}

export async function aggiornaStaff(id: string, dati: { nome: string; area_accesso: AreaAccesso; attivo: boolean }) {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso };

  // ★ FIX — "staff" non ha mai avuto una policy RLS di scrittura per il
  // client normale (solo "leggi il tuo profilo"): questo update, con la
  // sessione dell'utente, non modificava alcuna riga senza segnalare
  // errore — l'azione sembrava riuscire ma non cambiava mai nulla.
  const service = createServiceClient();
  const { error } = await service
    .from("staff")
    .update({ nome: dati.nome || null, area_accesso: dati.area_accesso, attivo: dati.attivo })
    .eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/persone");
  return { errore: null };
}
