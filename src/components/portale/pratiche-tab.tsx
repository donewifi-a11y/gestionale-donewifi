"use client";

import { useState } from "react";
import { ArrowLeft, CheckCircle2, AlertTriangle, FileEdit, MapPinned, CreditCard, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichiestaClienteForm } from "@/components/richiesta-cliente/richiesta-cliente-form";
import { RICHIESTE_CLIENTE_CONFIG, type SlugRichiestaCliente } from "@/lib/richieste-cliente-config";

// ★ NUOVA (2026-08) — richiesta esplicita: "le richieste possono essere
// richieste sia dal cliente sia dall'operatore dal gestionale" — questa è
// la via del cliente, dal Portale pubblico, senza che uno staff debba
// prima aprire un Ticket e mandargli un link. Solo le 3 pratiche che non
// hanno bisogno di un secondo consenso (Subentro resta sul suo flusso
// dedicato — doppio consenso, già costruito a parte in Ticket).
const PRATICHE_SELF_SERVICE: { slug: SlugRichiestaCliente; icona: typeof FileEdit }[] = [
  { slug: "trasferimento", icona: MapPinned },
  { slug: "cambio-iban", icona: CreditCard },
  { slug: "cambio-anagrafica", icona: FileEdit },
];

export function PraticheTab() {
  const [slug, setSlug] = useState<SlugRichiestaCliente | null>(null);
  const [identificato, setIdentificato] = useState<{ id: number; nome: string } | null>(null);

  function reset() {
    setSlug(null);
    setIdentificato(null);
  }

  if (slug && identificato) {
    return (
      <div>
        <button type="button" onClick={reset} className="mb-3 flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          Ricomincia
        </button>
        <p className="mb-4 flex items-center gap-2 rounded-lg bg-success/10 p-2.5 text-sm font-semibold text-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2.25} />
          Ciao {identificato.nome}, abbiamo trovato il tuo contratto.
        </p>
        <RichiestaClienteForm slug={slug} ticketId={null} clienteEsternoId={identificato.id} />
      </div>
    );
  }

  if (slug) {
    return <FormIdentificazione titolo={RICHIESTE_CLIENTE_CONFIG[slug].titolo} onIndietro={() => setSlug(null)} onIdentificato={setIdentificato} />;
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="mb-1 text-xs text-muted-foreground">Scegli la pratica che ti serve — ti chiederemo telefono e codice fiscale/partita IVA per trovare il tuo contratto.</p>
      {PRATICHE_SELF_SERVICE.map(({ slug: s, icona: Icona }) => (
        <button
          key={s}
          type="button"
          onClick={() => setSlug(s)}
          className="flex items-center gap-3 rounded-xl border p-3.5 text-left transition hover:border-primary hover:bg-accent-soft/40"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icona className="h-4 w-4" strokeWidth={2.25} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{RICHIESTE_CLIENTE_CONFIG[s].titolo}</div>
            <div className="truncate text-xs text-muted-foreground">{RICHIESTE_CLIENTE_CONFIG[s].intro}</div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.25} />
        </button>
      ))}
    </div>
  );
}

// ★ Opzione C della proposta "Come trovare il cliente": telefono + CF/PIVA
// insieme, mai un caso ambiguo di più risultati da gestire (a differenza di
// solo telefono, che con un numero di famiglia condiviso può corrispondere
// a più persone).
function FormIdentificazione({
  titolo,
  onIndietro,
  onIdentificato,
}: {
  titolo: string;
  onIndietro: () => void;
  onIdentificato: (v: { id: number; nome: string }) => void;
}) {
  const [telefono, setTelefono] = useState("");
  const [codiceFiscale, setCodiceFiscale] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    setInCorso(true);
    try {
      const risposta = await fetch("/api/portale/trova-cliente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono, codiceFiscale }),
      });
      const risultato = await risposta.json();
      if (!risposta.ok) throw new Error(risultato.errore || "Errore imprevisto.");
      onIdentificato({ id: risultato.clienteEsternoId, nome: risultato.nome });
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore imprevisto.");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={onIndietro} className="mb-3 flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
        Indietro
      </button>
      <p className="mb-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">{titolo}</p>
      <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
        <p className="text-xs text-muted-foreground">Per trovare il tuo contratto, inserisci entrambi i dati.</p>
        <div>
          <Label htmlFor="telefono">Telefono registrato sul contratto *</Label>
          <Input id="telefono" type="tel" required autoFocus value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Es. 340 1234567" className="mt-1 h-10" />
        </div>
        <div>
          <Label htmlFor="cf">Codice Fiscale o Partita IVA *</Label>
          <Input id="cf" required value={codiceFiscale} onChange={(e) => setCodiceFiscale(e.target.value.toUpperCase())} maxLength={16} className="mt-1 h-10 uppercase" />
        </div>
        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}
        <Button type="submit" disabled={inCorso} size="lg" className="mt-1">
          {inCorso ? "Verifica in corso…" : "Continua"}
        </Button>
      </form>
    </div>
  );
}

