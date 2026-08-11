"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Plus, Trash2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formattaValuta, prezzoPerTipoCliente } from "@/lib/types";
import type { Tariffa, MaterialeMagazzino, RigaPreventivo } from "@/lib/types";
import { creaPreventivo, cercaClientiPerPreventivo, type RisultatoRicercaCliente } from "@/app/(app)/preventivi/actions";

export function NuovoPreventivoForm({ tariffe, materiali }: { tariffe: Tariffa[]; materiali: MaterialeMagazzino[] }) {
  const router = useRouter();
  const [tipologiaCliente, setTipologiaCliente] = useState<"Privato" | "Azienda">("Privato");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [segnalazioneId, setSegnalazioneId] = useState<string | null>(null);
  const [clienteEsternoId, setClienteEsternoId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [righe, setRighe] = useState<RigaPreventivo[]>([]);
  const [rigaLiberaDescrizione, setRigaLiberaDescrizione] = useState("");
  const [rigaLiberaPrezzo, setRigaLiberaPrezzo] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");

  // ★ ricerca cliente esistente (Segnalazioni + Clienti Esterni) — collegarlo
  // qui, invece di scrivere sempre i dati a mano, è quello che fa comparire
  // il preventivo nella sua scheda (vedi getPreventiviCollegati).
  const [ricercaCliente, setRicercaCliente] = useState("");
  const [risultatiRicerca, setRisultatiRicerca] = useState<RisultatoRicercaCliente[]>([]);
  const [clienteCollegato, setClienteCollegato] = useState<RisultatoRicercaCliente | null>(null);
  const timerRicerca = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRicerca.current) clearTimeout(timerRicerca.current);
    if (ricercaCliente.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- azzera i risultati quando la query torna troppo corta per essere cercata, non derivabile durante il render (dipende dal testo digitato nell'effetto precedente).
      setRisultatiRicerca([]);
      return;
    }
    timerRicerca.current = setTimeout(async () => {
      const risultati = await cercaClientiPerPreventivo(ricercaCliente);
      setRisultatiRicerca(risultati);
    }, 300);
    return () => {
      if (timerRicerca.current) clearTimeout(timerRicerca.current);
    };
  }, [ricercaCliente]);

  function selezionaCliente(r: RisultatoRicercaCliente) {
    setClienteCollegato(r);
    setClienteNome(r.nome);
    setClienteTelefono(r.telefono || "");
    setClienteEmail(r.email || "");
    setTipologiaCliente(r.tipologiaCliente);
    setSegnalazioneId(r.tipo === "segnalazione" ? String(r.id) : null);
    setClienteEsternoId(r.tipo === "cliente_esterno" ? Number(r.id) : null);
    setRicercaCliente("");
    setRisultatiRicerca([]);
  }

  function scollegaCliente() {
    setClienteCollegato(null);
    setSegnalazioneId(null);
    setClienteEsternoId(null);
  }

  const tariffeVisibili = tariffe.filter((t) => t.tipologia_cliente === "Tutti" || t.tipologia_cliente === tipologiaCliente);
  const tipoPrezzo = tipologiaCliente === "Azienda" ? "Business" : "Privato";

  function aggiungiTariffa(t: Tariffa) {
    if (t.prezzo_mensile == null) return;
    setRighe((r) => [...r, { descrizione: `${t.nome} (canone mensile)`, quantita: 1, prezzoUnitario: t.prezzo_mensile as number }]);
  }

  function aggiungiMateriale(m: MaterialeMagazzino) {
    setRighe((r) => [...r, { descrizione: m.nome, quantita: 1, prezzoUnitario: prezzoPerTipoCliente(m.prezzo_unitario, tipoPrezzo) }]);
  }

  function aggiungiRigaLibera() {
    const prezzo = Number(rigaLiberaPrezzo.replace(",", "."));
    if (!rigaLiberaDescrizione.trim() || !Number.isFinite(prezzo)) return;
    setRighe((r) => [...r, { descrizione: rigaLiberaDescrizione.trim(), quantita: 1, prezzoUnitario: prezzo }]);
    setRigaLiberaDescrizione("");
    setRigaLiberaPrezzo("");
  }

  function aggiornaQuantita(indice: number, quantita: number) {
    setRighe((r) => r.map((riga, i) => (i === indice ? { ...riga, quantita: Math.max(1, quantita) } : riga)));
  }

  function rimuoviRiga(indice: number) {
    setRighe((r) => r.filter((_, i) => i !== indice));
  }

  const totale = useMemo(() => righe.reduce((s, r) => s + r.quantita * r.prezzoUnitario, 0), [righe]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    if (!clienteNome.trim()) return setErrore("Il nome del cliente è obbligatorio.");
    if (righe.length === 0) return setErrore("Aggiungi almeno una voce al preventivo.");

    setInCorso(true);
    const risultato = await creaPreventivo({
      clienteNome,
      clienteTelefono,
      clienteEmail,
      tipologiaCliente,
      segnalazioneId,
      clienteEsternoId,
      righe,
      note,
    });
    setInCorso(false);
    if (risultato.errore) return setErrore(risultato.errore);
    router.push("/preventivi");
  }

  return (
    <div>
      <Link href="/preventivi" className="mb-4 flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
        Preventivi
      </Link>
      <h1 className="font-heading mb-6 text-2xl font-bold tracking-tight">Nuovo Preventivo</h1>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Cliente</p>

          {clienteCollegato ? (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5 text-xs">
              <span>
                Collegato a: <b>{clienteCollegato.nome}</b> ({clienteCollegato.tipo === "segnalazione" ? "Segnalazione" : "Cliente"})
              </span>
              <button type="button" onClick={scollegaCliente} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={2.5} />
              <input
                value={ricercaCliente}
                onChange={(e) => setRicercaCliente(e.target.value)}
                placeholder="Cerca un cliente/Segnalazione esistente (opzionale)…"
                className="h-9 w-full rounded-md border bg-background pl-8 pr-3 text-sm"
              />
              {risultatiRicerca.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-lg">
                  {risultatiRicerca.map((r) => (
                    <button
                      key={`${r.tipo}-${r.id}`}
                      type="button"
                      onClick={() => selezionaCliente(r)}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-accent"
                    >
                      <span className="font-semibold">{r.nome}</span>
                      <span className="text-muted-foreground">
                        {r.telefono || "—"} · {r.tipo === "segnalazione" ? "Segnalazione" : "Cliente"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mb-3">
            <Label>Tipologia</Label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTipologiaCliente("Privato")}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tipologiaCliente === "Privato" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
              >
                👤 Privato
              </button>
              <button
                type="button"
                onClick={() => setTipologiaCliente("Azienda")}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tipologiaCliente === "Azienda" ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
              >
                🏢 Azienda
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="clienteNome">Nome *</Label>
              <Input id="clienteNome" value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} required className="mt-1" />
            </div>
            <div>
              <Label htmlFor="clienteTelefono">Telefono</Label>
              <Input id="clienteTelefono" value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="clienteEmail">Email</Label>
              <Input id="clienteEmail" type="email" value={clienteEmail} onChange={(e) => setClienteEmail(e.target.value)} className="mt-1" />
              <p className="mt-1 text-[11px] text-muted-foreground">Serve per poterlo inviare in approvazione.</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Aggiungi da catalogo</p>
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Tariffe</p>
              <div className="flex flex-wrap gap-1.5">
                {tariffeVisibili.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => aggiungiTariffa(t)}
                    disabled={t.prezzo_mensile == null}
                    className="rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold shadow-sm transition hover:border-primary/40 disabled:opacity-40"
                  >
                    {t.nome} {t.prezzo_mensile != null && `· ${formattaValuta(t.prezzo_mensile)}/mese`}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Materiali</p>
              <div className="flex flex-wrap gap-1.5">
                {materiali.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => aggiungiMateriale(m)}
                    className="rounded-lg border bg-background px-2.5 py-1.5 text-xs font-semibold shadow-sm transition hover:border-primary/40"
                  >
                    {m.nome} · {formattaValuta(prezzoPerTipoCliente(m.prezzo_unitario, tipoPrezzo))}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Voce libera</p>
              <div className="flex gap-2">
                <Input
                  value={rigaLiberaDescrizione}
                  onChange={(e) => setRigaLiberaDescrizione(e.target.value)}
                  placeholder="Descrizione"
                  className="flex-1"
                />
                <Input
                  value={rigaLiberaPrezzo}
                  onChange={(e) => setRigaLiberaPrezzo(e.target.value)}
                  placeholder="Prezzo €"
                  inputMode="decimal"
                  className="w-28"
                />
                <Button type="button" variant="outline" onClick={aggiungiRigaLibera}>
                  <Plus className="h-4 w-4" strokeWidth={2.25} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Voci del preventivo</p>
          {righe.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ancora nessuna voce — aggiungine dal catalogo sopra.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {righe.map((r, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2 text-sm">
                  <span className="flex-1 break-words">{r.descrizione}</span>
                  <input
                    type="number"
                    min={1}
                    value={r.quantita}
                    onChange={(e) => aggiornaQuantita(i, Number(e.target.value))}
                    className="h-8 w-14 rounded-md border bg-background px-2 text-center text-xs"
                  />
                  <span className="w-20 shrink-0 text-right font-mono text-xs font-semibold tabular-nums">
                    {formattaValuta(r.quantita * r.prezzoUnitario)}
                  </span>
                  <button type="button" onClick={() => rimuoviRiga(i)} className="text-muted-foreground hover:text-critical">
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-2 text-sm font-bold">
                <span>Totale</span>
                <span className="tabular-nums">{formattaValuta(totale)}</span>
              </div>
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="note">Note</Label>
          <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1" />
        </div>

        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}

        <div className="flex justify-end gap-2 pb-6">
          <Link href="/preventivi">
            <Button type="button" variant="ghost">
              Annulla
            </Button>
          </Link>
          <Button type="submit" disabled={inCorso}>
            {inCorso ? "Creazione..." : "Crea Preventivo"}
          </Button>
        </div>
      </form>
    </div>
  );
}
