"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IndirizzoAutocomplete } from "@/components/condivisi/indirizzo-autocomplete";
import { creaTicket, cercaClientiEsistenti, type ClienteEsistente } from "../actions";
import { CATEGORIE_TICKET, REPARTI, SOTTOCATEGORIE_TICKET } from "@/lib/types";
import { CONFIG_SOTTOCATEGORIE } from "@/lib/campi-ticket";
import type { AreaAccesso, PrioritaTicket } from "@/lib/types";

export default function NuovoTicketPage() {
  const router = useRouter();
  const primoCampo = useRef<HTMLInputElement>(null);
  const fileExtraRef = useRef<HTMLInputElement>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  const [cliente, setCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [indirizzo, setIndirizzo] = useState("");
  const [categoria, setCategoria] = useState<(typeof CATEGORIE_TICKET)[number]>(CATEGORIE_TICKET[0]);
  const [sottocategoria, setSottocategoria] = useState("");
  const [suggerimentiCliente, setSuggerimentiCliente] = useState<ClienteEsistente[]>([]);
  const timeoutClienteRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const configExtra = sottocategoria ? CONFIG_SOTTOCATEGORIE[sottocategoria] : undefined;

  function onCambiaCliente(v: string) {
    setCliente(v);
    if (timeoutClienteRef.current) clearTimeout(timeoutClienteRef.current);
    if (v.trim().length < 2) {
      setSuggerimentiCliente([]);
      return;
    }
    timeoutClienteRef.current = setTimeout(async () => {
      setSuggerimentiCliente(await cercaClientiEsistenti(v));
    }, 300);
  }

  function scegliCliente(c: ClienteEsistente) {
    setCliente(c.cliente);
    if (c.telefono) setTelefono(c.telefono);
    if (c.email) setEmail(c.email);
    if (c.indirizzo) setIndirizzo(c.indirizzo);
    setSuggerimentiCliente([]);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrore("");
    const dati = new FormData(e.currentTarget);
    const nomeCliente = cliente.trim();
    if (!nomeCliente) {
      setErrore("Il nome del cliente è obbligatorio.");
      return;
    }

    // ★ campi extra per sottocategoria (ex CONFIG_CATEGORIE) — raccolti
    // qui e validati come i campi normali, un file al massimo.
    const dettagliExtra: Record<string, string> = {};
    let fileExtra: File | null = null;
    if (configExtra) {
      for (const campo of configExtra.campi) {
        if (campo.tipo === "file") {
          fileExtra = fileExtraRef.current?.files?.[0] ?? null;
          continue;
        }
        const valore = String(dati.get(`cx_${campo.id}`) || "").trim();
        if (campo.obbligatorio && !valore) {
          setErrore(`Il campo "${campo.label}" è obbligatorio.`);
          return;
        }
        if (valore) dettagliExtra[campo.id] = valore;
      }
    }

    setInCorso(true);
    const risultato = await creaTicket(
      {
        cliente: nomeCliente,
        telefono,
        email,
        indirizzo,
        categoria: String(dati.get("categoria") || CATEGORIE_TICKET[0]),
        sottocategoria,
        problema: String(dati.get("problema") || ""),
        priorita: String(dati.get("priorita") || "Normale") as PrioritaTicket,
        reparto: String(dati.get("reparto") || REPARTI[0]) as AreaAccesso,
        dettagliExtra,
      },
      fileExtra
    );
    if (risultato.errore) {
      setErrore(risultato.errore);
      setInCorso(false);
      return;
    }
    router.push("/tickets");
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <Link
          href="/tickets"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          Torna ai Ticket
        </Link>
        <h1 className="font-heading mt-1 text-2xl font-bold tracking-tight">Nuovo Ticket</h1>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="relative">
          <Label htmlFor="cliente">Cliente *</Label>
          <Input
            ref={primoCampo}
            id="cliente"
            name="cliente"
            autoFocus
            required
            autoComplete="off"
            value={cliente}
            onChange={(e) => onCambiaCliente(e.target.value)}
            className="mt-1"
          />
          {suggerimentiCliente.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-xl">
              {suggerimentiCliente.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => scegliCliente(c)}
                  className="flex w-full flex-col border-t px-3 py-2 text-left text-xs transition first:border-t-0 hover:bg-muted"
                >
                  <span className="font-semibold">{c.cliente}</span>
                  {c.telefono && <span className="text-muted-foreground">{c.telefono}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="telefono">Telefono</Label>
            <Input id="telefono" name="telefono" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
          </div>
        </div>

        <div>
          <Label htmlFor="indirizzo">Indirizzo</Label>
          <IndirizzoAutocomplete id="indirizzo" name="indirizzo" value={indirizzo} onChange={setIndirizzo} className="mt-1" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="categoria">Categoria</Label>
            <select
              id="categoria"
              name="categoria"
              value={categoria}
              onChange={(e) => {
                setCategoria(e.target.value as (typeof CATEGORIE_TICKET)[number]);
                setSottocategoria("");
              }}
              className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              {CATEGORIE_TICKET.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="reparto">Reparto</Label>
            <select id="reparto" name="reparto" defaultValue={REPARTI[0]} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
              {REPARTI.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="priorita">Priorità</Label>
            <select id="priorita" name="priorita" defaultValue="Normale" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
              <option value="Urgente">Urgente</option>
              <option value="Normale">Normale</option>
              <option value="Bassa">Bassa</option>
            </select>
          </div>
        </div>

        <div>
          <Label htmlFor="sottocategoria">Dettaglio (facoltativo)</Label>
          <select
            id="sottocategoria"
            name="sottocategoria"
            key={categoria}
            value={sottocategoria}
            onChange={(e) => setSottocategoria(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Nessun dettaglio specifico</option>
            {SOTTOCATEGORIE_TICKET[categoria].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {configExtra && (
          <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-accent-soft/40 p-3.5">
            {configExtra.info && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.25} />
                {configExtra.info}
              </p>
            )}
            {configExtra.campi.map((campo) => (
              <div key={campo.id}>
                <Label htmlFor={`cx_${campo.id}`}>
                  {campo.label}
                  {campo.obbligatorio && " *"}
                </Label>
                {campo.tipo === "select" ? (
                  <select id={`cx_${campo.id}`} name={`cx_${campo.id}`} defaultValue="" className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm">
                    <option value="">-- Seleziona --</option>
                    {campo.opzioni?.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : campo.tipo === "textarea" ? (
                  <Textarea id={`cx_${campo.id}`} name={`cx_${campo.id}`} placeholder={campo.placeholder} rows={2} className="mt-1" />
                ) : campo.tipo === "file" ? (
                  <input ref={fileExtraRef} id={`cx_${campo.id}`} type="file" accept="image/*,.pdf" className="mt-1 block w-full text-xs" />
                ) : (
                  <Input id={`cx_${campo.id}`} name={`cx_${campo.id}`} type={campo.tipo} placeholder={campo.placeholder} className="mt-1" />
                )}
                {campo.hint && <p className="mt-1 text-[11px] text-muted-foreground">{campo.hint}</p>}
              </div>
            ))}
          </div>
        )}

        <div>
          <Label htmlFor="problema">Problema / Note</Label>
          <Textarea id="problema" name="problema" rows={4} className="mt-1" />
        </div>

        {errore && (
          <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Link href="/tickets">
            <Button type="button" variant="ghost">Annulla</Button>
          </Link>
          <Button type="submit" disabled={inCorso}>
            {inCorso ? "Creazione..." : "Crea Ticket"}
          </Button>
        </div>
      </form>
    </div>
  );
}
