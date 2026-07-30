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

  // ★ tenuta allineata anche la password "di conferma" del selettore "Tu sei".
  await service.rpc("imposta_password_persona", { p_persona_id: id, p_password: nuovaPassword });

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
  const { data } = await supabase
    .from("storico")
    .select("id, data, origine, operazione, valore_dopo")
    .eq("operatore_id", id)
    .order("data", { ascending: false })
    .limit(10);
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

/** Chiunque sia autenticato può scegliere "chi è" tra le persone attive — con password se ne hanno una impostata. */
export async function scegliPersonaCorrente(id: string, password: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { errore: "Non autenticato." };

  const { data: valida, error } = await supabase.rpc("verifica_password_persona", {
    p_persona_id: id,
    p_password: password,
  });
  if (error) return { errore: error.message };
  if (!valida) return { errore: "Password errata." };

  await impostaCookiePersona(id);
  return { errore: null };
}
