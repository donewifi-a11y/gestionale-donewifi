import { HardHat, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPersonaCorrente, getPersonaCorrenteId, personaHaAccessoAdmin } from "@/lib/persona";
import { VistaTecnicoBoard } from "@/components/vista-tecnico/vista-tecnico-board";
import type { Appuntamento, MaterialeMagazzino, Persona, Ticket } from "@/lib/types";
import { inizioGiornataItalia, fineGiornataItalia } from "@/lib/data-italia";

export default async function VistaTecnicoPage() {
  const supabase = await createClient();
  const personaId = await getPersonaCorrenteId();
  const persona = await getPersonaCorrente(supabase);
  const isAdmin = personaHaAccessoAdmin(persona);

  // ★ FIX (2026-09-17, code review approfondita) — vedi lib/data-italia.ts:
  // "oggi" calcolato nel fuso del processo (UTC su Vercel) invece che in
  // quello dello staff, sballato per 1-2 ore ogni notte.
  const oraInizio = inizioGiornataItalia();
  const oraFine = fineGiornataItalia();

  // ★ NUOVA (2026-09-16, bug reale segnalato: "perché i ticket non
  // possono essere chiusi dall'operatore, tipo anna gaggiolo") — questa
  // pagina interrogava solo "tecnico_assegnato = tua persona": un Ticket
  // ancora senza nessuno assegnato (frequente per uno appena arrivato)
  // era invisibile qui, per chiunque — non un permesso mancante, la query
  // stessa lo escludeva. Nuova query "non assegnati nel mio reparto",
  // accanto a "i miei" — vedi "Chiudi Ticket" in vista-tecnico-board.tsx.
  const repartiPersona = persona?.reparti ?? [];
  // ★ un admin vede tutti i reparti (stesso principio di personaVedeReparto()
  // in lib/persona.ts); chiunque altro solo i propri — un placeholder
  // impossibile invece di un `.in()` con array vuoto (comportamento non
  // garantito) per chi non ha ancora nessun reparto assegnato.
  const repartiFiltro = isAdmin ? null : repartiPersona.length > 0 ? repartiPersona : ["__nessuno__"];

  let queryNonAssegnati = supabase
    .from("tickets")
    .select("*")
    .is("tecnico_assegnato", null)
    .is("tecnico_esterno_id", null)
    .not("stato", "in", "(Completato,Annullato)")
    .order("data_creazione", { ascending: false });
  if (repartiFiltro) queryNonAssegnati = queryNonAssegnati.in("reparto", repartiFiltro);

  const [{ data: appuntamenti }, { data: tickets }, { data: ticketsNonAssegnati }, { data: completatiOggi }, { data: materiali }, { data: persone }] = await Promise.all([
    // ★ FIX (2026-08-28, richiesta esplicita: "una sezione in cui ci sono
    // le installazioni da fare rapporto di lavoro quando non completate",
    // estesa qui dopo aver trovato lo stesso problema anche lato interno —
    // vedi il commento gemello in app/pose/actions.ts) — prima il filtro
    // `.gte(oggi)` faceva sparire dal tutto un appuntamento "Programmato"
    // con una data ormai passata (mai completato: intervento saltato,
    // rimandato, o semplicemente non chiuso quel giorno). Trovati 5
    // appuntamenti reali già in questa condizione, invisibili ovunque
    // (nessun Ticket collegato a cui appoggiarsi). Tolto il limite
    // inferiore: VistaTecnicoBoard divide "In ritardo" da "Di oggi" invece
    // di lasciarli mescolati — vedi lì.
    supabase
      .from("appuntamenti")
      .select("*")
      .eq("tecnico_id", personaId ?? "")
      .eq("stato", "Programmato")
      .lte("data_ora", oraFine.toISOString())
      .order("data_ora", { ascending: true }),
    supabase
      .from("tickets")
      .select("*")
      .eq("tecnico_assegnato", personaId ?? "")
      .not("stato", "in", "(Completato,Annullato)")
      .order("data_creazione", { ascending: false }),
    queryNonAssegnati,
    supabase
      .from("tickets")
      .select("*")
      .eq("tecnico_assegnato", personaId ?? "")
      .eq("stato", "Completato")
      .gte("aggiornato_il", oraInizio.toISOString())
      .lte("aggiornato_il", oraFine.toISOString())
      .order("aggiornato_il", { ascending: false }),
    supabase.from("materiali_magazzino").select("*").eq("attivo", true).order("ordine", { ascending: true }),
    supabase.from("persone").select("id, nome, attivo, amministratore, reparti").eq("attivo", true),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <HardHat className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Vista Tecnico</h1>
          <p className="text-sm text-muted-foreground">Solo quello che è tuo, per oggi.</p>
        </div>
      </div>

      {!personaId ? (
        <div className="flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/10 p-4 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          Seleziona prima &quot;Tu sei&quot; dal menu in basso a sinistra per vedere i tuoi appuntamenti e ticket.
        </div>
      ) : (
        <VistaTecnicoBoard
          appuntamenti={(appuntamenti as Appuntamento[]) ?? []}
          tickets={(tickets as Ticket[]) ?? []}
          ticketsNonAssegnati={(ticketsNonAssegnati as Ticket[]) ?? []}
          completatiOggi={(completatiOggi as Ticket[]) ?? []}
          catalogoMateriali={(materiali as MaterialeMagazzino[]) ?? []}
          personaId={personaId}
          persone={(persone as Persona[]) ?? []}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}
