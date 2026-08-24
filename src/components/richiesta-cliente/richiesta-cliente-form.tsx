"use client";

import { useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IndirizzoAutocomplete } from "@/components/condivisi/indirizzo-autocomplete";
import { validaCodiceFiscale, validaPartitaIva, validaIban } from "@/lib/validazione";
import type { SlugRichiestaCliente } from "@/lib/richieste-cliente-config";
import { RICHIESTE_CLIENTE_CONFIG } from "@/lib/richieste-cliente-config";

function Consenso() {
  return (
    <label className="flex items-start gap-2 text-xs text-muted-foreground">
      <input type="checkbox" name="consenso" required className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Ho letto e accetto l&apos;
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
          informativa privacy
        </a>
        .
      </span>
    </label>
  );
}

function Errore({ testo }: { testo: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
      {testo}
    </p>
  );
}

function Successo() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-card p-8 text-center shadow-2xl">
      <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={2} />
      <p className="font-heading text-lg font-bold">Richiesta inviata</p>
      <p className="text-sm text-muted-foreground">Grazie! Il nostro staff procederà con la pratica.</p>
    </div>
  );
}

function FileUpload({ id, label }: { id: string; label: string }) {
  const [nome, setNome] = useState("");
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <label
        htmlFor={id}
        className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground transition hover:border-primary hover:text-primary"
      >
        <Upload className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        <span className="truncate">{nome || "Immagine o PDF"}</span>
      </label>
      <input id={id} name={id} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setNome(e.target.files?.[0]?.name || "")} />
    </div>
  );
}

async function invia(dati: FormData, setInCorso: (v: boolean) => void, setErrore: (v: string) => void, setInviato: (v: boolean) => void) {
  setInCorso(true);
  try {
    const risposta = await fetch("/api/richiesta-cliente", { method: "POST", body: dati });
    const risultato = await risposta.json();
    if (!risposta.ok) throw new Error(risultato.errore || "Errore imprevisto.");
    setInviato(true);
  } catch (err) {
    setErrore(err instanceof Error ? err.message : "Errore imprevisto.");
  } finally {
    setInCorso(false);
  }
}

export function RichiestaClienteForm({
  slug,
  ticketId,
  praticaId,
  clienteEsternoId,
}: {
  slug: SlugRichiestaCliente;
  ticketId: string | null;
  praticaId?: string | null;
  /** ★ NUOVA (2026-08) — collega la pratica al cliente vero (anagrafica
   * Aruba) invece che a un Ticket, vedi proposta "Pratiche cliente senza
   * Ticket". Solo per le 3 pratiche che non hanno bisogno di un secondo
   * consenso (Subentro resta sul suo flusso dedicato — doppio consenso via
   * Ticket, già costruito a parte). */
  clienteEsternoId?: number | null;
}) {
  if (slug === "cambio-iban") return <FormCambioIban ticketId={ticketId} clienteEsternoId={clienteEsternoId ?? null} />;
  if (slug === "cambio-anagrafica") return <FormCambioAnagrafica ticketId={ticketId} clienteEsternoId={clienteEsternoId ?? null} />;
  if (slug === "trasferimento") return <FormTrasferimento ticketId={ticketId} clienteEsternoId={clienteEsternoId ?? null} />;
  return <FormSubentro ticketId={ticketId} praticaId={praticaId ?? null} />;
}

function FormCambioIban({ ticketId, clienteEsternoId }: { ticketId: string | null; clienteEsternoId: number | null }) {
  const [inCorso, setInCorso] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [errore, setErrore] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const iban = String(dati.get("iban") || "").trim();
    const esito = validaIban(iban);
    if (!esito.valido) return setErrore(esito.messaggio);
    dati.set("tipo", RICHIESTE_CLIENTE_CONFIG["cambio-iban"].tipo);
    dati.set("nomeCliente", String(dati.get("nome") || ""));
    if (ticketId) dati.set("ticketId", ticketId);
    if (clienteEsternoId) dati.set("clienteEsternoId", String(clienteEsternoId));
    await invia(dati, setInCorso, setErrore, setInviato);
  }

  if (inviato) return <Successo />;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-2xl sm:p-6">
      <div>
        <Label htmlFor="nome">Nome e Cognome *</Label>
        <Input id="nome" name="nome" autoFocus required className="mt-1 h-10" />
      </div>
      <div>
        <Label htmlFor="cf">Codice Fiscale</Label>
        <Input id="cf" name="cf" className="mt-1 h-10 uppercase" maxLength={16} />
      </div>
      <div>
        <Label htmlFor="iban">Nuovo IBAN *</Label>
        <Input id="iban" name="iban" required placeholder="IT60X0542811101000000123456" className="mt-1 h-10 uppercase" />
      </div>
      <div>
        <Label htmlFor="note">Note (facoltativo)</Label>
        <textarea id="note" name="note" rows={2} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
      </div>
      <Consenso />
      {errore && <Errore testo={errore} />}
      <Button type="submit" disabled={inCorso} size="lg" className="mt-2">
        {inCorso ? "Invio in corso…" : "Invia richiesta"}
      </Button>
    </form>
  );
}

function FormCambioAnagrafica({ ticketId, clienteEsternoId }: { ticketId: string | null; clienteEsternoId: number | null }) {
  const [inCorso, setInCorso] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [errore, setErrore] = useState("");
  const [modTelefono, setModTelefono] = useState(false);
  const [modEmail, setModEmail] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    if (!modTelefono && !modEmail) return setErrore("Seleziona almeno un dato da modificare.");
    dati.set("tipo", RICHIESTE_CLIENTE_CONFIG["cambio-anagrafica"].tipo);
    dati.set("nomeCliente", String(dati.get("nome") || ""));
    if (ticketId) dati.set("ticketId", ticketId);
    if (clienteEsternoId) dati.set("clienteEsternoId", String(clienteEsternoId));
    await invia(dati, setInCorso, setErrore, setInviato);
  }

  if (inviato) return <Successo />;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-2xl sm:p-6">
      <div>
        <Label htmlFor="nome">Nome e Cognome *</Label>
        <Input id="nome" name="nome" autoFocus required className="mt-1 h-10" />
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={modTelefono} onChange={(e) => setModTelefono(e.target.checked)} className="h-4 w-4" />
        Modifica telefono
      </label>
      {modTelefono && (
        <Input name="nuovoTelefono" type="tel" placeholder="Nuovo numero di telefono" className="h-10" />
      )}

      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={modEmail} onChange={(e) => setModEmail(e.target.checked)} className="h-4 w-4" />
        Modifica email
      </label>
      {modEmail && (
        <Input name="nuovaEmail" type="email" placeholder="Nuovo indirizzo email" className="h-10" />
      )}

      <div>
        <Label htmlFor="note">Note (facoltativo)</Label>
        <textarea id="note" name="note" rows={2} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
      </div>
      <Consenso />
      {errore && <Errore testo={errore} />}
      <Button type="submit" disabled={inCorso} size="lg" className="mt-2">
        {inCorso ? "Invio in corso…" : "Invia richiesta"}
      </Button>
    </form>
  );
}

function FormTrasferimento({ ticketId, clienteEsternoId }: { ticketId: string | null; clienteEsternoId: number | null }) {
  const [inCorso, setInCorso] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [errore, setErrore] = useState("");
  const [via, setVia] = useState("");
  const [comune, setComune] = useState("");
  const [cap, setCap] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    dati.set("via", via);
    dati.set("comune", comune);
    dati.set("cap", cap);
    dati.set("tipo", RICHIESTE_CLIENTE_CONFIG.trasferimento.tipo);
    dati.set("nomeCliente", String(dati.get("nome") || ""));
    if (ticketId) dati.set("ticketId", ticketId);
    if (clienteEsternoId) dati.set("clienteEsternoId", String(clienteEsternoId));
    await invia(dati, setInCorso, setErrore, setInviato);
  }

  if (inviato) return <Successo />;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-2xl sm:p-6">
      <div>
        <Label htmlFor="nome">Nome e Cognome / Ragione Sociale *</Label>
        <Input id="nome" name="nome" autoFocus required className="mt-1 h-10" />
      </div>
      <div>
        <Label htmlFor="telefono">Telefono *</Label>
        <Input id="telefono" name="telefono" type="tel" required className="mt-1 h-10" />
      </div>
      <div>
        <Label htmlFor="via">Via / Frazione *</Label>
        <IndirizzoAutocomplete
          id="via"
          name="via"
          value={via}
          onChange={setVia}
          onSeleziona={(d) => { setVia(d.via); if (d.comune) setComune(d.comune); if (d.cap) setCap(d.cap); }}
          className="mt-1 h-10"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Input name="civico" placeholder="Civico *" required className="h-10" />
        <Input value={comune} onChange={(e) => setComune(e.target.value)} placeholder="Comune *" required className="h-10" />
        <Input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="CAP *" required className="h-10" />
      </div>
      <div>
        <Label htmlFor="piano">Piano / Interno (facoltativo)</Label>
        <Input id="piano" name="piano" placeholder="Es. 2° piano, interno 4" className="mt-1 h-10" />
      </div>
      <div>
        <Label htmlFor="dataPreferita">Data preferita per il trasferimento (facoltativo)</Label>
        <Input id="dataPreferita" name="dataPreferita" type="date" className="mt-1 h-10" />
      </div>
      <div>
        <Label htmlFor="note">Note (facoltativo)</Label>
        <textarea id="note" name="note" rows={2} placeholder="Tetti spioventi, alberi alti, scale lunghe…" className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
      </div>
      <Consenso />
      {errore && <Errore testo={errore} />}
      <Button type="submit" disabled={inCorso} size="lg" className="mt-2">
        {inCorso ? "Invio in corso…" : "Invia richiesta"}
      </Button>
    </form>
  );
}

function FormSubentro({ ticketId, praticaId }: { ticketId: string | null; praticaId: string | null }) {
  const [inCorso, setInCorso] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [errore, setErrore] = useState("");
  const [tipologia, setTipologia] = useState<"privato" | "piva">("privato");
  const [metodoPagamento, setMetodoPagamento] = useState<"bonifico" | "iban">("bonifico");
  const [intestatarioDiverso, setIntestatarioDiverso] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);

    if (!dati.get("volontaSubentro")) return setErrore("Devi confermare di voler subentrare in questo contratto per procedere.");

    if (tipologia === "privato") {
      const cf = String(dati.get("cf") || "").trim();
      if (cf && !validaCodiceFiscale(cf).valido) return setErrore(validaCodiceFiscale(cf).messaggio);
    } else {
      const piva = String(dati.get("piva") || "").trim();
      if (piva && !validaPartitaIva(piva).valido) return setErrore(validaPartitaIva(piva).messaggio);
    }
    if (metodoPagamento === "iban") {
      const iban = String(dati.get("iban") || "").trim();
      const esito = validaIban(iban);
      if (!esito.valido) return setErrore(esito.messaggio);
      if (!dati.get("mandatoSepa")) return setErrore("Devi autorizzare il mandato di addebito SEPA per procedere con l'IBAN.");
    }

    dati.set("tipologia", tipologia);
    dati.set("metodoPagamento", metodoPagamento);
    dati.set("tipo", RICHIESTE_CLIENTE_CONFIG.subentro.tipo);
    dati.set("nomeCliente", tipologia === "privato" ? String(dati.get("nome") || "") : String(dati.get("ragioneSociale") || ""));
    if (ticketId) dati.set("ticketId", ticketId);
    if (praticaId) dati.set("praticaId", praticaId);
    await invia(dati, setInCorso, setErrore, setInviato);
  }

  if (inviato) return <Successo />;
  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-2xl sm:p-6">
      <div>
        <Label>Tipologia Cliente</Label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setTipologia("privato")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tipologia === "privato" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
            👤 Privato
          </button>
          <button type="button" onClick={() => setTipologia("piva")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tipologia === "piva" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
            🏢 Partita IVA
          </button>
        </div>
      </div>

      {tipologia === "privato" ? (
        <>
          <div>
            <Label htmlFor="nome">Nome e Cognome *</Label>
            <Input id="nome" name="nome" required className="mt-1 h-10" />
          </div>
          <div>
            <Label htmlFor="cf">Codice Fiscale</Label>
            <Input id="cf" name="cf" className="mt-1 h-10 uppercase" maxLength={16} />
          </div>
        </>
      ) : (
        <>
          <div>
            <Label htmlFor="ragioneSociale">Ragione Sociale *</Label>
            <Input id="ragioneSociale" name="ragioneSociale" required className="mt-1 h-10" />
          </div>
          <div>
            <Label htmlFor="piva">Partita IVA</Label>
            <Input id="piva" name="piva" className="mt-1 h-10" maxLength={11} />
          </div>
          <div>
            <Label htmlFor="cfAzienda">Codice Fiscale Azienda (se diverso)</Label>
            <Input id="cfAzienda" name="cfAzienda" className="mt-1 h-10 uppercase" maxLength={16} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input name="pec" type="email" placeholder="PEC" className="h-10" />
            <Input name="sdi" placeholder="Codice SDI" maxLength={7} className="h-10" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input name="legaleRappresentanteNome" placeholder="Nome Legale Rappresentante" className="h-10" />
            <Input name="legaleRappresentanteCf" placeholder="CF Legale Rappresentante" className="h-10 uppercase" maxLength={16} />
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input name="telefono" type="tel" placeholder="Telefono" className="h-10" />
        <Input name="email" type="email" placeholder="Email" className="h-10" />
      </div>

      <div>
        <Label>Metodo di pagamento</Label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMetodoPagamento("bonifico")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${metodoPagamento === "bonifico" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
            💳 Bonifico
          </button>
          <button type="button" onClick={() => setMetodoPagamento("iban")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${metodoPagamento === "iban" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
            🏦 Addebito IBAN (SDD)
          </button>
        </div>
      </div>

      {metodoPagamento === "iban" && (
        <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={intestatarioDiverso} onChange={(e) => setIntestatarioDiverso(e.target.checked)} className="h-4 w-4" />
            Conto intestato ad altra persona
          </label>
          {intestatarioDiverso && (
            <div className="grid grid-cols-2 gap-3">
              <Input name="ibanIntestatarioNome" placeholder="Nome Cognome intestatario" className="h-10" />
              <Input name="ibanIntestatarioCf" placeholder="CF intestatario" className="h-10 uppercase" maxLength={16} />
            </div>
          )}
          <div>
            <Label htmlFor="iban">IBAN *</Label>
            <Input id="iban" name="iban" required placeholder="IT60X0542811101000000123456" className="mt-1 h-10 uppercase" />
          </div>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="mandatoSepa" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Autorizzo Done Wifi ad emettere, per il tramite della propria banca, richieste di incasso sul conto indicato, in conformità al mandato di addebito diretto SEPA.
          </label>
        </div>
      )}

      <div>
        <Label htmlFor="tipoDocumento">Tipo documento</Label>
        <select id="tipoDocumento" name="tipoDocumento" defaultValue="CI" className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm">
          <option value="CI">Carta d&apos;Identità</option>
          <option value="PATENTE">Patente</option>
          <option value="PASSAPORTO">Passaporto</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FileUpload id="fronteDoc" label="Fronte Documento" />
        <FileUpload id="retroDoc" label="Retro Documento" />
        <FileUpload id="fronteTS" label="Fronte Tessera Sanitaria" />
        <FileUpload id="retroTS" label="Retro Tessera Sanitaria" />
      </div>

      <div>
        <Label htmlFor="note">Note (facoltativo)</Label>
        <textarea id="note" name="note" rows={2} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
      </div>
      {/* ★ NUOVA (2026-08) — distinta dalla spunta privacy sotto: qui è la
      dichiarazione di volontà del nuovo cliente a voler assumere il
      contratto (richiesta esplicita — vedi proposta "Sistema Subentro").
      La cessione del vecchio cliente si conferma separatamente, sul link
      che riceve lui, non qui. */}
      <label className="flex items-start gap-2 rounded-lg bg-primary/5 p-2.5 text-xs font-medium text-primary">
        <input type="checkbox" name="volontaSubentro" required className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Confermo di voler subentrare in questo contratto, assumendone la titolarità.
      </label>
      <Consenso />
      {errore && <Errore testo={errore} />}
      <Button type="submit" disabled={inCorso} size="lg" className="mt-2">
        {inCorso ? "Invio in corso…" : "Invia Richiesta di Subentro"}
      </Button>
    </form>
  );
}
