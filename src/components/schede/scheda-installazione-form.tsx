"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FirmaPad, type FirmaPadHandle } from "@/components/condivisi/firma-pad";
import { FirmaClienteScheda } from "@/components/schede/firma-cliente-scheda";
import { SelettoreMateriali } from "@/components/schede/selettore-materiali";
import { SchedaWizard, type PassoScheda } from "@/components/schede/scheda-wizard";
import { salvaSchedaLavoro, type FirmaClienteApprovata } from "@/app/(app)/calendario/actions";
import { leggiBozzaScheda, salvaBozzaScheda, cancellaBozzaScheda } from "@/lib/bozza-scheda";
import { OPZIONI_INSTALLAZIONE } from "@/lib/types";
import type { MaterialeMagazzino, MaterialeUsato } from "@/lib/types";

interface BozzaInstallazione {
  supporto: string;
  posizione: string;
  tipoCavo: string;
  metriCavo: string;
  bts: string;
  modelloCpe: string;
  mac: string;
  vlan: string;
  rssi: string;
  snr: string;
  router: string;
  ping: string;
  download: string;
  upload: string;
  materiali: MaterialeUsato[];
  importo: string;
  note: string;
}

/** ★ ex Installazione.html del vecchio gestionale — certificato di
 * installazione a regola d'arte: struttura esterna, cablaggio, dati
 * radio/CPE, collaudo, materiali extra, foto e doppia firma
 * (cliente + tecnico). Si apre da Vista Tecnico quando l'appuntamento ha
 * tipo_servizio "Nuova installazione".
 *
 * ★ NUOVA — richiesta esplicita: da un unico form lungo a 5 passi
 * (Struttura → Cablaggio → Radio/CPE e collaudo → Materiali → Firme), un
 * pensiero alla volta invece di uno scroll infinito su smartphone. Tutti i
 * campi sono ora stato controllato (non più FormData letta al submit):
 * necessario perché uno step nascosto smonta il proprio JSX, e un input
 * non controllato perderebbe il valore digitato appena non più visibile. */
export function SchedaInstallazioneForm({
  appuntamentoId,
  catalogoMateriali,
  onSalvato,
  onAnnulla,
}: {
  appuntamentoId: string;
  catalogoMateriali: MaterialeMagazzino[];
  onSalvato: () => void;
  onAnnulla: () => void;
}) {
  const chiaveBozza = `installazione:${appuntamentoId}`;
  const bozza = leggiBozzaScheda<BozzaInstallazione>(chiaveBozza);

  const [inCorso, setInCorso] = useState(false);
  const [erroreInvio, setErroreInvio] = useState("");

  const [supporto, setSupporto] = useState(bozza?.supporto ?? "");
  const [posizione, setPosizione] = useState(bozza?.posizione ?? "");
  const [gps, setGps] = useState<{ lat: number; lng: number; precisione: number } | null>(null);
  const [rilevandoGps, setRilevandoGps] = useState(false);
  const [erroreGps, setErroreGps] = useState("");

  const [tipoCavo, setTipoCavo] = useState(bozza?.tipoCavo ?? "");
  const [metriCavo, setMetriCavo] = useState(bozza?.metriCavo ?? "");

  const [bts, setBts] = useState(bozza?.bts ?? "");
  const [modelloCpe, setModelloCpe] = useState(bozza?.modelloCpe ?? "");
  const [mac, setMac] = useState(bozza?.mac ?? "");
  const [vlan, setVlan] = useState(bozza?.vlan ?? "");
  const [rssi, setRssi] = useState(bozza?.rssi ?? "");
  const [snr, setSnr] = useState(bozza?.snr ?? "");
  const [router, setRouter] = useState(bozza?.router ?? "");
  const [ping, setPing] = useState(bozza?.ping ?? "");
  const [download, setDownload] = useState(bozza?.download ?? "");
  const [upload, setUpload] = useState(bozza?.upload ?? "");

  const [materiali, setMateriali] = useState<MaterialeUsato[]>(bozza?.materiali ?? []);
  const [importo, setImporto] = useState(bozza?.importo ?? "");
  const [note, setNote] = useState(bozza?.note ?? "");
  // ★ FIX — file scelti in un passo che poi si nasconde (cambio passo)
  // andrebbero persi se restassero solo nel DOM di un input non
  // controllato: qui il File selezionato passa in stato React, che
  // sopravvive alla dismontaggio del passo precedente.
  const [fotoEsterna, setFotoEsterna] = useState<File | null>(null);
  const [fotoInterna, setFotoInterna] = useState<File | null>(null);

  const [firmaCliente, setFirmaCliente] = useState<FirmaClienteApprovata | null>(null);
  const firmaTecnicoRef = useRef<FirmaPadHandle>(null);

  useEffect(() => {
    salvaBozzaScheda<BozzaInstallazione>(chiaveBozza, {
      supporto, posizione, tipoCavo, metriCavo, bts, modelloCpe, mac, vlan, rssi, snr, router, ping, download, upload, materiali, importo, note,
    });
  }, [chiaveBozza, supporto, posizione, tipoCavo, metriCavo, bts, modelloCpe, mac, vlan, rssi, snr, router, ping, download, upload, materiali, importo, note]);

  function rilevaGps() {
    if (!navigator.geolocation) {
      setErroreGps("Il dispositivo non supporta la geolocalizzazione.");
      return;
    }
    setRilevandoGps(true);
    setErroreGps("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, precisione: Math.round(pos.coords.accuracy) });
        setRilevandoGps(false);
      },
      (err) => {
        setErroreGps(err.code === err.PERMISSION_DENIED ? "Permesso posizione negato — abilitalo nelle impostazioni del browser." : "Impossibile rilevare la posizione.");
        setRilevandoGps(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function invia() {
    setErroreInvio("");
    if (!firmaCliente) {
      setErroreInvio("Conferma la firma del cliente (codice email o link di approvazione) prima di salvare.");
      return;
    }
    const foto: File[] = [];
    if (fotoEsterna) foto.push(new File([fotoEsterna], `Struttura-esterna_${fotoEsterna.name}`, { type: fotoEsterna.type }));
    if (fotoInterna) foto.push(new File([fotoInterna], `Router-interno_${fotoInterna.name}`, { type: fotoInterna.type }));

    setInCorso(true);
    const risultato = await salvaSchedaLavoro(
      appuntamentoId,
      "Nuova installazione",
      {
        esito: "Installazione certificata con successo",
        note,
        importoFatturato: importo,
        materiali,
        firmaCliente,
        firmaTecnicoDataUrl: firmaTecnicoRef.current?.ottieniDataUrl() ?? "",
        supporto,
        posizione,
        gpsLat: gps?.lat,
        gpsLng: gps?.lng,
        tipoCavo,
        metriCavo,
        bts,
        modelloCpe,
        mac,
        vlan,
        rssi,
        snr,
        router,
        pingMs: ping,
        downloadMbps: download,
        uploadMbps: upload,
      },
      foto
    );
    setInCorso(false);
    if (risultato.errore) {
      setErroreInvio(risultato.errore);
      return;
    }
    cancellaBozzaScheda(chiaveBozza);
    onSalvato();
  }

  const passi: PassoScheda[] = [
    {
      titolo: "Struttura",
      valida: () => (supporto.trim() ? null : "Il tipo di supporto è obbligatorio."),
      contenuto: (
        <>
          <Campo label="Supporto *">
            <Select value={supporto} onChange={setSupporto} opzioni={OPZIONI_INSTALLAZIONE.supporto} />
          </Campo>
          <Campo label="Posizione">
            <input value={posizione} onChange={(e) => setPosizione(e.target.value)} placeholder="Es. Balcone, tetto, palo..." className={campoClass} />
          </Campo>
          <div>
            <Label>Posizione GPS precisa (facoltativa)</Label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={rilevaGps} disabled={rilevandoGps} className="h-11">
                <LocateFixed className="h-4 w-4" strokeWidth={2.25} />
                {rilevandoGps ? "Rilevamento..." : gps ? "Rileva di nuovo" : "Rileva posizione GPS"}
              </Button>
              {gps && (
                <a
                  href={`https://maps.google.com/?q=${gps.lat},${gps.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline"
                >
                  <MapPin className="h-3.5 w-3.5" strokeWidth={2.25} />
                  {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)} (±{gps.precisione}m)
                </a>
              )}
            </div>
            {erroreGps && <p className="mt-1 text-xs text-critical">{erroreGps}</p>}
          </div>
        </>
      ),
    },
    {
      titolo: "Cablaggio",
      valida: () => (tipoCavo.trim() ? null : "Il tipo di cavo è obbligatorio."),
      contenuto: (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="Tipo cavo *">
            <Select value={tipoCavo} onChange={setTipoCavo} opzioni={OPZIONI_INSTALLAZIONE.cavo} />
          </Campo>
          <Campo label="Metri stimati">
            <input value={metriCavo} onChange={(e) => setMetriCavo(e.target.value)} type="number" min="0" step="1" className={campoClass} />
          </Campo>
        </div>
      ),
    },
    {
      titolo: "Radio/CPE",
      valida: () => {
        if (!modelloCpe.trim()) return "Il modello CPE è obbligatorio.";
        if (!router.trim()) return "Il router è obbligatorio.";
        return null;
      },
      contenuto: (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="BTS agganciata">
            <input value={bts} onChange={(e) => setBts(e.target.value)} className={campoClass} />
          </Campo>
          <Campo label="Modello CPE *">
            <Select value={modelloCpe} onChange={setModelloCpe} opzioni={OPZIONI_INSTALLAZIONE.cpe} />
          </Campo>
          <Campo label="MAC Address">
            <input value={mac} onChange={(e) => setMac(e.target.value)} placeholder="AA:BB:CC:DD:EE:FF" className={campoClass} />
          </Campo>
          <Campo label="VLAN Management">
            <input value={vlan} onChange={(e) => setVlan(e.target.value)} className={campoClass} />
          </Campo>
          <Campo label="Segnale RSSI (dBm)">
            <input value={rssi} onChange={(e) => setRssi(e.target.value)} type="number" className={campoClass} />
          </Campo>
          <Campo label="Segnale SNR (dB)">
            <input value={snr} onChange={(e) => setSnr(e.target.value)} type="number" className={campoClass} />
          </Campo>
          <Campo label="Router *">
            <Select value={router} onChange={setRouter} opzioni={OPZIONI_INSTALLAZIONE.router} />
          </Campo>
          <Campo label="Ping (ms)">
            <input value={ping} onChange={(e) => setPing(e.target.value)} type="number" className={campoClass} />
          </Campo>
          <Campo label="Download (Mbps)">
            <input value={download} onChange={(e) => setDownload(e.target.value)} type="number" className={campoClass} />
          </Campo>
          <Campo label="Upload (Mbps)">
            <input value={upload} onChange={(e) => setUpload(e.target.value)} type="number" className={campoClass} />
          </Campo>
        </div>
      ),
    },
    {
      titolo: "Materiali",
      contenuto: (
        <>
          <div>
            <Label>Materiali extra utilizzati</Label>
            <div className="mt-1.5">
              <SelettoreMateriali catalogo={catalogoMateriali} valore={materiali} onChange={setMateriali} />
            </div>
          </div>
          <Campo label="Importo totale fatturato al cliente (€, facoltativo)">
            <input value={importo} onChange={(e) => setImporto(e.target.value)} type="number" min="0" step="0.01" placeholder="Es. 149.00" className={campoClass} />
          </Campo>
          <Campo label="Note tecniche aggiuntive">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Foto struttura esterna">
              <FileInput value={fotoEsterna} onChange={setFotoEsterna} />
            </Campo>
            <Campo label="Foto router / apparati interni">
              <FileInput value={fotoInterna} onChange={setFotoInterna} />
            </Campo>
          </div>
        </>
      ),
    },
    {
      titolo: "Firme",
      valida: () => (firmaCliente ? null : "Conferma la firma del cliente (codice email o link di approvazione) prima di proseguire."),
      contenuto: (
        // ★ FIX — richiesta esplicita: due colonne strette (grid-cols-2)
        // lasciavano troppo poco spazio all'input del codice + bottone
        // "Verifica" nella colonna Firma cliente, che finivano schiacciati
        // e sovrapposti l'uno sull'altro — impossibile da cliccare. Una
        // colonna sola, impilate: entrambe le firme hanno tutta la
        // larghezza del dialog, niente più a rischio di sovrapposizione.
        <div className="flex flex-col gap-6">
          <div>
            <Label>Firma cliente</Label>
            <div className="mt-1.5">
              <FirmaClienteScheda riferimento={{ tipo: "appuntamento", id: appuntamentoId }} value={firmaCliente} onChange={setFirmaCliente} />
            </div>
          </div>
          <div>
            <Label>Firma tecnico</Label>
            <div className="mt-1.5">
              <FirmaPad ref={firmaTecnicoRef} />
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <SchedaWizard
      titolo="Certificato Installazione"
      sottotitolo="Struttura, cablaggio, radio/CPE, materiali e firme."
      passi={passi}
      inCorso={inCorso}
      erroreInvio={erroreInvio}
      testoInvio="Certifica e completa installazione"
      onAnnulla={onAnnulla}
      onInvia={invia}
    />
  );
}

const campoClass = "mt-1 h-11 w-full rounded-md border bg-background px-3 text-base sm:h-9 sm:text-sm";

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Select({ value, onChange, opzioni }: { value: string; onChange: (v: string) => void; opzioni: readonly string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={campoClass}>
      <option value="" disabled>Seleziona...</option>
      {opzioni.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function FileInput({ value, onChange }: { value: File | null; onChange: (f: File | null) => void }) {
  return (
    <label className="mt-1 flex h-11 cursor-pointer items-center rounded-md border border-dashed bg-background px-3 text-xs text-muted-foreground">
      <span className="truncate">{value ? value.name : "Scatta o scegli una foto"}</span>
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}
