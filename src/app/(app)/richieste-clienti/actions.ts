"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function urlDocumentoRichiesta(percorso: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato.", url: null };

  const service = createServiceClient();
  const { data, error } = await service.storage.from("documenti").createSignedUrl(percorso, 3600);
  if (error) return { errore: error.message, url: null };
  return { errore: null, url: data.signedUrl };
}

export async function aggiornaStatoRichiestaCliente(id: string, nuovoStato: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { error } = await supabase.from("richieste_clienti").update({ stato: nuovoStato }).eq("id", id);
  if (error) return { errore: error.message };

  revalidatePath("/richieste-clienti");
  return { errore: null };
}
