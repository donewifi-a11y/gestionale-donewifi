"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Upload, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validaCodiceFiscale, validaPartitaIva, validaIban, validaEmail } from "@/lib/validazione";
import { prezziNettoLordo, formattaValuta } from "@/lib/types";
import type { Tariffa } from "@/lib/types";
import type { SceltaPiano } from "@/components/richiesta-dati/configuratore-piano";

function FileUpload({ id, label, obbligatorio }: { id: string; label: string; obbligatorio?: boolean }) {
  const [nome, setNome] = useState("");
  return (
    <div>
      <Label htmlFor={id}>
        {label}
        {obbligatorio && " *"}
      </Label>
      <label
        htmlFor={id}
        className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
      >
        <Upload className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
        <span className="truncate">{nome || "Immagine o PDF"}</span>
      </label>
      <input id={id} name={id} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setNome(e.target.files?.[0]?.name || "")} />
    </div>
  );
}

export function RichiestaDatiForm({
  segnalazioneId,
  giaInviato,
  tariffe,
  sceltaPiano,
  onCambiaPiano,
}: {
  segnalazioneId: string;
  giaInviato: boolean;
  tariffe: Tariffa[];
  /** ★ se il cliente è passato dal configuratore "Scegli il tuo piano",
   * profilo/router/extender sono già decisi: qui si mostra solo il
   * riepilogo (con un link per tornare indietro) invece di richiederli di
   * nuovo — vedi configuratore-piano.tsx. */
  sceltaPiano?: SceltaPiano | null;
  onCambiaPiano?: () => void;
}) {
  const [inCorso, setInCorso] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [errore, setErrore] = useState("");
  const [tipologiaCliente, setTipologiaCliente] = useState<"Privato" | "Azienda">(sceltaPiano?.tipologiaCliente ?? "Privato");
  const [metodoPagamento, setMetodoPagamento] = useState<"Bonifico" | "IBAN">("Bonifico");
  const [intestatarioDiverso, setIntestatarioDiverso] = useState(false);
  const [tipoDocumento, setTipoDocumento] = useState("CI");
  const formRef = useRef<HTMLFormElement>(null);

  // ★ FIX — questo componente ora resta montato quando si torna al passo
  // "Scegli il tuo piano" (vedi richiesta-dati-flow.tsx, per non perdere i
  // dati già scritti), quindi lo `useState` iniziale sopra non basta più a
  // recepire una tipologia diversa se il cliente cambia scelta e riconferma:
  // va risincronizzato ad ogni nuova conferma del piano.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizza con `sceltaPiano`, di proprietà del componente padre (richiesta-dati-flow.tsx), non derivabile durante il render di questo componente.
    if (sceltaPiano) setTipologiaCliente(sceltaPiano.tipologiaCliente);
  }, [sceltaPiano]);

  const tariffeVisibili = tariffe.filter(
    (t) => t.tipologia_cliente === "Tutti" || t.tipologia_cliente === tipologiaCliente
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);

    if (tipologiaCliente === "Privato") {
      const cf = String(dati.get("codiceFiscale") || "").trim();
      if (!cf) return setErrore("Il Codice Fiscale è obbligatorio.");
      const esito = validaCodiceFiscale(cf);
      if (!esito.valido) return setErrore(esito.messaggio);
    } else {
      const piva = String(dati.get("partitaIva") || "").trim();
      if (!piva) return setErrore("La Partita IVA è obbligatoria.");
      const esito = validaPartitaIva(piva);
      if (!esito.valido) return setErrore(esito.messaggio);
      const cfAzienda = String(dati.get("codiceFiscaleAzienda") || "").trim();
      if (cfAzienda && !validaCodiceFiscale(cfAzienda).valido) return setErrore(validaCodiceFiscale(cfAzienda).messaggio);
    }

    const email = String(dati.get("email") || "").trim();
    if (email && !validaEmail(email).valido) return setErrore(validaEmail(email).messaggio);

    if (metodoPagamento === "IBAN") {
      const iban = String(dati.get("iban") || "").trim();
      const esito = validaIban(iban);
      if (!esito.valido) return setErrore(esito.messaggio);
      if (!dati.get("mandatoSepa")) return setErrore("Devi autorizzare il mandato di addebito SEPA per procedere con l'IBAN.");
    }

    const fronteDoc = (formRef.current?.querySelector("#fronteDocumento") as HTMLInputElement)?.files?.[0];
    if (!fronteDoc) return setErrore("Carica il fronte del documento d'identità.");
    if (tipoDocumento !== "PASSAPORTO") {
      const retroDoc = (formRef.current?.querySelector("#retroDocumento") as HTMLInputElement)?.files?.[0];
      if (!retroDoc) return setErrore("Carica il retro del documento d'identità.");
    }

    if (!dati.get("consenso")) return setErrore("Devi accettare l'informativa privacy per proseguire.");

    dati.set("tipologiaCliente", tipologiaCliente);
    dati.set("metodoPagamento", metodoPagamento);
    dati.set("tipoDocumento", tipoDocumento);
    dati.set("segnalazioneId", segnalazioneId);
    if (sceltaPiano) {
      dati.set("profiloInternet", sceltaPiano.tariffaNome);
      dati.set("router", sceltaPiano.routerNome);
      if (sceltaPiano.extenderScelto) dati.set("extenderMesh", sceltaPiano.extenderNome);
      dati.set("costoMensile", formattaValuta(sceltaPiano.mensile));
      dati.set("costoUnaTantum", formattaValuta(sceltaPiano.unaTantum));
    }

    setInCorso(true);
    try {
      const risposta = await fetch("/api/richiesta-dati", { method: "POST", body: dati });
      const risultato = await risposta.json();
      if (!risposta.ok) throw new Error(risultato.errore || "Errore imprevisto.");
      setInviato(true);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore imprevisto.");
    } finally {
      setInCorso(false);
    }
  }

  if (inviato) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-card p-8 text-center shadow-2xl">
        <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={2} />
        <p className="font-heading text-lg font-bold">Dati inviati</p>
        <p className="text-sm text-muted-foreground">Grazie! Il nostro staff procederà con la pratica.</p>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-2xl sm:p-6">
      {giaInviato && (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 p-2.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          Risultano già dei dati inviati in precedenza. Puoi inviarli di nuovo per aggiornarli.
        </p>
      )}

      {sceltaPiano ? (
        <div className="rounded-xl border border-primary/30 bg-accent-soft p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">Il tuo piano</p>
            {onCambiaPiano && (
              <button type="button" onClick={onCambiaPiano} className="flex items-center gap-1 text-xs font-semibold text-primary underline-offset-2 hover:underline">
                <PencilLine className="h-3 w-3" strokeWidth={2.5} />
                Cambia
              </button>
            )}
          </div>
          <p className="text-sm font-semibold">{sceltaPiano.tariffaNome}</p>
          <p className="text-xs text-muted-foreground">
            {tipologiaCliente} · Router: {sceltaPiano.routerNome}
            {sceltaPiano.extenderScelto && ` · Extender mesh incluso`}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Canone mensile / una tantum</span>
            <span className="font-mono font-bold">{formattaValuta(sceltaPiano.mensile)}/mese · {formattaValuta(sceltaPiano.unaTantum)}</span>
          </div>
        </div>
      ) : (
        <>
          <div>
            <Label htmlFor="profiloInternet">Profilo internet richiesto</Label>
            {tariffe.length > 0 ? (
              <select id="profiloInternet" name="profiloInternet" className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm">
                <option value="">Seleziona il tuo piano...</option>
                {tariffeVisibili.map((t) => (
                  <option key={t.id} value={t.nome}>
                    {t.nome}
                    {t.velocita ? ` — ${t.velocita}` : ""}
                    {t.prezzo_mensile != null ? ` — €${prezziNettoLordo(t.prezzo_mensile, t.iva_inclusa).lordo.toFixed(2)}/mese (IVA incl.)` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <Input id="profiloInternet" name="profiloInternet" placeholder="Es. Fibra 1Gbps" className="mt-1 h-10" />
            )}
          </div>

          <div>
            <Label>Tipologia Cliente</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setTipologiaCliente("Privato")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tipologiaCliente === "Privato" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                👤 Privato
              </button>
              <button type="button" onClick={() => setTipologiaCliente("Azienda")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tipologiaCliente === "Azienda" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
                🏢 Azienda
              </button>
            </div>
          </div>
        </>
      )}

      {tipologiaCliente === "Privato" ? (
        <div>
          <Label htmlFor="codiceFiscale">Codice Fiscale *</Label>
          <Input id="codiceFiscale" name="codiceFiscale" className="mt-1 h-10 uppercase" maxLength={16} />
        </div>
      ) : (
        <>
          <div>
            <Label htmlFor="ragioneSociale">Ragione Sociale *</Label>
            <Input id="ragioneSociale" name="ragioneSociale" required className="mt-1 h-10" />
          </div>
          <div>
            <Label htmlFor="partitaIva">Partita IVA *</Label>
            <Input id="partitaIva" name="partitaIva" className="mt-1 h-10" maxLength={11} />
          </div>
          <div>
            <Label htmlFor="codiceFiscaleAzienda">Codice Fiscale Azienda (se diverso)</Label>
            <Input id="codiceFiscaleAzienda" name="codiceFiscaleAzienda" className="mt-1 h-10 uppercase" maxLength={16} />
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
        <div>
          <Label htmlFor="telefono">Telefono</Label>
          <Input id="telefono" name="telefono" type="tel" className="mt-1 h-10" />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" className="mt-1 h-10" />
        </div>
      </div>

      <div>
        <Label>Metodo di pagamento</Label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMetodoPagamento("Bonifico")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${metodoPagamento === "Bonifico" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
            💳 Bonifico
          </button>
          <button type="button" onClick={() => setMetodoPagamento("IBAN")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${metodoPagamento === "IBAN" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}>
            🏦 Addebito IBAN (SDD)
          </button>
        </div>
      </div>

      {metodoPagamento === "IBAN" && (
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
        <Label htmlFor="tipoDocumento">Tipo Documento</Label>
        <select
          id="tipoDocumento"
          value={tipoDocumento}
          onChange={(e) => setTipoDocumento(e.target.value)}
          className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm"
        >
          <option value="CI">Carta d&apos;Identità</option>
          <option value="PATENTE">Patente</option>
          <option value="PASSAPORTO">Passaporto</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FileUpload id="fronteDocumento" label="Fronte Documento" obbligatorio />
        {tipoDocumento !== "PASSAPORTO" && <FileUpload id="retroDocumento" label="Retro Documento" obbligatorio />}
        <FileUpload id="fronteTesseraSanitaria" label="Fronte Tessera Sanitaria" />
        <FileUpload id="retroTesseraSanitaria" label="Retro Tessera Sanitaria" />
      </div>

      <div>
        <Label htmlFor="note">Note (facoltativo)</Label>
        <textarea id="note" name="note" rows={2} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
      </div>

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

      {errore && (
        <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          {errore}
        </p>
      )}

      <Button type="submit" disabled={inCorso} size="lg" className="mt-2">
        {inCorso ? "Invio in corso…" : "Invia i miei dati"}
      </Button>
    </form>
  );
}
