"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaVedeReparto } from "@/lib/persona";
import { createFortunaClient, fortunaConfigurata } from "@/lib/fortuna/client";
import { richiediFortuna } from "@/lib/fortuna/permessi";
import { formattaData } from "@/lib/fortuna/premi";
import { creaSegnalazione } from "@/app/(app)/segnalazioni/actions";

/**
 * ★ NUOVA — quanti coupon Fortuna nessuno ha ancora visto: alimenta il numerino rosso accanto a «Fortuna»
 * nel menu. Mai un errore verso il chiamante: se Fortuna non è raggiungibile o la persona non ha il permesso,
 * il menu resta semplicemente senza numero.
 */
export async function contaCouponDaVedere(): Promise<number> {
  try {
    if (!fortunaConfigurata()) return 0;
    const persona = await getPersonaCorrente(await createClient());
    if (!persona || !personaVedeReparto(persona, "Commerciale")) return 0;
    const { count } = await createFortunaClient()
      .from("fortuna_coupon")
      .select("*", { count: "exact", head: true })
      .is("visto_at", null)
      .neq("stato", "annullato");
    return count ?? 0;
  } catch {
    return 0;
  }
}

export type EsitoSegnalazione = { errore?: string; duplicati?: string[]; numero?: number; id?: string };

/**
 * ★ NUOVA — «Trasforma in segnalazione»: dal coupon visto dallo staff nasce una Segnalazione (Nuovi Clienti,
 * stato «Da Contattare») con nome, telefono, email e coupon già dentro, e da lì prosegue la trafila di sempre:
 * contatto, Gestione Cliente, trasmissione. Usa la stessa `creaSegnalazione()` delle chiamate in arrivo, quindi
 * valida telefono ed email, avvisa dei doppioni e manda le notifiche (Telegram, Chat, email) come per ogni altra.
 * L'indirizzo non c'è: lo raccoglie chi chiama il cliente.
 */
export async function trasformaInSegnalazione(couponId: string, forza = false): Promise<EsitoSegnalazione> {
  const { persona } = await richiediFortuna("operatore");
  const db = createFortunaClient();

  const { data: c } = await db
    .from("fortuna_coupon")
    .select("id, codice, stato, emesso_at, premio_nome, segnalazione_id, segnalazione_numero, part:fortuna_partecipanti(nome, cognome, telefono, email)")
    .eq("id", couponId)
    .maybeSingle();
  if (!c) return { errore: "Coupon non trovato." };
  if (c.segnalazione_id) return { errore: `Questo coupon è già diventato la segnalazione #${c.segnalazione_numero}.`, numero: c.segnalazione_numero ?? undefined, id: c.segnalazione_id };
  if (c.stato === "annullato") return { errore: "Il coupon è annullato: ripristinalo prima di trasformarlo." };

  const part = Array.isArray(c.part) ? c.part[0] : c.part;
  if (!part) return { errore: "Mancano i dati del cliente." };

  const esito = await creaSegnalazione({
    nome: `${part.nome} ${part.cognome}`.trim(),
    telefono: part.telefono,
    email: part.email,
    via: "",
    civico: "",
    comune: "",
    cap: "",
    copertura: "daVerificare",
    note: `Da Fortuna — coupon ${c.codice}: ${c.premio_nome} (emesso il ${formattaData(c.emesso_at)}). Indirizzo da raccogliere durante il contatto.`,
    tipologiaCliente: "Privato",
    forza,
  });
  if (esito.errore) return { errore: esito.errore };
  if ("duplicati" in esito && esito.duplicati) return { duplicati: esito.duplicati };
  if (!("id" in esito) || !esito.id || !("numero" in esito) || esito.numero == null) return { errore: "Segnalazione non creata: riprova." };

  const adesso = new Date().toISOString();
  // la segnalazione esiste già: se questo salvataggio fallisse, il coupon resterebbe "senza collegamento" ma nessun
  // dato va perso. Il filtro sul vuoto evita di sovrascrivere il collegamento se due persone cliccano insieme.
  const { error } = await db
    .from("fortuna_coupon")
    .update({ segnalazione_id: esito.id, segnalazione_numero: esito.numero, segnalazione_at: adesso })
    .eq("id", couponId)
    .is("segnalazione_id", null);
  if (error) console.error("fortuna: collegamento coupon-segnalazione", error);
  await db.from("fortuna_coupon").update({ visto_at: adesso, visto_da: persona.nome }).eq("id", couponId).is("visto_at", null);
  await db.from("fortuna_log").insert({ coupon_id: couponId, azione: `segnalazione #${esito.numero}`, utente: persona.nome });

  revalidatePath("/fortuna", "layout");
  revalidatePath("/segnalazioni");
  return { numero: esito.numero, id: esito.id };
}
