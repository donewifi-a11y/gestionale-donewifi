"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { AreaAccesso } from "@/lib/types";

// ★ le Server Action, in produzione, nascondono al client il messaggio di
// un errore lanciato con "throw" (Next.js lo sostituisce con un digest
// generico per sicurezza) — per mostrare messaggi utili all'utente
// bisogna restituirli come dato, non lanciarli. "errore" qui è quel dato.
async function verificaAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Non autenticato.";

  const { data: staff } = await supabase.from("staff").select("area_accesso").eq("id", user.id).single();
  if (!staff || (staff.area_accesso !== "Tutto" && staff.area_accesso !== "Admin")) {
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

  revalidatePath("/utenti");
  return { errore: null };
}

export async function aggiornaStaff(id: string, dati: { nome: string; area_accesso: AreaAccesso; attivo: boolean }) {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff")
    .update({ nome: dati.nome || null, area_accesso: dati.area_accesso, attivo: dati.attivo })
    .eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/utenti");
  return { errore: null };
}
