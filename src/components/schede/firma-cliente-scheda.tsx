"use client";

import { useEffect, useState, useTransition } from "react";
import { Mail, Send, Check, Loader2, AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  getContattoPerFirmaCliente,
  inviaOtpFirmaCliente,
  verificaOtpFirmaCliente,
  inviaLinkFirmaCliente,
  type FirmaClienteApprovata,
  type RiferimentoFirmaCliente,
} from "@/app/(app)/calendario/actions";

/** ★ NUOVA — sostituisce la firma disegnata su schermo del cliente
 * (richiesta esplicita): un codice a 6 cifre via email, letto e confermato
 * di persona al tecnico presente sul posto — prova più solida di un
 * disegno che chiunque potrebbe tracciare al posto del cliente. Un link
 * di approvazione via email resta come fallback, ma richiede
 * un'autorizzazione esplicita del tecnico (confirm dedicato): non è mai
 * una scelta lasciata al cliente stesso.
 *
 * ★ NUOVA — generalizzato a `riferimento` (appuntamento o ticket, vedi
 * RiferimentoFirmaCliente in calendario/actions.ts) invece di un
 * appuntamentoId fisso: componente condiviso da SchedaInstallazioneForm,
 * SchedaLavorazioneForm (via appuntamento) e RapportinoForm (via ticket —
 * il Rapportino di chiusura Ticket non ha un appuntamento collegato,
 * migrazione 0051_firma_cliente_rapportino.sql). Stessa interazione
 * ovunque, un solo posto da mantenere. */
export function FirmaClienteScheda({
  riferimento,
  value,
  onChange,
}: {
  riferimento: RiferimentoFirmaCliente;
  value: FirmaClienteApprovata | null;
  onChange: (v: FirmaClienteApprovata | null) => void;
}) {
  const [nomeCliente, setNomeCliente] = useState("");
  const [ticketNumero, setTicketNumero] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [otpInviato, setOtpInviato] = useState(false);
  const [codice, setCodice] = useState("");
  const [errore, setErrore] = useState("");
  const [inCorsoInvio, startInvio] = useTransition();
  const [inCorsoVerifica, startVerifica] = useTransition();
  const [inCorsoLink, startLink] = useTransition();

  useEffect(() => {
    getContattoPerFirmaCliente(riferimento).then((r) => {
      setNomeCliente(r.nomeCliente || "");
      setTicketNumero(r.ticketNumero);
      if (r.email) setEmail(r.email);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- riferimento è un oggetto letterale ricreato ad ogni render dal chiamante: si confronta sul suo id, non sull'identità dell'oggetto, altrimenti il fetch ripartirebbe ad ogni render.
  }, [riferimento.tipo, riferimento.id]);

  function inviaCodice() {
    setErrore("");
    if (!email.trim()) {
      setErrore("Inserisci l'email del cliente.");
      return;
    }
    startInvio(async () => {
      const risultato = await inviaOtpFirmaCliente(riferimento, email, nomeCliente, ticketNumero ?? 0);
      if (risultato.errore) {
        setErrore(risultato.errore);
        return;
      }
      setOtpInviato(true);
      setCodice("");
    });
  }

  function verifica() {
    setErrore("");
    if (codice.trim().length !== 6) {
      setErrore("Il codice ha 6 cifre.");
      return;
    }
    startVerifica(async () => {
      const risultato = await verificaOtpFirmaCliente(riferimento, email, codice);
      if (risultato.errore || !risultato.verificatoIl) {
        setErrore(risultato.errore || "Errore imprevisto.");
        return;
      }
      onChange({ metodo: "otp_email", email: email.trim(), verificatoIl: risultato.verificatoIl });
    });
  }

  function autorizzaLinkFallback() {
    if (
      !confirm(
        "Confermi di voler passare al link di approvazione via email invece del codice? Il cliente potrà confermare anche in un momento successivo — usalo solo se il codice via email non è un'opzione praticabile adesso."
      )
    )
      return;
    setErrore("");
    startLink(async () => {
      const risultato = await inviaLinkFirmaCliente(riferimento, window.location.origin, email, nomeCliente, ticketNumero ?? 0);
      if (risultato.errore) {
        setErrore(risultato.errore);
        return;
      }
      onChange({ metodo: "link_email", email: email.trim(), verificatoIl: null });
    });
  }

  function ricomincia() {
    onChange(null);
    setOtpInviato(false);
    setCodice("");
    setErrore("");
  }

  if (value) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 p-3">
        {value.metodo === "otp_email" ? (
          <p className="flex items-start gap-1.5 text-sm font-semibold text-success">
            <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
            Confermato da {value.email} il{" "}
            {new Date(value.verificatoIl as string).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.
          </p>
        ) : (
          <p className="flex items-start gap-1.5 text-sm font-semibold text-warning">
            <Mail className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            Link di approvazione inviato a {value.email} — in attesa che il cliente confermi (anche in un momento successivo).
          </p>
        )}
        <button type="button" onClick={ricomincia} className="mt-2 flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline">
          <RotateCcw className="h-3 w-3" strokeWidth={2.5} />
          Ricomincia
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label htmlFor="emailFirmaCliente">Email del cliente</Label>
        <div className="mt-1 flex gap-2">
          <input
            id="emailFirmaCliente"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={otpInviato}
            placeholder="cliente@esempio.it"
            className="h-11 flex-1 rounded-md border bg-background px-3 text-base disabled:opacity-60 sm:h-9 sm:text-sm"
          />
        </div>
      </div>

      {!otpInviato ? (
        <Button type="button" onClick={inviaCodice} disabled={inCorsoInvio} className="min-h-11">
          {inCorsoInvio ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <Send className="h-4 w-4" strokeWidth={2.25} />}
          {inCorsoInvio ? "Invio in corso…" : "Invia codice al cliente"}
        </Button>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Codice inviato a {email}. Chiedi al cliente di leggertelo dalla sua email e digitalo qui sotto.
          </p>
          <div className="flex gap-2">
            <input
              value={codice}
              onChange={(e) => setCodice(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="123456"
              className="h-11 flex-1 rounded-md border bg-background px-3 text-center text-lg font-bold tracking-widest sm:h-9 sm:text-base"
            />
            <Button type="button" onClick={verifica} disabled={inCorsoVerifica || codice.length !== 6} className="min-h-11">
              {inCorsoVerifica ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
              {inCorsoVerifica ? "Verifica…" : "Verifica"}
            </Button>
          </div>
          <button type="button" onClick={inviaCodice} disabled={inCorsoInvio} className="w-fit text-xs text-primary underline-offset-2 hover:underline disabled:opacity-50">
            Invia di nuovo il codice
          </button>
        </>
      )}

      {errore && (
        <p className="flex items-start gap-1.5 text-xs text-critical">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
          {errore}
        </p>
      )}

      <button
        type="button"
        onClick={autorizzaLinkFallback}
        disabled={inCorsoLink || !email.trim()}
        className="mt-1 flex w-fit items-center gap-1.5 text-xs text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
      >
        {inCorsoLink && <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />}
        Il cliente non riceve il codice? Passa al link di approvazione (richiede conferma)
      </button>
    </div>
  );
}
