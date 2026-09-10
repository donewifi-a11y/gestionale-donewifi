"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin, impostaCookiePersona } from "@/lib/persona";
import { revalidatePath } from "next/cache";
import type { AreaAccesso } from "@/lib/types";

// ★ le Server Action, in produzione, nascondono al client il messaggio di
// un errore lanciato con "throw" — per mostrare messaggi utili bisogna
// restituirli come dato, non lanciarli.
async function verificaAdmin(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "Non autenticato.";

  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona)) {
    return "Non hai i permessi per gestire le persone.";
  }
  return null;
}

// ★ FIX SICUREZZA — "persone" non ha più policy RLS di scrittura per il
// ruolo "authenticated" (vedi 0008_sicurezza_persone.sql): l'unico modo
// di scrivere è tramite la service role, qui, dopo che verificaAdmin() ha
// già controllato il livello della persona corrente. Prima, chiunque
// avesse la sessione poteva scrivere direttamente via REST bypassando
// quel controllo, che viveva solo nel codice dell'app.
//
// ★ NUOVA — login individuale: se si imposta una password insieme a
// un'email, la Persona ottiene un vero accesso Supabase Auth (non solo
// la vecchia password di conferma per il cambio-persona), collegato via
// persone.auth_user_id (migrazione 0011_login_individuale.sql).
export async function creaPersona(dati: { nome: string; email: string; amministratore: boolean; reparti: AreaAccesso[]; password: string }) {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso };

  const email = dati.email.trim();
  const password = dati.password.trim();

  const service = createServiceClient();
  const { data, error } = await service
    .from("persone")
    .insert({ nome: dati.nome, email: email || null, amministratore: dati.amministratore, reparti: dati.reparti })
    .select("id")
    .single();
  if (error) return { errore: error.message };

  if (password) {
    // ★ resta anche come password di conferma per il selettore "Tu sei"
    // (usata finché non tutte le Persone hanno un login individuale).
    const { error: errorePwd } = await service.rpc("imposta_password_persona", {
      p_persona_id: data.id,
      p_password: password,
    });
    if (errorePwd) return { errore: errorePwd.message };

    if (email) {
      const { data: creato, error: erroreAuth } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (erroreAuth || !creato?.user) {
        return { errore: erroreAuth?.message || "Persona creata, ma l'accesso individuale non è riuscito." };
      }
      const { error: erroreLink } = await service.from("persone").update({ auth_user_id: creato.user.id }).eq("id", data.id);
      if (erroreLink) return { errore: erroreLink.message };
    }
  }

  revalidatePath("/persone");
  return { errore: null };
}

export async function aggiornaPersona(
  id: string,
  dati: { nome: string; email: string; amministratore: boolean; reparti: AreaAccesso[]; attivo: boolean; password: string }
) {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso };

  const email = dati.email.trim();
  const password = dati.password.trim();

  const service = createServiceClient();
  const { data: esistente } = await service.from("persone").select("auth_user_id").eq("id", id).single();

  const { error } = await service
    .from("persone")
    .update({ nome: dati.nome, email: email || null, amministratore: dati.amministratore, reparti: dati.reparti, attivo: dati.attivo })
    .eq("id", id);
  if (error) return { errore: error.message };

  if (password) {
    const { error: errorePwd } = await service.rpc("imposta_password_persona", {
      p_persona_id: id,
      p_password: password,
    });
    if (errorePwd) return { errore: errorePwd.message };
  }

  if (email && (password || esistente?.auth_user_id)) {
    if (esistente?.auth_user_id) {
      // ★ account individuale già collegato: aggiorna email/password lì.
      const aggiornamento: { email?: string; password?: string } = { email };
      if (password) aggiornamento.password = password;
      const { error: erroreAuth } = await service.auth.admin.updateUserById(esistente.auth_user_id, aggiornamento);
      if (erroreAuth) return { errore: erroreAuth.message };
    } else if (password) {
      // ★ prima password impostata per questa Persona: crea l'accesso individuale ora.
      const { data: creato, error: erroreAuth } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (erroreAuth || !creato?.user) {
        return { errore: erroreAuth?.message || "Persona aggiornata, ma l'accesso individuale non è riuscito." };
      }
      const { error: erroreLink } = await service.from("persone").update({ auth_user_id: creato.user.id }).eq("id", id);
      if (erroreLink) return { errore: erroreLink.message };
    }
  }

  revalidatePath("/persone");
  return { errore: null };
}

/** ★ NUOVA — richiesta esplicita: "vorrei la possibilità, come amministratore,
 * di disattivare e/o cancellare gli utenti attivi". Disattivare esiste già
 * (aggiornaPersona con `attivo: false`, sopra) — qui la cancellazione vera
 * e propria, definitiva.
 *
 * Impossibile se la Persona ha già Ticket/Schede/rapportini/altro storico
 * collegato: i riferimenti restano intenzionalmente (chi ha creato o
 * chiuso un Ticket in passato deve restare rintracciabile), non si passa a
 * un "SET NULL" silenzioso che cancellerebbe quella tracciabilità. In quel
 * caso — il caso comune, per chiunque abbia lavorato davvero — l'unica
 * strada resta disattivare: l'errore lo dice esplicitamente invece di un
 * messaggio Postgres grezzo sul vincolo di chiave esterna (stesso principio
 * già in uso altrove in questo gestionale per i messaggi tecnici). */
export async function eliminaPersona(id: string) {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso };

  const supabase = await createClient();
  const personaCorrente = await getPersonaCorrente(supabase);
  if (personaCorrente?.id === id) return { errore: "Non puoi eliminare il tuo stesso accesso." };

  const service = createServiceClient();
  const { data: persona } = await service.from("persone").select("nome, auth_user_id").eq("id", id).single();
  if (!persona) return { errore: "Persona non trovata." };

  const { error } = await service.from("persone").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        errore: `${persona.nome} ha già Ticket, Schede o altre attività collegate — non può essere eliminata definitivamente (si perderebbe lo storico di chi ha fatto cosa). Disattivala invece, dal campo "Persona attiva" qui sopra.`,
      };
    }
    return { errore: error.message };
  }

  // ★ elimina anche il login Supabase Auth collegato, se c'era — altrimenti
  // resterebbe un accesso "fantasma" non collegato a nessuna Persona, come
  // trovato e disattivato per fornitori@donewifi.it/donewifi@gmail.com in
  // una sessione precedente (vedi README, 2026-09-10). Non bloccante: la
  // Persona è già stata eliminata con successo sopra.
  if (persona.auth_user_id) {
    const { error: erroreAuth } = await service.auth.admin.deleteUser(persona.auth_user_id);
    if (erroreAuth) {
      console.error("eliminaPersona — persona eliminata ma l'accesso Supabase Auth non è stato rimosso:", erroreAuth.message);
    }
  }

  revalidatePath("/persone");
  return { errore: null };
}

function generaPasswordProvvisoria(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let risultato = "";
  for (let i = 0; i < 10; i++) risultato += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return risultato;
}

/** ★ NUOVA — un admin può reimpostare la password di una Persona con login
 * individuale senza dover intervenire da fuori il gestionale (come fatto
 * a mano, via script, per fornitori@donewifi.it in una sessione precedente). */
export async function reimpostaPasswordPersona(id: string) {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { errore: erroreAccesso, password: null };

  const service = createServiceClient();
  const { data: persona } = await service.from("persone").select("auth_user_id").eq("id", id).single();
  if (!persona?.auth_user_id) {
    return { errore: "Questa persona non ha ancora un login individuale da reimpostare.", password: null };
  }

  const nuovaPassword = generaPasswordProvvisoria();
  const { error } = await service.auth.admin.updateUserById(persona.auth_user_id, { password: nuovaPassword });
  if (error) return { errore: error.message, password: null };

  // ★ tenuta allineata anche la password "di conferma" del selettore "Tu
  // sei". Non blocca l'azione principale (l'accesso vero è già stato
  // reimpostato con successo sopra) ma l'errore va comunque segnalato,
  // non scartato — altrimenti il PIN resterebbe silenziosamente
  // disallineato dalla password reale.
  const { error: erroreSincronizzaPin } = await service.rpc("imposta_password_persona", { p_persona_id: id, p_password: nuovaPassword });
  if (erroreSincronizzaPin) {
    return {
      errore: null,
      password: nuovaPassword,
      avviso: `Accesso reimpostato, ma il PIN "Tu sei" non si è aggiornato: ${erroreSincronizzaPin.message}`,
    };
  }

  return { errore: null, password: nuovaPassword };
}

export interface AttivitaPersona {
  id: string;
  data: string;
  origine: string;
  operazione: string;
  valore_dopo: string | null;
}

/** ★ NUOVA — ultime azioni registrate in storico per questa persona, per
 * avere visibilità senza dover scavare nei singoli Ticket/Segnalazioni. */
export async function getAttivitaPersona(id: string): Promise<AttivitaPersona[]> {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("storico")
    .select("id, data, origine, operazione, valore_dopo")
    .eq("operatore_id", id)
    .order("data", { ascending: false })
    .limit(10);
  if (error) console.error("getAttivitaPersona:", error.message);
  return data ?? [];
}

export interface CaricoPersona {
  attivi: number;
  completatiMese: number;
}

/** ★ NUOVA — carico di lavoro sintetico, centralizzato qui invece di doverlo dedurre dalle Dashboard di reparto. */
export async function getCaricoPersona(id: string): Promise<CaricoPersona> {
  const erroreAccesso = await verificaAdmin();
  if (erroreAccesso) return { attivi: 0, completatiMese: 0 };

  const supabase = await createClient();
  const inizioMese = new Date();
  inizioMese.setDate(1);
  inizioMese.setHours(0, 0, 0, 0);

  const [{ count: attivi }, { count: completatiMese }] = await Promise.all([
    supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("tecnico_assegnato", id)
      .not("stato", "in", "(Completato,Annullato)"),
    supabase
      .from("tickets")
      .select("*", { count: "exact", head: true })
      .eq("tecnico_assegnato", id)
      .eq("stato", "Completato")
      .gte("aggiornato_il", inizioMese.toISOString()),
  ]);

  return { attivi: attivi ?? 0, completatiMese: completatiMese ?? 0 };
}

/** Chiunque sia autenticato può scegliere "chi è" tra le persone attive — con password se ne hanno una impostata.
 *
 * ★ FIX SICUREZZA (2026-09-10, bug reale: "non è possibile aprire i ticket
 * per i diversi reparti da alcuni account" — causa reale trovata: questa
 * funzione non controllava CHI fosse davvero autenticato su Supabase Auth,
 * solo che *qualcuno* lo fosse — con la password di conferma di una
 * Persona (spesso condivisa/semplice, pensata solo come attribuzione, non
 * come vero controllo accessi) chiunque avesse ancora una sessione valida
 * su un vecchio accesso condiviso (es. "fornitori@donewifi.it", nato prima
 * del login individuale, oggi collegato a nessuna Persona) poteva
 * "diventare" qualunque Persona attiva agli occhi dell'app. Il cookie "Tu
 * sei" risultava quindi valido, ma la RLS reale (che guarda `auth.uid()`,
 * non questo cookie) bloccava ogni scrittura — creare o chiudere un
 * Ticket, in qualunque reparto — con un errore che sembrava un bug
 * casuale invece che una conseguenza diretta di questo. Ora si può
 * scegliere un'altra Persona solo se il proprio accesso Supabase Auth è
 * A SUA VOLTA già collegato a una Persona attiva — stesso principio già
 * in uso in selezionaPersonaDopoLogin() (login/actions.ts). */
export async function scegliPersonaCorrente(id: string, password: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { data: personaPropria } = await supabase
    .from("persone")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("attivo", true)
    .maybeSingle();
  if (!personaPropria) {
    return {
      errore:
        "Il tuo accesso non è collegato a nessun profilo attivo — non puoi selezionare qui un'altra persona. Esci dal gestionale e accedi di nuovo con le tue credenziali personali. Se il problema resta, contatta un amministratore.",
    };
  }

  const { data: valida, error } = await supabase.rpc("verifica_password_persona", {
    p_persona_id: id,
    p_password: password,
  });
  if (error) return { errore: error.message };
  if (!valida) return { errore: "Password errata." };

  await impostaCookiePersona(id);
  return { errore: null };
}
