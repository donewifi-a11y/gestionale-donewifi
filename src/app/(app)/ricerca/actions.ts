"use server";

import { createClient } from "@/lib/supabase/server";

export interface RisultatoRicerca {
  tipo: "ticket" | "segnalazione";
  id: string;
  numero: number;
  titolo: string;
  sottotitolo: string;
}

// ★ ex cercaGlobale()/cercaTicketWeb() del vecchio gestionale — un'unica
// ricerca su Ticket e Segnalazioni, invece dei soli filtri per pagina.
export async function ricercaGlobale(query: string): Promise<RisultatoRicerca[]> {
  const testo = query.trim();
  if (testo.length < 2) return [];
  const supabase = await createClient();

  const numero = Number(testo);
  const filtroNumero = Number.isFinite(numero) ? `,numero.eq.${numero}` : "";

  const [{ data: tickets }, { data: segnalazioni }] = await Promise.all([
    supabase
      .from("tickets")
      .select("id, numero, cliente, categoria, stato")
      .or(`cliente.ilike.%${testo}%${filtroNumero}`)
      .limit(8),
    supabase
      .from("segnalazioni")
      .select("id, numero, nome, comune, stato")
      .or(`nome.ilike.%${testo}%${filtroNumero}`)
      .limit(8),
  ]);

  const risultatiTicket: RisultatoRicerca[] = (tickets ?? []).map((t) => ({
    tipo: "ticket",
    id: t.id,
    numero: t.numero,
    titolo: t.cliente,
    sottotitolo: `Ticket #${t.numero} · ${t.categoria} · ${t.stato}`,
  }));
  const risultatiSegnalazione: RisultatoRicerca[] = (segnalazioni ?? []).map((s) => ({
    tipo: "segnalazione",
    id: s.id,
    numero: s.numero,
    titolo: s.nome,
    sottotitolo: `Segnalazione #${s.numero} · ${s.comune} · ${s.stato}`,
  }));

  return [...risultatiTicket, ...risultatiSegnalazione];
}
