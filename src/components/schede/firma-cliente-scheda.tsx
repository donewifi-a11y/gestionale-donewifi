"use client";

import { useEffect, useState, useTransition } from "react";
import { Mail, Send, Check, Loader2, AlertTriangle, RotateCcw, ShieldAlert, Building2 } from "lucide-react";
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
 * ovunque, un solo posto da mantenere.
 *
 * ★ RIVISTA (2026-08-28, richiesta esplicita: "deve uscire un secondo tab
 * con possibilità di ricevere otp da amministratore. non mettere dicitura
 * amministratore ma metti ufficio") — il bypass (2026-08-28, giro
 * precedente) era un link defilato in fondo, con un confirm() pesante
 * prima di procedere: promosso a una vera seconda scheda, alla pari della
 * conferma cliente — nessun popup di conferma, la scelta della scheda e
 * poi il tocco su "Richiedi codice" bastano come gesto deliberato. Il
 * concetto resta lo stesso (un amministratore autorizza), ma nel testo
 * rivolto a chi usa la Scheda si chiama sempre "ufficio" — i nomi
 * interni (variabili, azioni server) restano "admin" perché è quello
 * davvero: solo cosa legge il tecnico cambia. */
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

  const [tab, setTab] = useState<"cliente" | "ufficio">("cliente");
  const [amministratori, setAmministratori] = useState<{ id: string; nome: string }[]>([]);
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
      setErrore("Indica chi in ufficio ti ha dato il codice.");
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
    setTab("cliente");
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
            Autorizzato dall&apos;ufficio ({value.adminNome}) il{" "}
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

  return (
    <div className="flex flex-col gap-3">
      {/* ★ NUOVA (2026-08-28, "deve uscire un secondo tab") — stesso guscio
      "pillola" già uniformato ovunque nel gestionale (Calendario/Materiali/
      Persone/Clienti), non un link defilato: le due strade sono alla pari,
      non una nascosta in fondo all'altra. */}
      <div className="flex items-center gap-1 self-start rounded-full border bg-card p-1 shadow-sm">
        <button
          type="button"
          onClick={() => setTab("cliente")}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${tab === "cliente" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}
        >
          Cliente
        </button>
        <button
          type="button"
          onClick={() => setTab("ufficio")}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${tab === "ufficio" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}
        >
          Ufficio
        </button>
      </div>

      {tab === "cliente" ? (
        <>
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
        </>
      ) : (
        <>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
            Il cliente non può confermare? Un codice arriva in ufficio — chi lo riceve te lo dà a voce.
          </p>

          {!otpAdminInviato ? (
            <Button type="button" onClick={inviaCodiceAdmin} disabled={inCorsoRichiestaAdmin} className="min-h-11">
              {inCorsoRichiestaAdmin ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <Send className="h-4 w-4" strokeWidth={2.25} />}
              {inCorsoRichiestaAdmin ? "Invio in corso…" : "Richiedi codice all'ufficio"}
            </Button>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Codice inviato in ufficio. Chiama e chiedi il codice a chi risponde.</p>

              <div>
                <Label htmlFor="adminFirmaCliente">Chi in ufficio ti ha dato il codice?</Label>
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
              <button type="button" onClick={inviaCodiceAdmin} disabled={inCorsoRichiestaAdmin} className="w-fit text-xs text-primary underline-offset-2 hover:underline disabled:opacity-50">
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
        </>
      )}
    </div>
  );
}
