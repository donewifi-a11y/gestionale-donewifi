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
//
// ★ NUOVA (2026-08) — richiesta esplicita: "poter ricercare solo e
// soltanto le schede clienti". `ambito` facoltativo (default "tutti", per
// non rompere chi già chiama questa action) — con "clienti" le query su
// Ticket/Segnalazioni non partono nemmeno, invece di partire e poi
// scartare i risultati: più veloce, e il limite di 15 risultati (contro 8)
// ha senso mostrarlo tutto sull'unico tipo rimasto.
export async function ricercaGlobale(query: string, ambito: "tutti" | "clienti" = "tutti"): Promise<RisultatoRicerca[]> {
  const testo = query.trim();
  if (testo.length < 2) return [];
  const supabase = await createClient();

  // ★ FIX — `testo` finiva interpolato senza escaping dentro la stringa
  // filtro di `.or()`: virgole/parentesi hanno significato speciale nella
  // sintassi filtro di PostgREST (separano le condizioni, aprono/chiudono
  // gruppi). Un utente che digita una virgola poteva far combinare al
  // volo condizioni non previste sulla stessa tabella (nessuna fuga dalla
  // RLS, ma un bug di robustezza reale — a volte anche un 400 per sintassi
  // rotta). Le tolgo dal testo di ricerca: non servono in un nome/comune.
  const testoSicuro = testo.replace(/[,()]/g, " ").trim();
  if (testoSicuro.length < 2) return [];

  const numero = Number(testoSicuro);
  const filtroNumero = Number.isFinite(numero) ? `,numero.eq.${numero}` : "";
  const limiteClienti = ambito === "clienti" ? 15 : 8;

  const [{ data: tickets }, { data: segnalazioni }, { data: clienti }] = await Promise.all([
    ambito === "clienti"
      ? Promise.resolve({ data: [] })
      : supabase
          .from("tickets")
          .select("id, numero, cliente, categoria, stato")
          .or(`cliente.ilike.%${testoSicuro}%${filtroNumero}`)
          .limit(8),
    ambito === "clienti"
      ? Promise.resolve({ data: [] })
      : supabase
          .from("segnalazioni")
          .select("id, numero, nome, comune, stato")
          .or(`nome.ilike.%${testoSicuro}%${filtroNumero}`)
          .limit(8),
    supabase
      .from("clienti_esterni")
      .select("id, nome, cognome, ragionesociale, telefono, comune")
      .eq("attivo", true)
      .or(
        `nome.ilike.%${testoSicuro}%,cognome.ilike.%${testoSicuro}%,ragionesociale.ilike.%${testoSicuro}%,telefono.ilike.%${testoSicuro}%,codice_fiscale.ilike.%${testoSicuro}%`
      )
      .limit(limiteClienti),
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
