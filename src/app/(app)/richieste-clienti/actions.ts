"use server";

import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente } from "@/lib/persona";
import { urlFirmataDocumento } from "@/lib/documenti";
import { revalidatePath } from "next/cache";

export async function urlDocumentoRichiesta(percorso: string) {
  const supabase = await createClient();
  // ★ FIX SICUREZZA — controllava solo `!!user` (sessione Supabase Auth
  // valida), non che lo staff fosse ancora attivo: `persone.attivo = false`
  // non revoca la sessione, e sotto si passa alla service role (bypassa
  // la RLS) per generare l'URL firmata del documento.
  const persona = await getPersonaCorrente(supabase);
  if (!persona) return { errore: "Non autenticato.", url: null };

  return urlFirmataDocumento(percorso);
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
