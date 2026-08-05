"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Upload, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validaCodiceFiscale, validaPartitaIva, validaIban, validaEmail } from "@/lib/validazione";
import { prezziNettoLordo, formattaValuta } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import type { Tariffa } from "@/lib/types";
import type { SceltaPiano } from "@/components/richiesta-dati/configuratore-piano";

const ETICHETTE_FILE: Record<string, string> = {
  fronteDocumento: "Fronte documento",
  retroDocumento: "Retro documento",
  fronteTesseraSanitaria: "Fronte tessera sanitaria",
  retroTesseraSanitaria: "Retro tessera sanitaria",
};

/** ★ FIX — i documenti non passano più nel corpo di /api/richiesta-dati: 4
 * foto ad alta risoluzione (documento + tessera sanitaria, ora entrambi
 * obbligatori) superano facilmente il limite di ~4.5MB per le funzioni
 * Vercel, che rispondeva con una pagina di errore testuale invece di JSON
 * ("Unexpected token 'R'..." era l'inizio di "Request Entity Too Large").
 * Il file va quindi caricato qui, direttamente dal browser allo storage
 * Supabase con un signed upload URL — la route resta solo per i dati
 * anagrafici (testo, pochi KB) e riceve solo il percorso già caricato. */
async function caricaDocumento(file: File, segnalazioneId: string, campo: string): Promise<{ nome: string; percorso: string; tipo: string }> {
  const rispostaUrl = await fetch("/api/richiesta-dati/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segnalazioneId, nomeFile: file.name }),
  });
  const risultatoUrl = await rispostaUrl.json();
  if (!rispostaUrl.ok) throw new Error(risultatoUrl.errore || `Errore preparazione upload "${file.name}".`);

  const supabase = createClient();
  const { error } = await supabase.storage.from("documenti").uploadToSignedUrl(risultatoUrl.percorso, risultatoUrl.token, file);
  if (error) throw new Error(`Errore caricamento "${file.name}": ${error.message}`);

  return { nome: file.name, percorso: risultatoUrl.percorso, tipo: ETICHETTE_FILE[campo] ?? campo };
}

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
  indirizzo,
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
  /** Indirizzo già raccolto in fase di Segnalazione — precompilato qui perché il
   * cliente lo riverifichi/corregga: verrà usato per l'installazione. */
  indirizzo?: { via: string; civico: string; comune: string; cap: string };
}) {
  const [inCorso, setInCorso] = useState(false);
  const [fase, setFase] = useState("");
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
      if (!cfAzienda) return setErrore("Il Codice Fiscale Azienda è obbligatorio.");
      if (!validaCodiceFiscale(cfAzienda).valido) return setErrore(validaCodiceFiscale(cfAzienda).messaggio);
      const pec = String(dati.get("pec") || "").trim();
      if (!pec) return setErrore("La PEC è obbligatoria.");
      if (!validaEmail(pec).valido) return setErrore("La PEC inserita non è valida.");
      const sdi = String(dati.get("sdi") || "").trim();
      if (!sdi) return setErrore("Il Codice SDI è obbligatorio.");
      const legaleNome = String(dati.get("legaleRappresentanteNome") || "").trim();
      if (!legaleNome) return setErrore("Il nome del Legale Rappresentante è obbligatorio.");
      const legaleCf = String(dati.get("legaleRappresentanteCf") || "").trim();
      if (!legaleCf) return setErrore("Il CF del Legale Rappresentante è obbligatorio.");
      if (!validaCodiceFiscale(legaleCf).valido) return setErrore(validaCodiceFiscale(legaleCf).messaggio);
    }

    const telefono = String(dati.get("telefono") || "").trim();
    if (!telefono) return setErrore("Il telefono è obbligatorio.");

    const email = String(dati.get("email") || "").trim();
    if (!email) return setErrore("L'email è obbligatoria.");
    if (!validaEmail(email).valido) return setErrore(validaEmail(email).messaggio);

    const via = String(dati.get("via") || "").trim();
    if (!via) return setErrore("L'indirizzo di installazione (via/piazza) è obbligatorio.");
    const civico = String(dati.get("civico") || "").trim();
    if (!civico) return setErrore("Il civico dell'indirizzo di installazione è obbligatorio.");
    const comune = String(dati.get("comune") || "").trim();
    if (!comune) return setErrore("Il comune dell'indirizzo di installazione è obbligatorio.");
    const cap = String(dati.get("cap") || "").trim();
    if (!cap) return setErrore("Il CAP dell'indirizzo di installazione è obbligatorio.");
    if (!/^\d{5}$/.test(cap)) return setErrore("Il CAP deve essere composto da 5 cifre.");

    if (metodoPagamento === "IBAN") {
      const iban = String(dati.get("iban") || "").trim();
      const esito = validaIban(iban);
      if (!esito.valido) return setErrore(esito.messaggio);
      if (!dati.get("mandatoSepa")) return setErrore("Devi autorizzare il mandato di addebito SEPA per procedere con l'IBAN.");
      if (intestatarioDiverso) {
        const nomeIntestatario = String(dati.get("ibanIntestatarioNome") || "").trim();
        if (!nomeIntestatario) return setErrore("Il nome dell'intestatario del conto è obbligatorio.");
        const cfIntestatario = String(dati.get("ibanIntestatarioCf") || "").trim();
        if (!cfIntestatario) return setErrore("Il Codice Fiscale dell'intestatario del conto è obbligatorio.");
        if (!validaCodiceFiscale(cfIntestatario).valido) return setErrore(validaCodiceFiscale(cfIntestatario).messaggio);
      }
    }

    const campiFile = ["fronteDocumento", "retroDocumento", "fronteTesseraSanitaria", "retroTesseraSanitaria"];
    const fileSelezionati: Record<string, File> = {};
    for (const campo of campiFile) {
      const file = (formRef.current?.querySelector(`#${campo}`) as HTMLInputElement)?.files?.[0];
      if (file) fileSelezionati[campo] = file;
    }
    if (!fileSelezionati.fronteDocumento) return setErrore("Carica il fronte del documento d'identità.");
    if (tipoDocumento !== "PASSAPORTO" && !fileSelezionati.retroDocumento) return setErrore("Carica il retro del documento d'identità.");
    if (!fileSelezionati.fronteTesseraSanitaria) return setErrore("Carica il fronte della tessera sanitaria.");
    if (!fileSelezionati.retroTesseraSanitaria) return setErrore("Carica il retro della tessera sanitaria.");

    if (!dati.get("consenso")) return setErrore("Devi accettare l'informativa privacy per proseguire.");

    dati.set("tipologiaCliente", tipologiaCliente);
    dati.set("metodoPagamento", metodoPagamento);
    dati.set("tipoDocumento", tipoDocumento);
    dati.set("segnalazioneId", segnalazioneId);
    if (sceltaPiano) {
      dati.set("profiloInternet", sceltaPiano.tariffaNome);
      dati.set("router", sceltaPiano.routerNome);
      if (sceltaPiano.extenderQuantita > 0) dati.set("extenderMesh", `${sceltaPiano.extenderNome} x${sceltaPiano.extenderQuantita}`);
      dati.set("costoMensile", formattaValuta(sceltaPiano.mensile));
      dati.set("costoUnaTantum", formattaValuta(sceltaPiano.unaTantum));
    }

    setInCorso(true);
    setFase("Caricamento documenti…");
    try {
      const documenti: { nome: string; percorso: string; tipo: string }[] = [];
      for (const [campo, file] of Object.entries(fileSelezionati)) {
        documenti.push(await caricaDocumento(file, segnalazioneId, campo));
      }

      setFase("Invio dati…");
      const corpo: Record<string, string> = {};
      for (const [chiave, valore] of dati.entries()) {
        if (campiFile.includes(chiave)) continue;
        if (typeof valore === "string") corpo[chiave] = valore;
      }

      const risposta = await fetch("/api/richiesta-dati", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...corpo, documenti }),
      });
      const risultato = await risposta.json();
      if (!risposta.ok) throw new Error(risultato.errore || "Errore imprevisto.");
      setInviato(true);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Errore imprevisto.");
    } finally {
      setInCorso(false);
      setFase("");
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
            {sceltaPiano.extenderQuantita > 0 && ` · Extender mesh x${sceltaPiano.extenderQuantita}`}
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
                    {t.prezzo_mensile != null && t.prezzo_mensile > 0
                      ? ` — €${prezziNettoLordo(t.prezzo_mensile, t.iva_inclusa).lordo.toFixed(2)}/mese (IVA incl.)`
                      : t.descrizione
                        ? ` — ${t.descrizione}`
                        : ""}
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
            <Label htmlFor="codiceFiscaleAzienda">Codice Fiscale Azienda *</Label>
            <Input id="codiceFiscaleAzienda" name="codiceFiscaleAzienda" className="mt-1 h-10 uppercase" maxLength={16} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pec">PEC *</Label>
              <Input id="pec" name="pec" type="email" className="mt-1 h-10" />
            </div>
            <div>
              <Label htmlFor="sdi">Codice SDI *</Label>
              <Input id="sdi" name="sdi" maxLength={7} className="mt-1 h-10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="legaleRappresentanteNome">Nome Legale Rappresentante *</Label>
              <Input id="legaleRappresentanteNome" name="legaleRappresentanteNome" className="mt-1 h-10" />
            </div>
            <div>
              <Label htmlFor="legaleRappresentanteCf">CF Legale Rappresentante *</Label>
              <Input id="legaleRappresentanteCf" name="legaleRappresentanteCf" className="mt-1 h-10 uppercase" maxLength={16} />
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="telefono">Telefono *</Label>
          <Input id="telefono" name="telefono" type="tel" className="mt-1 h-10" />
        </div>
        <div>
          <Label htmlFor="email">Email *</Label>
          <Input id="email" name="email" type="email" className="mt-1 h-10" />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold">Indirizzo di installazione *</p>
        <p className="mb-2 text-xs text-muted-foreground">Verifica che l&apos;indirizzo sia corretto: verrà usato per l&apos;installazione.</p>
        <div className="grid grid-cols-[1fr_100px] gap-3">
          <div>
            <Label htmlFor="via">Via/Piazza *</Label>
            <Input id="via" name="via" defaultValue={indirizzo?.via ?? ""} className="mt-1 h-10" />
          </div>
          <div>
            <Label htmlFor="civico">Civico *</Label>
            <Input id="civico" name="civico" defaultValue={indirizzo?.civico ?? ""} className="mt-1 h-10" />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="comune">Comune *</Label>
            <Input id="comune" name="comune" defaultValue={indirizzo?.comune ?? ""} className="mt-1 h-10" />
          </div>
          <div>
            <Label htmlFor="cap">CAP *</Label>
            <Input id="cap" name="cap" defaultValue={indirizzo?.cap ?? ""} maxLength={5} className="mt-1 h-10" />
          </div>
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
              <div>
                <Label htmlFor="ibanIntestatarioNome">Nome Cognome intestatario *</Label>
                <Input id="ibanIntestatarioNome" name="ibanIntestatarioNome" className="mt-1 h-10" />
              </div>
              <div>
                <Label htmlFor="ibanIntestatarioCf">CF intestatario *</Label>
                <Input id="ibanIntestatarioCf" name="ibanIntestatarioCf" className="mt-1 h-10 uppercase" maxLength={16} />
              </div>
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
        <FileUpload id="fronteTesseraSanitaria" label="Fronte Tessera Sanitaria" obbligatorio />
        <FileUpload id="retroTesseraSanitaria" label="Retro Tessera Sanitaria" obbligatorio />
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
        {inCorso ? fase || "Invio in corso…" : "Invia i miei dati"}
      </Button>
    </form>
  );
}
