"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { IndirizzoAutocomplete } from "@/components/condivisi/indirizzo-autocomplete";
import { creaTicket, cercaClientiEsistenti, listaNomiTariffeAttive, type ClienteEsistente } from "../actions";
import { CATEGORIE_TICKET, REPARTI, SOTTOCATEGORIE_TICKET, REPARTO_PER_CATEGORIA_TICKET } from "@/lib/types";
import { CONFIG_SOTTOCATEGORIE } from "@/lib/campi-ticket";
import type { AreaAccesso, PrioritaTicket } from "@/lib/types";

// ★ NUOVA (2026-08-27, richiesta esplicita — revisione Ticket via artifact:
// "vorrei direttamente che si potesse selezionare l'operazione da fare,
// senza perdermi in categorie") — prima si sceglieva prima la Categoria
// (3 valori astratti: Assistenza/Commerciale/Amministrativa) e SOLO dopo,
// in un campo separato più in basso, il "Dettaglio" vero (le 14
// sottocategorie reali, quelle che dicono davvero cosa fare). Un unico
// elenco appiattito qui — un "Altro" generico per categoria copre il
// vecchio caso "nessun dettaglio specifico" — categoria e reparto
// proposto si derivano da un'unica scelta invece di due passaggi.
interface Operazione {
  valore: string;
  etichetta: string;
  categoria: (typeof CATEGORIE_TICKET)[number];
  sottocategoria: string;
}
const OPERAZIONI: Operazione[] = CATEGORIE_TICKET.flatMap((cat) => [
  { valore: `${cat}::`, etichetta: `Altro (${cat})`, categoria: cat, sottocategoria: "" },
  ...SOTTOCATEGORIE_TICKET[cat].map((s) => ({ valore: `${cat}::${s}`, etichetta: s, categoria: cat, sottocategoria: s })),
]);

export default function NuovoTicketPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const primoCampo = useRef<HTMLInputElement>(null);
  const fileExtraRef = useRef<HTMLInputElement>(null);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState("");
  // ★ arrivando dalla scheda cliente (Anagrafica Aruba) con "Nuovo
  // Ticket per questo cliente", i campi di contatto arrivano già pronti
  // via query string invece di doverli ricercare/ricopiare a mano.
  const [cliente, setCliente] = useState(() => searchParams.get("cliente") ?? "");
  const [telefono, setTelefono] = useState(() => searchParams.get("telefono") ?? "");
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [indirizzo, setIndirizzo] = useState(() => searchParams.get("indirizzo") ?? "");
  const [operazione, setOperazione] = useState<Operazione>(OPERAZIONI[0]);
  const [reparto, setReparto] = useState<AreaAccesso>(REPARTO_PER_CATEGORIA_TICKET[OPERAZIONI[0].categoria]);
  const categoria = operazione.categoria;
  const sottocategoria = operazione.sottocategoria;
  const [suggerimentiCliente, setSuggerimentiCliente] = useState<ClienteEsistente[]>([]);
  const timeoutClienteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ★ opzioni reali del catalogo Tariffe per "Nuovo profilo desiderato"
  // (Upgrade/Downgrade) — caricate solo se serve, non ad ogni apertura del
  // form. Se il caricamento fallisce o il catalogo è vuoto, il campo tiene
  // comunque la lista statica di fallback definita in campi-ticket.ts.
  const [nomiTariffe, setNomiTariffe] = useState<string[] | null>(null);

  const configExtra = sottocategoria ? CONFIG_SOTTOCATEGORIE[sottocategoria] : undefined;

  useEffect(() => {
    if (sottocategoria === "Upgrade/Downgrade" && nomiTariffe === null) {
      listaNomiTariffeAttive().then((nomi) => setNomiTariffe(nomi.length > 0 ? nomi : []));
    }
  }, [sottocategoria, nomiTariffe]);

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
        categoria,
        sottocategoria,
        problema: String(dati.get("problema") || ""),
        priorita: String(dati.get("priorita") || "Normale") as PrioritaTicket,
        reparto,
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

        <div>
          <Label htmlFor="operazione">Operazione</Label>
          <select
            id="operazione"
            value={operazione.valore}
            onChange={(e) => {
              const scelta = OPERAZIONI.find((o) => o.valore === e.target.value);
              if (!scelta) return;
              setOperazione(scelta);
              setReparto(REPARTO_PER_CATEGORIA_TICKET[scelta.categoria]);
            }}
            className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
          >
            {CATEGORIE_TICKET.map((cat) => (
              <optgroup key={cat} label={cat}>
                {OPERAZIONI.filter((o) => o.categoria === cat).map((o) => (
                  <option key={o.valore} value={o.valore}>{o.etichetta}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Reparto e categoria si propongono da soli in base all&apos;operazione — cambiali sotto se serve.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="reparto">Reparto</Label>
            <select
              id="reparto"
              name="reparto"
              value={reparto}
              onChange={(e) => setReparto(e.target.value as AreaAccesso)}
              className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
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
                    {(campo.id === "nuovo_profilo" && nomiTariffe && nomiTariffe.length > 0 ? nomiTariffe : campo.opzioni)?.map((o) => (
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
