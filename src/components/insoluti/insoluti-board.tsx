"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Gauge, Search, Phone, Mail, Calendar, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { StatoVuoto } from "@/components/ui/stato-vuoto";
import { useToast } from "@/components/ui/toast";
import { impostaDataRiattivazionePrevista, type ClienteInsolutoRallentato } from "@/app/(app)/clienti-esterni/actions";

function formattaData(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** ★ NUOVA (2026-09-22, richiesta esplicita: "un elenco dei clienti in
 * insoluto o da rallentare da poter consultare, con indicazione da parte
 * del reparto fatturazione di quando riattivarlo perché ha pagato") —
 * elenco sola-lettura per lo stato/nota (si modificano ancora dalla scheda
 * del cliente, vedi StatoCliente in clienti-esterni/[id]/page.tsx — qui
 * servirebbe solo a duplicare quel controllo), con l'unica cosa davvero
 * nuova editabile qui: la data prevista di riattivazione.
 */
export function InsolutiBoard({ clienti }: { clienti: ClienteInsolutoRallentato[] }) {
  const [ricerca, setRicerca] = useState("");

  const clientiFiltrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();
    if (!testo) return clienti;
    return clienti.filter(
      (c) => c.nome.toLowerCase().includes(testo) || (c.telefono || "").includes(testo) || (c.email || "").toLowerCase().includes(testo)
    );
  }, [clienti, ricerca]);

  if (clienti.length === 0) {
    return <StatoVuoto icona={AlertTriangle} titolo="Nessun cliente segnato come insoluto o da rallentare." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2.25} />
        <Input value={ricerca} onChange={(e) => setRicerca(e.target.value)} placeholder="Cerca per nome, telefono o email..." className="h-11 pl-9" />
      </div>

      {clientiFiltrati.length === 0 ? (
        <StatoVuoto icona={Search} titolo="Nessun risultato per questa ricerca." compatto />
      ) : (
        <div className="flex flex-col gap-3">
          {clientiFiltrati.map((c) => (
            <RigaCliente key={c.id} cliente={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function RigaCliente({ cliente }: { cliente: ClienteInsolutoRallentato }) {
  const router = useRouter();
  const toast = useToast();
  const [inCorso, startTransizione] = useTransition();
  const [data, setData] = useState(cliente.dataRiattivazionePrevista ?? "");

  function salvaData(nuovaData: string) {
    setData(nuovaData);
    startTransizione(async () => {
      const risultato = await impostaDataRiattivazionePrevista(cliente.id, nuovaData || null);
      if (risultato.errore) {
        toast(risultato.errore);
        return;
      }
      toast(nuovaData ? "Data di riattivazione salvata." : "Data di riattivazione rimossa.", "successo");
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-md">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/clienti-esterni/${cliente.id}`} className="flex items-center gap-1 font-semibold hover:underline">
            <span className="truncate">{cliente.nome}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.5} />
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {cliente.telefono && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" strokeWidth={2.25} />
                {cliente.telefono}
              </span>
            )}
            {cliente.email && (
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" strokeWidth={2.25} />
                {cliente.email}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {cliente.fatturaInsoluta && (
            <Badge variant="outline" className="border-critical/30 bg-critical/10 text-critical">
              <AlertTriangle className="h-3 w-3" strokeWidth={2.5} />
              Insoluta
            </Badge>
          )}
          {cliente.rallentato && (
            <Badge variant="outline" className="border-warning/30 bg-warning/10 text-warning">
              <Gauge className="h-3 w-3" strokeWidth={2.5} />
              Rallentato
            </Badge>
          )}
        </div>
      </div>

      {(cliente.fatturaInsolutaNota || cliente.rallentatoMotivo) && (
        <div className="mb-2 flex flex-col gap-1 text-xs">
          {cliente.fatturaInsolutaNota && (
            <p>
              <span className="font-semibold text-critical">Insoluta{cliente.fatturaInsolutaDal ? ` dal ${formattaData(cliente.fatturaInsolutaDal)}` : ""}: </span>
              {cliente.fatturaInsolutaNota}
            </p>
          )}
          {cliente.rallentatoMotivo && (
            <p>
              <span className="font-semibold text-warning">Rallentato{cliente.rallentatoDal ? ` dal ${formattaData(cliente.rallentatoDal)}` : ""}: </span>
              {cliente.rallentatoMotivo}
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 border-t pt-2.5">
        <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.25} />
        <label className="text-xs font-semibold text-muted-foreground" htmlFor={`riattivazione-${cliente.id}`}>
          Riattivare il
        </label>
        <input
          id={`riattivazione-${cliente.id}`}
          type="date"
          value={data}
          disabled={inCorso}
          onChange={(e) => salvaData(e.target.value)}
          className="h-9 rounded-md border bg-background px-2.5 text-xs disabled:opacity-60"
        />
        {data && (
          <button
            type="button"
            onClick={() => salvaData("")}
            disabled={inCorso}
            className="text-[11px] font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
          >
            Rimuovi
          </button>
        )}
      </div>
    </div>
  );
}
