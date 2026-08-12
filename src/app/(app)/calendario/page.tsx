import { CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CalendarioBoard } from "@/components/calendario/calendario-board";
import { listaEventiGoogleCalendario } from "@/lib/google-calendar";
import type { Appuntamento, MaterialeMagazzino, NotaCalendario } from "@/lib/types";

export type VistaCalendario = "giorno" | "settimana" | "mese";

// ★ la vista Mese può interrogare Google Calendar su un range di 6
// settimane — più margine dei 10s di default di una funzione serverless.
export const maxDuration = 30;

function formattaData(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Lunedì della settimana che contiene `d` (domenica=0 in JS → trattata come fine settimana). */
function lunediSettimana(d: Date): Date {
  const l = new Date(d);
  const giorno = l.getDay();
  l.setDate(l.getDate() + (giorno === 0 ? -6 : 1 - giorno));
  l.setHours(0, 0, 0, 0);
  return l;
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; data?: string }>;
}) {
  const params = await searchParams;
  const vista: VistaCalendario = params.vista === "giorno" || params.vista === "mese" ? params.vista : "settimana";
  const dataRiferimento = params.data && /^\d{4}-\d{2}-\d{2}$/.test(params.data) ? new Date(`${params.data}T00:00:00`) : new Date();

  // ★ il range da interrogare dipende dalla vista: un giorno solo, la
  // settimana (lun-dom), o l'intera griglia del mese (incluse le code di
  // giorni del mese precedente/successivo che riempiono la griglia).
  let inizioRange: Date;
  let fineRange: Date;
  if (vista === "giorno") {
    inizioRange = new Date(dataRiferimento);
    fineRange = new Date(dataRiferimento);
  } else if (vista === "settimana") {
    inizioRange = lunediSettimana(dataRiferimento);
    fineRange = new Date(inizioRange);
    fineRange.setDate(fineRange.getDate() + 6);
  } else {
    const primoDelMese = new Date(dataRiferimento.getFullYear(), dataRiferimento.getMonth(), 1);
    const ultimoDelMese = new Date(dataRiferimento.getFullYear(), dataRiferimento.getMonth() + 1, 0);
    inizioRange = lunediSettimana(primoDelMese);
    fineRange = lunediSettimana(ultimoDelMese);
    fineRange.setDate(fineRange.getDate() + 6);
  }
  fineRange.setHours(23, 59, 59, 999);

  const supabase = await createClient();

  const [{ data: appuntamenti }, { data: note }, { data: persone }, { data: ticket }, { data: materiali }, eventiGoogleGrezzi] = await Promise.all([
    supabase
      .from("appuntamenti")
      .select("*")
      .gte("data_ora", inizioRange.toISOString())
      .lte("data_ora", fineRange.toISOString())
      .order("data_ora", { ascending: true }),
    supabase
      .from("note_calendario")
      .select("*")
      .gte("data_promemoria", formattaData(inizioRange))
      .lte("data_promemoria", formattaData(fineRange))
      .order("data_promemoria", { ascending: true }),
    supabase.from("persone").select("id, nome, attivo, amministratore, reparti").eq("attivo", true),
    supabase
      .from("tickets")
      .select("id, numero, cliente, indirizzo, telefono")
      .not("stato", "in", "(Completato,Annullato)")
      .order("data_creazione", { ascending: false }),
    // ★ NUOVA — serve al pannello "Apri scheda di lavoro" nel dettaglio
    // appuntamento (vedi calendario-board.tsx), stesso form già usato in
    // Vista Tecnico, che richiede il catalogo materiali per il selettore.
    supabase.from("materiali_magazzino").select("*").eq("attivo", true).order("ordine", { ascending: true }),
    listaEventiGoogleCalendario(inizioRange, fineRange),
  ]);

  // ★ un Appuntamento creato da qui è ANCHE un evento sullo stesso
  // calendario Google (google_event_id) — va escluso dagli eventi Google
  // letti sopra, altrimenti comparirebbe due volte (come Appuntamento e
  // come evento Google separato).
  const idEventiGiaCollegati = new Set((appuntamenti ?? []).map((a) => a.google_event_id).filter(Boolean));
  const eventiGoogle = eventiGoogleGrezzi.filter((e) => !idEventiGiaCollegati.has(e.id));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <CalendarDays className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Calendario</h1>
          <p className="text-sm text-muted-foreground">Appuntamenti, installazioni e promemoria.</p>
        </div>
      </div>

      <CalendarioBoard
        appuntamenti={(appuntamenti as Appuntamento[]) ?? []}
        note={(note as NotaCalendario[]) ?? []}
        persone={persone ?? []}
        ticket={ticket ?? []}
        eventiGoogle={eventiGoogle}
        vista={vista}
        dataRiferimento={formattaData(dataRiferimento)}
        catalogoMateriali={(materiali as MaterialeMagazzino[]) ?? []}
      />
    </div>
  );
}
