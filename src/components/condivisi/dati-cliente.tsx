"use client";

import type { ReactNode } from "react";
import { Check, Copy, ClipboardList } from "lucide-react";
import { IconaCategoria } from "@/components/condivisi/icona-categoria";
import type { CategoriaIcona } from "@/lib/colore-icone";

/**
 * ★ NUOVA (2026-09-03, richiesta esplicita: "rivediamo la grafica di
 * alcune parti... deve essere tutta omologata con il sistema attuale" —
 * mostrato uno screenshot di "Gestione Cliente" → dettaglio pratica: un
 * elenco piatto MAIUSCOLO/valore, zero icone, zero raggruppamento, mentre
 * Segnalazioni → "Dati ricevuti dal cliente" ha da tempo questo stesso
 * trattamento — copia-per-campo, gruppi con "Copia tutto") — RigaDatoCliente/
 * GruppoDatiCliente esistevano solo dentro segnalazioni-board.tsx: estratti
 * qui per essere riusati anche da Gestione Cliente
 * (richieste-clienti-board.tsx) invece di duplicarli o lasciare quella
 * pagina indietro. `segnalazioni-board.tsx` NON è stato toccato (mantiene
 * le proprie copie locali, identiche): a un giro di verifica appena fatto
 * su quel file, zero rischio di regressione per una modifica solo
 * cosmetica altrove.
 */
export const CAMPI_MONOSPAZIATI = new Set([
  "codiceFiscale",
  "cf",
  "codiceFiscaleAzienda",
  "partitaIva",
  "piva",
  "pec",
  "sdi",
  "legaleRappresentanteCf",
  "iban",
  "ibanIntestatarioCf",
  "cap",
]);

export const TIPI_DOCUMENTO: Record<string, string> = { CI: "Carta d'Identità", PATENTE: "Patente", PASSAPORTO: "Passaporto" };

export function formattaValoreCampo(chiave: string, valore: string) {
  if (chiave === "mandatoSepa") return valore === "on" ? "Sì" : valore;
  return valore;
}

export function RigaDatoCliente({
  chiave,
  etichetta,
  valore,
  copiato,
  onCopia,
}: {
  chiave: string;
  etichetta: string;
  valore: string;
  copiato: boolean;
  onCopia: (chiave: string, etichetta: string, valore: string) => void;
}) {
  const mono = CAMPI_MONOSPAZIATI.has(chiave);
  return (
    <button
      type="button"
      onClick={() => onCopia(chiave, etichetta, valore)}
      className="group flex flex-col items-start gap-0.5 rounded-md px-1.5 py-1 text-left transition hover:bg-background"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{etichetta}</span>
      <span className={`flex items-start gap-1.5 text-xs font-medium break-words ${copiato ? "text-success" : ""} ${mono ? "font-mono" : ""}`}>
        {copiato && <Check className="mt-0.5 h-3 w-3 shrink-0" strokeWidth={2.5} />}
        {valore}
        <Copy className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground opacity-40 transition group-hover:opacity-100" strokeWidth={2.25} />
      </span>
    </button>
  );
}

export function GruppoDatiCliente({
  titolo,
  icona: Icona,
  categoria,
  voci,
  campiCopiati,
  onCopiaCampo,
  onCopiaGruppo,
  azioneDestra,
}: {
  titolo: string;
  /** ★ NUOVA (2026-09-03, "omologare col sistema attuale") — icona colorata
   * per tipo di dato (stesso COLORE_ICONA usato ovunque), facoltativa per
   * non rompere i chiamanti esistenti che non la passano ancora. */
  icona?: typeof Copy;
  categoria?: CategoriaIcona;
  voci: { chiave: string; etichetta: string; valore: string }[];
  campiCopiati: Set<string>;
  onCopiaCampo: (chiave: string, etichetta: string, valore: string) => void;
  onCopiaGruppo: (titolo: string, voci: { chiave: string; etichetta: string; valore: string }[]) => void;
  /** ★ NUOVA — slot facoltativo nell'intestazione, a destra di "Copia
   * tutto" (es. "Apri in mappa" per un gruppo Indirizzo). */
  azioneDestra?: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-primary/80">
          {Icona && categoria && <IconaCategoria icona={Icona} categoria={categoria} dimensione="sm" />}
          {titolo}
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {azioneDestra}
          {voci.length > 1 && (
            <button
              type="button"
              onClick={() => onCopiaGruppo(titolo, voci)}
              className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            >
              <ClipboardList className="h-2.5 w-2.5" strokeWidth={2.5} />
              Copia tutto
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {voci.map((v) => (
          <RigaDatoCliente key={v.chiave} chiave={v.chiave} etichetta={v.etichetta} valore={v.valore} copiato={campiCopiati.has(v.chiave)} onCopia={onCopiaCampo} />
        ))}
      </div>
    </div>
  );
}
