"use client";

import { useMemo, useState } from "react";
import { Wifi, Router as RouterIcon, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prezziNettoLordo, prezzoPerTipoCliente, formattaValuta } from "@/lib/types";
import type { Tariffa, MaterialeMagazzino } from "@/lib/types";

export interface SceltaPiano {
  tipologiaCliente: "Privato" | "Azienda";
  tariffaNome: string;
  routerNome: string;
  routerPrezzo: number;
  extenderScelto: boolean;
  extenderNome: string;
  extenderPrezzo: number;
  mensile: number;
  unaTantum: number;
}

/** ★ NUOVO — "scegli il tuo piano" prima della Richiesta Dati: il cliente
 * sceglie profilo/router/extender con un riepilogo costi live, invece di
 * trovarsi il campo "Profilo internet" come una tendina anonima in mezzo a
 * un form di dati anagrafici. Router/extender vengono dal catalogo
 * Materiali già esistente (categoria "ROUTER, EXTENDER, POWER LINE, SWITCH
 * E AP", solo le voci Tp-link: EX141/EX520v come router, HX141 come
 * extender mesh) — stesso prezzo mostrato allo staff in Materiali, stessa
 * regola Privato/Business (prezzoPerTipoCliente). */
export function ConfiguratorePiano({
  tariffe,
  router,
  extender,
  onConferma,
}: {
  tariffe: Tariffa[];
  router: MaterialeMagazzino[];
  extender: MaterialeMagazzino | null;
  onConferma: (scelta: SceltaPiano) => void;
}) {
  const [tipologiaCliente, setTipologiaCliente] = useState<"Privato" | "Azienda">("Privato");
  const [tariffaId, setTariffaId] = useState("");
  const [routerId, setRouterId] = useState("incluso");
  const [extenderScelto, setExtenderScelto] = useState(false);

  const tipoPrezzo = tipologiaCliente === "Azienda" ? "Business" : "Privato";

  const tariffeVisibili = useMemo(
    () => tariffe.filter((t) => t.tipologia_cliente === "Tutti" || t.tipologia_cliente === tipologiaCliente),
    [tariffe, tipologiaCliente]
  );
  const tariffaScelta = tariffeVisibili.find((t) => t.id === tariffaId) ?? null;
  const routerScelto = routerId === "incluso" ? null : (router.find((r) => r.id === routerId) ?? null);

  const prezzoRouter = routerScelto ? prezzoPerTipoCliente(routerScelto.prezzo_unitario, tipoPrezzo) : 0;
  const prezzoExtender = extender && extenderScelto ? prezzoPerTipoCliente(extender.prezzo_unitario, tipoPrezzo) : 0;
  const mensile = tariffaScelta?.prezzo_mensile != null ? prezziNettoLordo(tariffaScelta.prezzo_mensile, tariffaScelta.iva_inclusa).lordo : 0;
  const attivazione = tariffaScelta?.prezzo_attivazione != null ? prezziNettoLordo(tariffaScelta.prezzo_attivazione, tariffaScelta.iva_inclusa).lordo : 0;
  const unaTantum = attivazione + prezzoRouter + prezzoExtender;

  function conferma() {
    if (!tariffaScelta) return;
    onConferma({
      tipologiaCliente,
      tariffaNome: tariffaScelta.nome,
      routerNome: routerScelto?.nome ?? "Incluso (nessun costo aggiuntivo)",
      routerPrezzo: prezzoRouter,
      extenderScelto,
      extenderNome: extender?.nome ?? "",
      extenderPrezzo: prezzoExtender,
      mensile,
      unaTantum,
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-card p-5 shadow-2xl sm:p-6">
      <div>
        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Passo 1 di 2</p>
        <h2 className="font-heading text-lg font-bold">Scegli il tuo piano</h2>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-semibold">Tipologia Cliente</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { setTipologiaCliente("Privato"); setTariffaId(""); }}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tipologiaCliente === "Privato" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
          >
            👤 Privato
          </button>
          <button
            type="button"
            onClick={() => { setTipologiaCliente("Azienda"); setTariffaId(""); }}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tipologiaCliente === "Azienda" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
          >
            🏢 Azienda
          </button>
        </div>
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
          <Wifi className="h-4 w-4 text-primary" strokeWidth={2.25} />
          Profilo internet
        </p>
        {tariffeVisibili.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            Nessun piano disponibile al momento per questa tipologia — contatta Done Wifi.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {tariffeVisibili.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTariffaId(t.id)}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${tariffaId === t.id ? "border-primary bg-primary/10" : "hover:border-primary/50"}`}
              >
                <span>
                  <span className="block font-semibold">{t.nome}</span>
                  {t.velocita && <span className="block text-xs text-muted-foreground">{t.velocita}</span>}
                </span>
                {t.prezzo_mensile != null && (
                  <span className="shrink-0 font-mono text-sm font-bold text-primary">
                    {formattaValuta(prezziNettoLordo(t.prezzo_mensile, t.iva_inclusa).lordo)}/mese
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {router.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
            <RouterIcon className="h-4 w-4 text-primary" strokeWidth={2.25} />
            Router
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setRouterId("incluso")}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${routerId === "incluso" ? "border-primary bg-primary/10" : "hover:border-primary/50"}`}
            >
              <span className="font-semibold">Incluso nel canone</span>
              <span className="shrink-0 text-xs font-bold text-success">Nessun costo</span>
            </button>
            {router.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRouterId(r.id)}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${routerId === r.id ? "border-primary bg-primary/10" : "hover:border-primary/50"}`}
              >
                <span className="font-semibold">{r.nome}</span>
                <span className="shrink-0 font-mono text-xs font-bold text-primary">
                  {formattaValuta(prezzoPerTipoCliente(r.prezzo_unitario, tipoPrezzo))} una tantum
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {extender && (
        <label className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
          <span className="flex items-center gap-2">
            <input type="checkbox" checked={extenderScelto} onChange={(e) => setExtenderScelto(e.target.checked)} className="h-4 w-4" />
            <span>
              <span className="flex items-center gap-1.5 font-semibold">
                <Sparkles className="h-3.5 w-3.5 text-primary" strokeWidth={2.25} />
                Vuoi anche un extender mesh?
              </span>
              <span className="block text-xs text-muted-foreground">{extender.nome} — copertura Wi-Fi estesa in tutta casa</span>
            </span>
          </span>
          <span className="shrink-0 font-mono text-xs font-bold text-primary">
            {formattaValuta(prezzoPerTipoCliente(extender.prezzo_unitario, tipoPrezzo))}
          </span>
        </label>
      )}

      {tariffaScelta && (
        <div className="rounded-xl border border-primary/30 bg-accent-soft p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary">Riepilogo</p>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Canone mensile (IVA incl.)</span>
            <span className="font-mono font-bold">{formattaValuta(mensile)}/mese</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Costo una tantum (attivazione + apparati)</span>
            <span className="font-mono font-bold">{formattaValuta(unaTantum)}</span>
          </div>
        </div>
      )}

      <Button type="button" size="lg" className="mt-1 gap-1.5" disabled={!tariffaScelta} onClick={conferma}>
        Conferma e continua
        <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
      </Button>
    </div>
  );
}
