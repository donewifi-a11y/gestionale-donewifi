"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { AreaAccesso } from "@/lib/types";

async function verificaAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autenticato.");

  const { data: staff } = await supabase.from("staff").select("area_accesso").eq("id", user.id).single();
  if (!staff || (staff.area_accesso !== "Tutto" && staff.area_accesso !== "Admin")) {
    throw new Error("Non hai i permessi per gestire gli utenti.");
  }
}

export async function creaStaff(dati: { email: string; password: string; nome: string; area_accesso: AreaAccesso }) {
  await verificaAdmin();
  const service = createServiceClient();

  const { data: creato, error: erroreAuth } = await service.auth.admin.createUser({
    email: dati.email,
    password: dati.password,
    email_confirm: true,
  });
  if (erroreAuth) throw new Error(erroreAuth.message);

  const { error: erroreStaff } = await service.from("staff").insert({
    id: creato.user.id,
    email: dati.email,
    nome: dati.nome || null,
    area_accesso: dati.area_accesso,
    permessi: [],
    attivo: true,
  });
  if (erroreStaff) throw new Error(erroreStaff.message);

  revalidatePath("/utenti");
}

export async function aggiornaStaff(id: string, dati: { nome: string; area_accesso: AreaAccesso; attivo: boolean }) {
  await verificaAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("staff")
    .update({ nome: dati.nome || null, area_accesso: dati.area_accesso, attivo: dati.attivo })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/utenti");
}
