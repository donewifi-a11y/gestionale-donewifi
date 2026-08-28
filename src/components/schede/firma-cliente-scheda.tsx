"use client";

import { useEffect, useState, useTransition } from "react";
import { Mail, Send, Check, Loader2, AlertTriangle, RotateCcw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  getContattoPerFirmaCliente,
  inviaOtpFirmaCliente,
  verificaOtpFirmaCliente,
  inviaLinkFirmaCliente,
  getAmministratoriAttiviPerFirma,
  richiediOtpAmministratore,
  verificaOtpAmministratore,
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

  // ★ NUOVA (2026-08-28, richiesta esplicita: "bypassare nel rapporto di
  // lavoro otp del cliente facendo richiedere con otp agli amministratori")
  // — quando il cliente non può confermare in nessun modo (non solo "non
  // riceve l'email", ma proprio irraggiungibile/assente): un amministratore
  // autorizza al suo posto, stesso codice a 6 cifre ma consegnato in Chat
  // interna a tutti gli amministratori invece che via email al cliente.
  const [amministratori, setAmministratori] = useState<{ id: string; nome: string }[]>([]);
  const [modalitaAdmin, setModalitaAdmin] = useState(false);
  const [adminSelezionato, setAdminSelezionato] = useState("");
  const [otpAdminInviato, setOtpAdminInviato] = useState(false);
  const [codiceAdmin, setCodiceAdmin] = useState("");
  const [inCorsoRichiestaAdmin, startRichiestaAdmin] = useTransition();
  const [inCorsoVerificaAdmin, startVerificaAdmin] = useTransition();

  useEffect(() => {
    getContattoPerFirmaCliente(riferimento).then((r) => {
      setNomeCliente(r.nomeCliente || "");
      setTicketNumero(r.ticketNumero);
      if (r.email) setEmail(r.email);
    });
    getAmministratoriAttiviPerFirma().then(setAmministratori);
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

  // ★ NUOVA (2026-08-28, "bypassare... con otp agli amministratori") —
  // conferma volutamente più pesante di autorizzaLinkFallback(): qui si
  // salta del tutto la conferma del cliente, non solo la si rimanda.
  function richiediBypassAdmin() {
    if (
      !confirm(
        "Confermi che il cliente non può confermare in nessun modo (non raggiungibile, assente...)? Un amministratore riceverà un codice in Chat interna e te lo darà lui — questa Scheda risulterà autorizzata da un amministratore, non dal cliente."
      )
    )
      return;
    setModalitaAdmin(true);
    setErrore("");
    inviaCodiceAdmin();
  }

  function inviaCodiceAdmin() {
    setErrore("");
    startRichiestaAdmin(async () => {
      const risultato = await richiediOtpAmministratore(riferimento, nomeCliente, ticketNumero ?? 0);
      if (risultato.errore) {
        setErrore(risultato.errore);
        return;
      }
      setOtpAdminInviato(true);
      setCodiceAdmin("");
    });
  }

  function verificaAdmin() {
    setErrore("");
    if (!adminSelezionato) {
      setErrore("Indica quale amministratore ti ha dato il codice.");
      return;
    }
    if (codiceAdmin.trim().length !== 6) {
      setErrore("Il codice ha 6 cifre.");
      return;
    }
    startVerificaAdmin(async () => {
      const risultato = await verificaOtpAmministratore(riferimento, codiceAdmin, adminSelezionato);
      if (risultato.errore || !risultato.verificatoIl) {
        setErrore(risultato.errore || "Errore imprevisto.");
        return;
      }
      const admin = amministratori.find((a) => a.id === adminSelezionato);
      onChange({ metodo: "otp_admin", email: "", verificatoIl: risultato.verificatoIl, adminId: adminSelezionato, adminNome: admin?.nome ?? "" });
    });
  }

  function ricomincia() {
    onChange(null);
    setOtpInviato(false);
    setCodice("");
    setModalitaAdmin(false);
    setOtpAdminInviato(false);
    setCodiceAdmin("");
    setAdminSelezionato("");
    setErrore("");
  }

  if (value) {
    return (
      <div className={`rounded-xl border p-3 ${value.metodo === "otp_admin" ? "border-critical/30 bg-critical/5" : "border-success/30 bg-success/5"}`}>
        {value.metodo === "otp_email" ? (
          <p className="flex items-start gap-1.5 text-sm font-semibold text-success">
            <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
            Confermato da {value.email} il{" "}
            {new Date(value.verificatoIl as string).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.
          </p>
        ) : value.metodo === "otp_admin" ? (
          <p className="flex items-start gap-1.5 text-sm font-semibold text-critical">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            Autorizzato dall&apos;amministratore {value.adminNome} il{" "}
            {new Date(value.verificatoIl as string).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} —
            non è una conferma del cliente.
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

  // ★ NUOVA (2026-08-28, "bypassare... con otp agli amministratori") —
  // schermata a sé, non un ramo in mezzo al flusso email/OTP cliente:
  // qui si sta esplicitamente rinunciando alla conferma del cliente.
  if (modalitaAdmin) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-critical/20 bg-critical/5 p-3">
        <p className="flex items-start gap-1.5 text-xs font-semibold text-critical">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
          Bypass amministratore — il cliente non conferma, un amministratore autorizza al suo posto.
        </p>

        {otpAdminInviato && (
          <p className="text-xs text-muted-foreground">
            Codice inviato in Chat interna a tutti gli amministratori attivi. Chiamane uno e chiedigli il codice.
          </p>
        )}

        <div>
          <Label htmlFor="adminFirmaCliente">Quale amministratore ti ha dato il codice?</Label>
          <select
            id="adminFirmaCliente"
            value={adminSelezionato}
            onChange={(e) => setAdminSelezionato(e.target.value)}
            className="mt-1 h-11 w-full rounded-md border bg-background px-3 text-base sm:h-9 sm:text-sm"
          >
            <option value="">Scegli...</option>
            {amministratori.map((a) => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
        </div>

        {otpAdminInviato && (
          <div className="flex gap-2">
            <input
              value={codiceAdmin}
              onChange={(e) => setCodiceAdmin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="123456"
              className="h-11 flex-1 rounded-md border bg-background px-3 text-center text-lg font-bold tracking-widest sm:h-9 sm:text-base"
            />
            <Button type="button" onClick={verificaAdmin} disabled={inCorsoVerificaAdmin || codiceAdmin.length !== 6} className="min-h-11">
              {inCorsoVerificaAdmin ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <Check className="h-4 w-4" strokeWidth={2.5} />}
              {inCorsoVerificaAdmin ? "Verifica…" : "Verifica"}
            </Button>
          </div>
        )}

        {errore && (
          <p className="flex items-start gap-1.5 text-xs text-critical">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
            {errore}
          </p>
        )}

        <div className="flex items-center gap-3">
          {otpAdminInviato && (
            <button type="button" onClick={inviaCodiceAdmin} disabled={inCorsoRichiestaAdmin} className="text-xs text-primary underline-offset-2 hover:underline disabled:opacity-50">
              Invia di nuovo il codice
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setModalitaAdmin(false);
              setOtpAdminInviato(false);
              setCodiceAdmin("");
              setAdminSelezionato("");
              setErrore("");
            }}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Torna alla conferma del cliente
          </button>
        </div>
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

      {/* ★ NUOVA (2026-08-28, "bypassare... con otp agli amministratori")
      — un gradino più in basso del link fallback: quello è per "il
      cliente riceve la conferma più tardi", questo è per "il cliente non
      conferma proprio", volutamente separato e meno in vista. */}
      <button
        type="button"
        onClick={richiediBypassAdmin}
        disabled={inCorsoRichiestaAdmin}
        className="flex w-fit items-center gap-1.5 text-xs text-critical/80 underline-offset-2 hover:underline disabled:opacity-50"
      >
        {inCorsoRichiestaAdmin && <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />}
        Il cliente non può confermare in nessun modo? Chiedi l&apos;autorizzazione di un amministratore
      </button>
    </div>
  );
}
