"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type DatiCliente = {
  nome: string;
  telefono: string;
  email: string;
  indirizzo: string;
  tariffa_id: string;
  canone_mensile: string;
  scadenza_contratto: string;
  note: string;
};

// ★ ex aggiornaClienteAttivo()/_registraClienteAttivo() del vecchio
// gestionale — qui un solo upsert: se il cliente (per id, o per telefono
// se non ha ancora un record proprio) esiste già lo aggiorna, altrimenti
// lo crea. Dati contrattuali (tariffa/canone/scadenza) che non stanno su
// nessun Ticket.
export async function salvaDatiContrattualiCliente(clienteId: string | null, dati: DatiCliente) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const payload = {
    nome: dati.nome,
    telefono: dati.telefono || null,
    email: dati.email || null,
    indirizzo: dati.indirizzo || null,
    tariffa_id: dati.tariffa_id || null,
    canone_mensile: dati.canone_mensile ? Number(dati.canone_mensile) : null,
    scadenza_contratto: dati.scadenza_contratto || null,
    note: dati.note || null,
    aggiornato_il: new Date().toISOString(),
  };

  const { error } = clienteId
    ? await supabase.from("clienti").update(payload).eq("id", clienteId)
    : await supabase.from("clienti").insert(payload);
  if (error) return { errore: error.message };

  revalidatePath("/clienti");
  return { errore: null };
}
