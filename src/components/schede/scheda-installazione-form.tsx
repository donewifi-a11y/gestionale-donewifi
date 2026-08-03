"use client";

import { useRef, useState } from "react";
import { AlertTriangle, MapPin, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FirmaPad, type FirmaPadHandle } from "@/components/condivisi/firma-pad";
import { SelettoreMateriali } from "@/components/schede/selettore-materiali";
import { salvaSchedaLavoro } from "@/app/(app)/calendario/actions";
import { OPZIONI_INSTALLAZIONE } from "@/lib/types";
import type { MaterialeMagazzino, MaterialeUsato } from "@/lib/types";

/** ★ ex Installazione.html del vecchio gestionale — certificato di
 * installazione a regola d'arte: struttura esterna, cablaggio, dati
 * radio/CPE, collaudo, materiali extra, foto e doppia firma
 * (cliente + tecnico). Si apre da Vista Tecnico quando l'appuntamento ha
 * tipo_servizio "Nuova installazione". */
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
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [materiali, setMateriali] = useState<MaterialeUsato[]>([]);
  const [gps, setGps] = useState<{ lat: number; lng: number; precisione: number } | null>(null);
  const [rilevandoGps, setRilevandoGps] = useState(false);
  const [erroreGps, setErroreGps] = useState("");
  const firmaClienteRef = useRef<FirmaPadHandle>(null);
  const firmaTecnicoRef = useRef<FirmaPadHandle>(null);
  const fotoEsternaRef = useRef<HTMLInputElement>(null);
  const fotoInternaRef = useRef<HTMLInputElement>(null);

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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const richiesti = ["supporto", "tipo_cavo", "modello_cpe", "router"];
    for (const campo of richiesti) {
      if (!String(dati.get(campo) || "").trim()) {
        setErrore("Compila tutti i campi obbligatori (supporto, cavo, CPE, router).");
        return;
      }
    }

    const foto: File[] = [];
    const fEsterna = fotoEsternaRef.current?.files?.[0];
    const fInterna = fotoInternaRef.current?.files?.[0];
    if (fEsterna) foto.push(new File([fEsterna], `Struttura-esterna_${fEsterna.name}`, { type: fEsterna.type }));
    if (fInterna) foto.push(new File([fInterna], `Router-interno_${fInterna.name}`, { type: fInterna.type }));

    setInCorso(true);
    const risultato = await salvaSchedaLavoro(
      appuntamentoId,
      "Nuova installazione",
      {
        esito: "Installazione certificata con successo",
        note: String(dati.get("note") || ""),
        importoFatturato: String(dati.get("importo") || ""),
        materiali,
        firmaClienteDataUrl: firmaClienteRef.current?.ottieniDataUrl() ?? "",
        firmaTecnicoDataUrl: firmaTecnicoRef.current?.ottieniDataUrl() ?? "",
        supporto: String(dati.get("supporto") || ""),
        posizione: String(dati.get("posizione") || ""),
        gpsLat: gps?.lat,
        gpsLng: gps?.lng,
        tipoCavo: String(dati.get("tipo_cavo") || ""),
        metriCavo: String(dati.get("metri_cavo") || ""),
        bts: String(dati.get("bts") || ""),
        modelloCpe: String(dati.get("modello_cpe") || ""),
        mac: String(dati.get("mac") || ""),
        vlan: String(dati.get("vlan") || ""),
        rssi: String(dati.get("rssi") || ""),
        snr: String(dati.get("snr") || ""),
        router: String(dati.get("router") || ""),
        pingMs: String(dati.get("ping") || ""),
        downloadMbps: String(dati.get("download") || ""),
        uploadMbps: String(dati.get("upload") || ""),
      },
      foto
    );
    setInCorso(false);
    if (risultato.errore) return setErrore(risultato.errore);
    onSalvato();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <SezioneTitolo testo="Struttura esterna" />
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Supporto *">
          <Select name="supporto" opzioni={OPZIONI_INSTALLAZIONE.supporto} />
        </Campo>
        <Campo label="Posizione">
          <input name="posizione" placeholder="Es. Balcone, tetto, palo..." className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" />
        </Campo>
      </div>

      <div>
        <Label>Posizione GPS precisa (facoltativa)</Label>
        <div className="mt-1 flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={rilevaGps} disabled={rilevandoGps}>
            <LocateFixed className="h-3.5 w-3.5" strokeWidth={2.25} />
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

      <SezioneTitolo testo="Cablaggio e isolamento" />
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Tipo cavo *">
          <Select name="tipo_cavo" opzioni={OPZIONI_INSTALLAZIONE.cavo} />
        </Campo>
        <Campo label="Metri stimati">
          <input name="metri_cavo" type="number" min="0" step="1" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" />
        </Campo>
      </div>

      <SezioneTitolo testo="Dati radio e CPE" />
      <div className="grid grid-cols-2 gap-3">
        <Campo label="BTS agganciata">
          <input name="bts" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" />
        </Campo>
        <Campo label="Modello CPE *">
          <Select name="modello_cpe" opzioni={OPZIONI_INSTALLAZIONE.cpe} />
        </Campo>
        <Campo label="MAC Address">
          <input name="mac" placeholder="AA:BB:CC:DD:EE:FF" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" />
        </Campo>
        <Campo label="VLAN Management">
          <input name="vlan" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" />
        </Campo>
        <Campo label="Segnale RSSI (dBm)">
          <input name="rssi" type="number" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" />
        </Campo>
        <Campo label="Segnale SNR (dB)">
          <input name="snr" type="number" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" />
        </Campo>
      </div>

      <SezioneTitolo testo="Rete interna e collaudo" />
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Router *">
          <Select name="router" opzioni={OPZIONI_INSTALLAZIONE.router} />
        </Campo>
        <Campo label="Ping (ms)">
          <input name="ping" type="number" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" />
        </Campo>
        <Campo label="Download (Mbps)">
          <input name="download" type="number" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" />
        </Campo>
        <Campo label="Upload (Mbps)">
          <input name="upload" type="number" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" />
        </Campo>
      </div>

      <SezioneTitolo testo="Materiali extra utilizzati" />
      <SelettoreMateriali catalogo={catalogoMateriali} valore={materiali} onChange={setMateriali} />

      <Campo label="Importo totale fatturato al cliente (€, facoltativo)">
        <input name="importo" type="number" min="0" step="0.01" placeholder="Es. 149.00" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm" />
      </Campo>

      <Campo label="Note tecniche aggiuntive">
        <textarea name="note" rows={2} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" />
      </Campo>

      <SezioneTitolo testo="Documentazione fotografica" />
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Foto struttura esterna">
          <input ref={fotoEsternaRef} type="file" accept="image/*" capture="environment" className="mt-1 block w-full text-xs" />
        </Campo>
        <Campo label="Foto router / apparati interni">
          <input ref={fotoInternaRef} type="file" accept="image/*" capture="environment" className="mt-1 block w-full text-xs" />
        </Campo>
      </div>

      <SezioneTitolo testo="Firme" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label>Firma cliente</Label>
          <div className="mt-1">
            <FirmaPad ref={firmaClienteRef} />
          </div>
        </div>
        <div>
          <Label>Firma tecnico</Label>
          <div className="mt-1">
            <FirmaPad ref={firmaTecnicoRef} />
          </div>
        </div>
      </div>

      {errore && (
        <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          {errore}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={inCorso} className="flex-1">
          {inCorso ? "Certificazione in corso..." : "Certifica e completa installazione"}
        </Button>
        <Button type="button" variant="outline" disabled={inCorso} onClick={onAnnulla}>
          Annulla
        </Button>
      </div>
    </form>
  );
}

function SezioneTitolo({ testo }: { testo: string }) {
  return <div className="mt-1 border-t pt-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground first:mt-0 first:border-t-0 first:pt-0">{testo}</div>;
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Select({ name, opzioni }: { name: string; opzioni: readonly string[] }) {
  return (
    <select name={name} defaultValue="" required className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
      <option value="" disabled>Seleziona...</option>
      {opzioni.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}
