"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, LocateFixed, Camera } from "lucide-react";
import { FirmaPad, type FirmaPadHandle } from "@/components/condivisi/firma-pad";
import { FirmaClienteScheda } from "@/components/schede/firma-cliente-scheda";
import { SelettoreMateriali } from "@/components/schede/selettore-materiali";
import { DomandaWizard, type Domanda } from "@/components/pose/domanda-wizard";
import { TileScelta, CampoGrande, AreaGrande } from "@/components/pose/tile-scelta";
import { salvaSchedaLavoroEsterno, getTipologiaClientePerAppuntamentoEsterno } from "@/app/pose/actions";
import type { FirmaClienteApprovata } from "@/app/(app)/calendario/actions";
import { leggiBozzaScheda, salvaBozzaScheda, cancellaBozzaScheda } from "@/lib/bozza-scheda";
import { OPZIONI_INSTALLAZIONE } from "@/lib/types";
import type { MaterialeMagazzino, MaterialeUsato } from "@/lib/types";

interface BozzaInstallazione {
  supporto: string; posizione: string; tipoCavo: string; metriCavo: string;
  bts: string; modelloCpe: string; mac: string; vlan: string; rssi: string; snr: string;
  router: string; ping: string; download: string; upload: string;
  materiali: MaterialeUsato[]; metodoPagamento: "Contanti" | "POS" | "Non riscosso" | null; note: string;
}

/** ★ NUOVA (2026-08-26) — equivalente di SchedaInstallazioneForm
 * (schede/scheda-installazione-form.tsx) per pose.donewifi.it, ma "una
 * domanda alla volta" invece di 5 passi con più campi ciascuno (Opzione A,
 * scelta esplicitamente tra 3 proposte con artifact). Stessi campi, stessa
 * chiamata finale (salvaSchedaLavoroEsterno), stesso principio di bozza
 * salvata in locale — solo la navigazione cambia. Componente a sé invece
 * di generalizzare l'originale: i due layout sono troppo diversi per un
 * parametro, stesso ragionamento già fatto per rapportino-form.tsx. */
export function SchedaInstallazioneDomande({
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
  const [metodoPagamento, setMetodoPagamento] = useState<BozzaInstallazione["metodoPagamento"]>(bozza?.metodoPagamento ?? "Contanti");
  const [note, setNote] = useState(bozza?.note ?? "");
  const [tipoClienteTicket, setTipoClienteTicket] = useState<"Privato" | "Business" | null>(null);
  useEffect(() => {
    getTipologiaClientePerAppuntamentoEsterno(appuntamentoId).then(setTipoClienteTicket);
  }, [appuntamentoId]);

  const [fotoEsterna, setFotoEsterna] = useState<File | null>(null);
  const [fotoInterna, setFotoInterna] = useState<File | null>(null);

  const [firmaCliente, setFirmaCliente] = useState<FirmaClienteApprovata | null>(null);
  const firmaTecnicoRef = useRef<FirmaPadHandle>(null);

  useEffect(() => {
    salvaBozzaScheda<BozzaInstallazione>(chiaveBozza, {
      supporto, posizione, tipoCavo, metriCavo, bts, modelloCpe, mac, vlan, rssi, snr, router, ping, download, upload, materiali, metodoPagamento, note,
    });
  }, [chiaveBozza, supporto, posizione, tipoCavo, metriCavo, bts, modelloCpe, mac, vlan, rssi, snr, router, ping, download, upload, materiali, metodoPagamento, note]);

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
        setErroreGps(err.code === err.PERMISSION_DENIED ? "Permesso posizione negato — abilitalo nelle impostazioni del telefono." : "Impossibile rilevare la posizione.");
        setRilevandoGps(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  async function invia() {
    setErroreInvio("");
    const foto: File[] = [];
    if (fotoEsterna) foto.push(new File([fotoEsterna], `Struttura-esterna_${fotoEsterna.name}`, { type: fotoEsterna.type }));
    if (fotoInterna) foto.push(new File([fotoInterna], `Router-interno_${fotoInterna.name}`, { type: fotoInterna.type }));

    setInCorso(true);
    const risultato = await salvaSchedaLavoroEsterno(
      appuntamentoId,
      "Nuova installazione",
      {
        esito: "Installazione certificata con successo",
        note,
        metodoPagamentoPosa: metodoPagamento,
        materiali,
        firmaCliente: firmaCliente!,
        firmaTecnicoDataUrl: firmaTecnicoRef.current?.ottieniDataUrl() ?? "",
        supporto, posizione, gpsLat: gps?.lat, gpsLng: gps?.lng,
        tipoCavo, metriCavo, bts, modelloCpe, mac, vlan, rssi, snr, router,
        pingMs: ping, downloadMbps: download, uploadMbps: upload,
      },
      foto
    );
    setInCorso(false);
    if (risultato.errore) { setErroreInvio(risultato.errore); return; }
    cancellaBozzaScheda(chiaveBozza);
    onSalvato();
  }

  const domande: Domanda[] = [
    {
      domanda: "Che tipo di supporto hai usato?",
      valida: () => (supporto.trim() ? null : "Scegli un supporto prima di continuare."),
      contenuto: <TileScelta opzioni={OPZIONI_INSTALLAZIONE.supporto} valore={supporto} onChange={setSupporto} />,
    },
    {
      domanda: "Dove si trova, di preciso?",
      aiuto: "Facoltativo — es. balcone, tetto, palo del giardino.",
      contenuto: <CampoGrande type="text" placeholder="Es. Balcone, tetto, palo..." value={posizione} onChange={(e) => setPosizione(e.target.value)} />,
    },
    {
      domanda: "Vuoi salvare la posizione GPS?",
      aiuto: "Facoltativo — un tocco basta, aiuta a ritrovare l'impianto in futuro.",
      contenuto: (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={rilevaGps}
            disabled={rilevandoGps}
            className="flex h-16 items-center justify-center gap-3 rounded-2xl border-2 border-border bg-background text-lg font-bold text-foreground disabled:opacity-60"
          >
            <LocateFixed className="h-6 w-6 text-info" strokeWidth={2.25} />
            {rilevandoGps ? "Rilevamento in corso..." : gps ? "Rileva di nuovo" : "Rileva posizione GPS"}
          </button>
          {gps && (
            <p className="flex items-center gap-2 rounded-2xl bg-info/10 p-4 text-[15px] font-bold text-info">
              <MapPin className="h-5 w-5 shrink-0" strokeWidth={2.25} />
              {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)} (±{gps.precisione}m)
            </p>
          )}
          {erroreGps && <p className="text-[15px] font-semibold text-critical">{erroreGps}</p>}
        </div>
      ),
    },
    {
      domanda: "Che tipo di cavo hai posato?",
      valida: () => (tipoCavo.trim() ? null : "Scegli un tipo di cavo prima di continuare."),
      contenuto: <TileScelta opzioni={OPZIONI_INSTALLAZIONE.cavo} valore={tipoCavo} onChange={setTipoCavo} />,
    },
    {
      domanda: "Quanti metri, all'incirca?",
      aiuto: "Facoltativo.",
      contenuto: <CampoGrande type="number" inputMode="numeric" min="0" placeholder="0" value={metriCavo} onChange={(e) => setMetriCavo(e.target.value)} />,
    },
    {
      domanda: "A quale BTS è agganciato?",
      aiuto: "Facoltativo.",
      contenuto: <CampoGrande type="text" value={bts} onChange={(e) => setBts(e.target.value)} />,
    },
    {
      domanda: "Che modello di CPE hai installato?",
      valida: () => (modelloCpe.trim() ? null : "Scegli un modello CPE prima di continuare."),
      contenuto: <TileScelta opzioni={OPZIONI_INSTALLAZIONE.cpe} valore={modelloCpe} onChange={setModelloCpe} />,
    },
    {
      domanda: "Indirizzo MAC?",
      aiuto: "Facoltativo — trovi la scritta sull'apparato.",
      contenuto: <CampoGrande type="text" placeholder="AA:BB:CC:DD:EE:FF" value={mac} onChange={(e) => setMac(e.target.value)} />,
    },
    {
      domanda: "VLAN di management?",
      aiuto: "Facoltativo.",
      contenuto: <CampoGrande type="text" value={vlan} onChange={(e) => setVlan(e.target.value)} />,
    },
    {
      domanda: "Segnale RSSI, in dBm?",
      aiuto: "Facoltativo — dal collaudo.",
      contenuto: <CampoGrande type="number" inputMode="numeric" value={rssi} onChange={(e) => setRssi(e.target.value)} />,
    },
    {
      domanda: "Segnale SNR, in dB?",
      aiuto: "Facoltativo — dal collaudo.",
      contenuto: <CampoGrande type="number" inputMode="numeric" value={snr} onChange={(e) => setSnr(e.target.value)} />,
    },
    {
      domanda: "Che router hai usato?",
      valida: () => (router.trim() ? null : "Scegli un router prima di continuare."),
      contenuto: <TileScelta opzioni={OPZIONI_INSTALLAZIONE.router} valore={router} onChange={setRouter} />,
    },
    {
      domanda: "Ping misurato, in ms?",
      aiuto: "Facoltativo.",
      contenuto: <CampoGrande type="number" inputMode="numeric" value={ping} onChange={(e) => setPing(e.target.value)} />,
    },
    {
      domanda: "Velocità in download, in Mbps?",
      aiuto: "Facoltativo.",
      contenuto: <CampoGrande type="number" inputMode="numeric" value={download} onChange={(e) => setDownload(e.target.value)} />,
    },
    {
      domanda: "Velocità in upload, in Mbps?",
      aiuto: "Facoltativo.",
      contenuto: <CampoGrande type="number" inputMode="numeric" value={upload} onChange={(e) => setUpload(e.target.value)} />,
    },
    {
      domanda: "Hai usato materiali extra?",
      aiuto: "Cavi, staffe, connettori — oltre al kit standard.",
      contenuto: <SelettoreMateriali catalogo={catalogoMateriali} valore={materiali} onChange={setMateriali} tipoClienteIniziale={tipoClienteTicket} />,
    },
    {
      domanda: "Come ha pagato la posa?",
      contenuto: (
        <TileScelta
          opzioni={["Contanti", "POS", "Non riscosso"]}
          valore={metodoPagamento ?? ""}
          onChange={(v) => setMetodoPagamento(v as BozzaInstallazione["metodoPagamento"])}
        />
      ),
    },
    {
      domanda: "Vuoi aggiungere una nota tecnica?",
      aiuto: "Facoltativo — solo se c'è qualcosa da segnalare in ufficio.",
      contenuto: <AreaGrande placeholder="Scrivi qui..." value={note} onChange={(e) => setNote(e.target.value)} />,
    },
    {
      domanda: "Una foto della struttura esterna?",
      aiuto: "Facoltativa.",
      contenuto: <FotoInput value={fotoEsterna} onChange={setFotoEsterna} />,
    },
    {
      domanda: "Una foto del router e degli apparati interni?",
      aiuto: "Facoltativa.",
      contenuto: <FotoInput value={fotoInterna} onChange={setFotoInterna} />,
    },
    {
      domanda: "Il cliente conferma l'intervento?",
      aiuto: "Un codice a 6 cifre arriva via email — il cliente lo legge ad alta voce, tu lo digiti.",
      valida: () => (firmaCliente ? null : "Conferma la firma del cliente prima di continuare."),
      contenuto: <FirmaClienteScheda riferimento={{ tipo: "appuntamento", id: appuntamentoId }} value={firmaCliente} onChange={setFirmaCliente} />,
    },
    {
      domanda: "E la tua firma?",
      aiuto: "Facoltativa — disegna con il dito.",
      contenuto: <FirmaPad ref={firmaTecnicoRef} />,
    },
  ];

  return (
    <DomandaWizard
      domande={domande}
      inCorso={inCorso}
      erroreInvio={erroreInvio}
      testoInvio="Certifica e completa"
      onAnnulla={onAnnulla}
      onInvia={invia}
    />
  );
}

function FotoInput({ value, onChange }: { value: File | null; onChange: (f: File | null) => void }) {
  return (
    <label className="flex h-20 cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-background px-5 text-center text-[15px] font-bold text-muted-foreground">
      <Camera className="h-5 w-5 shrink-0" strokeWidth={2.25} />
      <span className="truncate">{value ? value.name : "Scatta o scegli una foto"}</span>
      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
    </label>
  );
}
