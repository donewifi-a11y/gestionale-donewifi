"use client";

import { useEffect, useState } from "react";
import { MapPin, LocateFixed, Camera, X, Building2, Ruler, Radio, Router, Cpu, Gauge, Download, Upload, Package, Euro, NotebookText, FileSignature } from "lucide-react";
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
  supporto: string; posizione: string; metriCavo: string;
  bts: string; modelloCpe: string; mac: string; rssi: string;
  ping: string; download: string; upload: string;
  materiali: MaterialeUsato[]; metodoPagamento: "Contanti" | "POS" | "In Fattura" | null; note: string;
}

/** ★ NUOVA (2026-08-26) — equivalente di SchedaInstallazioneForm
 * (schede/scheda-installazione-form.tsx) per pose.donewifi.it, ma "una
 * domanda alla volta" invece di 5 passi con più campi ciascuno (Opzione A,
 * scelta esplicitamente tra 3 proposte con artifact). Componente a sé
 * invece di generalizzare l'originale — vedi rapportino-form.tsx.
 *
 * ★ RIVISTA (2026-08-26, revisione domanda-per-domanda via artifact) —
 * rimosse VLAN/SNR/Router (giudicate superflue sul campo), rimossa la
 * firma del tecnico (resta solo quella del cliente, l'unica che serve
 * davvero a certificare l'intervento), il tipo di cavo non è più una
 * domanda a scelta fissa ma si registra come qualunque altro materiale
 * nella domanda "Hai usato materiali extra?" (il catalogo li include già),
 * "Non riscosso" è diventato "In Fattura" (meno ambiguo), e le foto
 * (struttura esterna / apparati interni) accettano più di uno scatto. */
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

  const [metriCavo, setMetriCavo] = useState(bozza?.metriCavo ?? "");

  const [bts, setBts] = useState(bozza?.bts ?? "");
  const [modelloCpe, setModelloCpe] = useState(bozza?.modelloCpe ?? "");
  const [mac, setMac] = useState(bozza?.mac ?? "");
  const [rssi, setRssi] = useState(bozza?.rssi ?? "");
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

  const [fotoEsterna, setFotoEsterna] = useState<File[]>([]);
  const [fotoInterna, setFotoInterna] = useState<File[]>([]);

  const [firmaCliente, setFirmaCliente] = useState<FirmaClienteApprovata | null>(null);

  useEffect(() => {
    salvaBozzaScheda<BozzaInstallazione>(chiaveBozza, {
      supporto, posizione, metriCavo, bts, modelloCpe, mac, rssi, ping, download, upload, materiali, metodoPagamento, note,
    });
  }, [chiaveBozza, supporto, posizione, metriCavo, bts, modelloCpe, mac, rssi, ping, download, upload, materiali, metodoPagamento, note]);

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
    const foto: File[] = [
      ...fotoEsterna.map((f, i) => new File([f], `Struttura-esterna-${i + 1}_${f.name}`, { type: f.type })),
      ...fotoInterna.map((f, i) => new File([f], `Router-interno-${i + 1}_${f.name}`, { type: f.type })),
    ];

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
        supporto, posizione, gpsLat: gps?.lat, gpsLng: gps?.lng,
        metriCavo, bts, modelloCpe, mac, rssi,
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
      categoria: "struttura",
      icona: <Building2 className="h-6 w-6" strokeWidth={2.25} />,
      valida: () => (supporto.trim() ? null : "Scegli un supporto prima di continuare."),
      contenuto: <TileScelta opzioni={OPZIONI_INSTALLAZIONE.supporto} valore={supporto} onChange={setSupporto} />,
    },
    {
      domanda: "Dove si trova, di preciso?",
      categoria: "struttura",
      icona: <MapPin className="h-6 w-6" strokeWidth={2.25} />,
      aiuto: "Facoltativo — es. balcone, tetto, palo del giardino.",
      contenuto: <CampoGrande type="text" placeholder="Es. Balcone, tetto, palo..." value={posizione} onChange={(e) => setPosizione(e.target.value)} />,
    },
    {
      domanda: "Vuoi salvare la posizione GPS?",
      categoria: "gps",
      icona: <LocateFixed className="h-6 w-6" strokeWidth={2.25} />,
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
      domanda: "Quanti metri di cavo, all'incirca?",
      categoria: "struttura",
      icona: <Ruler className="h-6 w-6" strokeWidth={2.25} />,
      aiuto: "Facoltativo — il tipo di cavo lo registri più avanti, tra i materiali usati.",
      contenuto: <CampoGrande type="number" inputMode="numeric" min="0" placeholder="0" value={metriCavo} onChange={(e) => setMetriCavo(e.target.value)} />,
    },
    {
      domanda: "A quale BTS è agganciato?",
      categoria: "radio",
      icona: <Radio className="h-6 w-6" strokeWidth={2.25} />,
      aiuto: "Facoltativo.",
      contenuto: <CampoGrande type="text" value={bts} onChange={(e) => setBts(e.target.value)} />,
    },
    {
      domanda: "Che modello di CPE hai installato?",
      categoria: "radio",
      icona: <Router className="h-6 w-6" strokeWidth={2.25} />,
      valida: () => (modelloCpe.trim() ? null : "Scegli un modello CPE prima di continuare."),
      contenuto: <TileScelta opzioni={OPZIONI_INSTALLAZIONE.cpe} valore={modelloCpe} onChange={setModelloCpe} />,
    },
    {
      domanda: "Indirizzo MAC?",
      categoria: "radio",
      icona: <Cpu className="h-6 w-6" strokeWidth={2.25} />,
      aiuto: "Facoltativo — trovi la scritta sull'apparato.",
      contenuto: <CampoGrande type="text" placeholder="AA:BB:CC:DD:EE:FF" value={mac} onChange={(e) => setMac(e.target.value)} />,
    },
    {
      domanda: "Segnale RSSI, in dBm?",
      categoria: "radio",
      icona: <Gauge className="h-6 w-6" strokeWidth={2.25} />,
      aiuto: "Facoltativo — dal collaudo.",
      contenuto: <CampoGrande type="number" inputMode="numeric" value={rssi} onChange={(e) => setRssi(e.target.value)} />,
    },
    {
      domanda: "Ping misurato, in ms?",
      categoria: "radio",
      icona: <Gauge className="h-6 w-6" strokeWidth={2.25} />,
      aiuto: "Facoltativo.",
      contenuto: <CampoGrande type="number" inputMode="numeric" value={ping} onChange={(e) => setPing(e.target.value)} />,
    },
    {
      domanda: "Velocità in download, in Mbps?",
      categoria: "radio",
      icona: <Download className="h-6 w-6" strokeWidth={2.25} />,
      aiuto: "Facoltativo.",
      contenuto: <CampoGrande type="number" inputMode="numeric" value={download} onChange={(e) => setDownload(e.target.value)} />,
    },
    {
      domanda: "Velocità in upload, in Mbps?",
      categoria: "radio",
      icona: <Upload className="h-6 w-6" strokeWidth={2.25} />,
      aiuto: "Facoltativo.",
      contenuto: <CampoGrande type="number" inputMode="numeric" value={upload} onChange={(e) => setUpload(e.target.value)} />,
    },
    {
      domanda: "Hai usato materiali extra?",
      categoria: "materiali",
      icona: <Package className="h-6 w-6" strokeWidth={2.25} />,
      aiuto: "Cavi, staffe, connettori — oltre al kit standard.",
      contenuto: <SelettoreMateriali catalogo={catalogoMateriali} valore={materiali} onChange={setMateriali} tipoClienteIniziale={tipoClienteTicket} />,
    },
    {
      domanda: "Come ha pagato la posa?",
      categoria: "pagamento",
      icona: <Euro className="h-6 w-6" strokeWidth={2.25} />,
      contenuto: (
        <TileScelta
          opzioni={["Contanti", "POS", "In Fattura"]}
          valore={metodoPagamento ?? ""}
          onChange={(v) => setMetodoPagamento(v as BozzaInstallazione["metodoPagamento"])}
        />
      ),
    },
    {
      domanda: "Vuoi aggiungere una nota tecnica?",
      categoria: "note",
      icona: <NotebookText className="h-6 w-6" strokeWidth={2.25} />,
      aiuto: "Facoltativo — solo se c'è qualcosa da segnalare in ufficio.",
      contenuto: <AreaGrande placeholder="Scrivi qui..." value={note} onChange={(e) => setNote(e.target.value)} />,
    },
    {
      domanda: "Foto della struttura esterna?",
      categoria: "foto",
      icona: <Camera className="h-6 w-6" strokeWidth={2.25} />,
      aiuto: "Facoltative — puoi scattarne o sceglierne più di una.",
      contenuto: <FotoInputMulti value={fotoEsterna} onChange={setFotoEsterna} etichetta="Scatta o scegli una foto" />,
    },
    {
      domanda: "Foto del router e degli apparati interni?",
      categoria: "foto",
      icona: <Camera className="h-6 w-6" strokeWidth={2.25} />,
      aiuto: "Facoltative — puoi scattarne o sceglierne più di una.",
      contenuto: <FotoInputMulti value={fotoInterna} onChange={setFotoInterna} etichetta="Scatta o scegli una foto" />,
    },
    {
      domanda: "Il cliente conferma l'intervento?",
      categoria: "firma",
      icona: <FileSignature className="h-6 w-6" strokeWidth={2.25} />,
      aiuto: "Un codice a 6 cifre arriva via email — il cliente lo legge ad alta voce, tu lo digiti.",
      valida: () => (firmaCliente ? null : "Conferma la firma del cliente prima di continuare."),
      contenuto: <FirmaClienteScheda riferimento={{ tipo: "appuntamento", id: appuntamentoId }} value={firmaCliente} onChange={setFirmaCliente} />,
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

/** ★ NUOVA (2026-08-26, revisione via artifact) — sostituisce il vecchio
 * FotoInput a scatto singolo: più foto in un colpo solo (dalla fotocamera
 * o dalla galleria), ognuna rimovibile prima di inviare. */
function FotoInputMulti({ value, onChange, etichetta }: { value: File[]; onChange: (f: File[]) => void; etichetta: string }) {
  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex h-20 cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-background px-5 text-center text-[15px] font-bold text-muted-foreground">
        <Camera className="h-5 w-5 shrink-0" strokeWidth={2.25} />
        <span className="truncate">{value.length > 0 ? `${value.length} foto — aggiungine altre` : etichetta}</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            const nuovi = Array.from(e.target.files ?? []);
            if (nuovi.length) onChange([...value, ...nuovi]);
            e.target.value = "";
          }}
        />
      </label>
      {value.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {value.map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm font-semibold">
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-critical"
                aria-label="Rimuovi foto"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
