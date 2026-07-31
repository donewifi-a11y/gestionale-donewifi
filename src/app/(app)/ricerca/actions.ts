"use server";

import { createClient } from "@/lib/supabase/server";

export interface RisultatoRicerca {
  tipo: "ticket" | "segnalazione" | "cliente";
  id: string;
  numero: number | null;
  titolo: string;
  sottotitolo: string;
}

// ★ ex cercaGlobale()/cercaTicketWeb() del vecchio gestionale — un'unica
// ricerca su Ticket, Segnalazioni e (da qui) Clienti Aruba, invece dei
// soli filtri per pagina.
export async function ricercaGlobale(query: string): Promise<RisultatoRicerca[]> {
  const testo = query.trim();
  if (testo.length < 2) return [];
  const supabase = await createClient();

  const numero = Number(testo);
  const filtroNumero = Number.isFinite(numero) ? `,numero.eq.${numero}` : "";

  const [{ data: tickets }, { data: segnalazioni }, { data: clienti }] = await Promise.all([
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
    supabase
      .from("clienti_esterni")
      .select("id, nome, cognome, ragionesociale, telefono, comune")
      .eq("contratto_attivo", true)
      .or(
        `nome.ilike.%${testo}%,cognome.ilike.%${testo}%,ragionesociale.ilike.%${testo}%,telefono.ilike.%${testo}%,codice_fiscale.ilike.%${testo}%`
      )
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
  const risultatiCliente: RisultatoRicerca[] = (clienti ?? []).map((c) => ({
    tipo: "cliente",
    id: String(c.id),
    numero: null,
    titolo: c.ragionesociale || [c.cognome, c.nome].filter(Boolean).join(" ") || "—",
    sottotitolo: `Cliente${c.telefono ? ` · ${c.telefono}` : ""}${c.comune ? ` · ${c.comune}` : ""}`,
  }));

  return [...risultatiTicket, ...risultatiSegnalazione, ...risultatiCliente];
}
