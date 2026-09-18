"use client";

import { Loader2, FileSignature, Send, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InvioLinkCliente } from "@/components/condivisi/invio-link";
import { PulsanteDocumento } from "@/components/condivisi/pulsante-documento";
import { urlDocumentoRichiesta } from "@/app/(app)/richieste-clienti/actions";
import { inviaEmailPraticaGenerica } from "@/app/(app)/tickets/actions";
import { CONFIG_STATO_TRACCIA, type StatoTraccia as TipoStatoTraccia } from "@/lib/stato-traccia";
import type { RichiestaCliente } from "@/lib/types";

/**
 * ★ ESTRATTA (2026-09-18, split del monolite DettaglioTicket — ~1175
 * righe in tickets-board.tsx) — nessuna modifica di logica: componente
 * puramente presentazionale, era già così prima dello spostamento (stato
 * e handler restano tutti in DettaglioTicket, passati qui come props).
 *
 * ★ NUOVA (2026-08) — Sistema Subentro, Opzione B (doppio consenso in
 * parallelo — proposta approvata, vedi README): sostituisce il singolo
 * InvioLinkCliente usato dalle altre pratiche pubbliche con due tracce
 * indipendenti — il VECCHIO cliente (contatto già noto, quello del
 * Ticket) conferma solo sì/no la cessione; il NUOVO cliente (contatto
 * ancora sconosciuto al sistema, l'operatore lo digita qui) compila dati e
 * documenti nel modulo pubblico esistente. Le due possono rispondere in
 * qualsiasi ordine — nessuna delle due blocca l'altra.
 */
export function SubentroDoppioConsenso({
  praticaSubentro,
  nuovoClienteHaRisposto,
  nomeNuovoTitolare,
  setNomeNuovoTitolare,
  inCorsoAvvioSubentro,
  avviaSubentro,
  linkVecchioCliente,
  esitoLinkVecchio,
  inCorsoLinkVecchio,
  inviaLinkVecchio,
  ticketTelefono,
  linkNuovoClienteSubentro,
  telefonoNuovoCliente,
  setTelefonoNuovoCliente,
  emailNuovoCliente,
  setEmailNuovoCliente,
  nomeCliente,
  salvaContattoBozza,
  inCorsoCompletamentoSubentro,
  completaSubentroClick,
  inCorsoContrattoSubentro,
  caricaContrattoSubentroClick,
  inCorsoInvioContrattoSubentro,
  inviaContrattoSubentroClick,
  ticketCompletato,
}: {
  praticaSubentro: RichiestaCliente | undefined;
  nuovoClienteHaRisposto: boolean;
  nomeNuovoTitolare: string;
  setNomeNuovoTitolare: (v: string) => void;
  inCorsoAvvioSubentro: boolean;
  avviaSubentro: () => void;
  linkVecchioCliente: string;
  esitoLinkVecchio: string;
  inCorsoLinkVecchio: boolean;
  inviaLinkVecchio: () => void;
  ticketTelefono: string | null;
  linkNuovoClienteSubentro: string;
  telefonoNuovoCliente: string;
  setTelefonoNuovoCliente: (v: string) => void;
  emailNuovoCliente: string;
  setEmailNuovoCliente: (v: string) => void;
  nomeCliente: string;
  /** ★ NUOVA — salva la bozza di telefono/email del nuovo cliente appena
   * si esce dal campo (vedi commento in DettaglioTicket). */
  salvaContattoBozza: () => void;
  inCorsoCompletamentoSubentro: boolean;
  completaSubentroClick: () => void;
  inCorsoContrattoSubentro: boolean;
  caricaContrattoSubentroClick: (file: File | null) => void;
  inCorsoInvioContrattoSubentro: boolean;
  inviaContrattoSubentroClick: () => void;
  ticketCompletato: boolean;
}) {
  if (!praticaSubentro) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-3">
        <div>
          <Label htmlFor="nomeNuovoTitolare">Nome del nuovo titolare (facoltativo)</Label>
          <Input
            id="nomeNuovoTitolare"
            value={nomeNuovoTitolare}
            onChange={(e) => setNomeNuovoTitolare(e.target.value)}
            placeholder="Se già lo conosci — comparirà nel link di conferma"
            className="mt-1 h-9 text-xs"
          />
        </div>
        <Button size="sm" onClick={avviaSubentro} disabled={inCorsoAvvioSubentro} className="min-h-9">
          {inCorsoAvvioSubentro ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <FileSignature className="h-3.5 w-3.5" strokeWidth={2.25} />}
          {inCorsoAvvioSubentro ? "Avvio in corso…" : "Avvia pratica di Subentro"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Crea la pratica: dopo puoi inviare separatamente il link di conferma al vecchio cliente e il modulo dati al nuovo.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ★ ALLEGGERITA (2026-09, "un po' incasinato" — screenshot del
      popup reale, tab Documenti) — ogni traccia era un riquadro bordato
      (bg-muted/40) che conteneva a sua volta la card di InvioLinkCliente
      (bordo + ombra propria): un riquadro dentro un riquadro, la stessa
      anteprima messaggio ripetuta due volte in sequenza. Ora la card di
      InvioLinkCliente (già ben distinguibile da sola) resta l'unico
      riquadro; il testo/pulsante che la precede è semplice testo, non
      un'altra cornice. */}
      <StatoTraccia
        etichetta="Vecchio cliente"
        stato={praticaSubentro.vecchio_cliente_confermato_il ? "ok" : praticaSubentro.vecchio_cliente_rifiutato_il ? "no" : "attesa"}
        testoOk="Cessione confermata"
        testoNo="Non ha confermato"
        testoAttesa="In attesa di conferma"
      />
      {/* ★ NASCOSTA A CONFERMA AVVENUTA (2026-09-09, "devi togliere una
      volta approvati... la possibilità di mandare il link al vecchio
      cliente" — dopo lo stesso screenshot del popup reale) — una volta
      confermato non c'è più nulla da fare qui: reinviare un link di
      conferma già dato non ha senso, il pallino verde sopra è già tutta
      l'informazione che serve. Resta visibile solo mentre serve ancora
      un'azione (in attesa, o rifiutato — lì può servire reinviarlo). */}
      {!praticaSubentro.vecchio_cliente_confermato_il && (
        <div>
          {!linkVecchioCliente ? (
            <>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Link di sola conferma (nessun dato da inserire) — verso il contatto già registrato sul Ticket.
              </p>
              <Button size="sm" variant="outline" onClick={inviaLinkVecchio} disabled={inCorsoLinkVecchio} className="min-h-9 w-full">
                {inCorsoLinkVecchio ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Send className="h-3.5 w-3.5" strokeWidth={2.25} />}
                {inCorsoLinkVecchio ? "Invio…" : "Invia link di conferma al vecchio cliente"}
              </Button>
            </>
          ) : (
            <>
              {/* ★ solo WhatsApp/copia: l'email è già stata inviata dal
              pulsante sopra (stesso link) — un secondo pulsante Email qui
              manderebbe una seconda email identica invece di aprire un
              vero client locale, inutile. */}
              <InvioLinkCliente
                url={linkVecchioCliente}
                telefono={ticketTelefono}
                email={null}
                messaggio={`Ciao, conferma la cessione del contratto Done Wifi: ${linkVecchioCliente}`}
                onInviaEmail={async () => ({ errore: null })}
              />
              <button type="button" onClick={inviaLinkVecchio} disabled={inCorsoLinkVecchio} className="mt-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60">
                {inCorsoLinkVecchio ? "Invio…" : "Invia di nuovo"}
              </button>
            </>
          )}
          {esitoLinkVecchio && <p className="mt-1.5 text-[11px] text-muted-foreground">{esitoLinkVecchio}</p>}
        </div>
      )}

      <StatoTraccia
        etichetta="Nuovo cliente"
        stato={nuovoClienteHaRisposto ? "ok" : "attesa"}
        testoOk="Dati e documenti ricevuti"
        testoNo=""
        testoAttesa="In attesa dei dati"
      />
      {/* ★ NASCOSTA A DATI RICEVUTI (2026-09-09, stessa richiesta) — una
      volta che il nuovo cliente ha già inviato i suoi dati, i campi per
      inserirne una bozza e il link da rimandargli non servono più: il
      modulo è già stato compilato per davvero (vedi "Moduli ricevuti dal
      cliente"/tab Documenti), riscriverlo o rimandare il link
      creerebbe solo confusione su quale versione sia quella buona. */}
      {!nuovoClienteHaRisposto && (
      <div>
        <p className="mb-2 text-[11px] text-muted-foreground">Modulo dati + documenti — il contatto del nuovo titolare non è ancora noto al sistema, inseriscilo qui.</p>
        <div className="mb-2.5 grid grid-cols-2 gap-2">
          <Input
            value={telefonoNuovoCliente}
            onChange={(e) => setTelefonoNuovoCliente(e.target.value)}
            onBlur={salvaContattoBozza}
            placeholder="Telefono nuovo cliente"
            className="h-9 text-xs"
          />
          <Input
            value={emailNuovoCliente}
            onChange={(e) => setEmailNuovoCliente(e.target.value)}
            onBlur={salvaContattoBozza}
            placeholder="Email nuovo cliente"
            type="email"
            className="h-9 text-xs"
          />
        </div>
        <InvioLinkCliente
          url={linkNuovoClienteSubentro}
          telefono={telefonoNuovoCliente || null}
          email={emailNuovoCliente || null}
          messaggio={`Ciao, per completare il subentro sul contratto ${nomeCliente} apri questo link: ${linkNuovoClienteSubentro}`}
          onInviaEmail={() => inviaEmailPraticaGenerica(emailNuovoCliente, nomeNuovoTitolare, "Dati per il Subentro", linkNuovoClienteSubentro, "Commerciale")}
        />
      </div>
      )}

      {/* ★ NUOVA (2026-09, "il contratto nuovo approvato solo da nuovo" —
      vedi l'artifact "Il Subentro Fino all'Installazione") — visibile solo
      dopo che il nuovo cliente ha inviato i suoi dati: prima di allora non
      c'è ancora nulla su cui basare il contratto. Approva SOLO il nuovo
      cliente (il vecchio ha già dato il suo consenso alla cessione sopra),
      stesso meccanismo già in uso per il contratto dei Nuovi Clienti. */}
      {nuovoClienteHaRisposto && (
        <>
          <StatoTraccia
            etichetta="Contratto"
            stato={praticaSubentro.contratto_approvato_nuovo_cliente_il ? "ok" : "attesa"}
            testoOk="Approvato dal nuovo cliente"
            testoNo=""
            testoAttesa={praticaSubentro.contratto_inviato_approvazione_il ? "In attesa di approvazione" : "Da caricare"}
          />
          <div className="rounded-xl border bg-muted/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* ★ FIX (2026-09-10, "diversi tipi di forme e non
              uniformità" — screenshot del popup reale) — questa etichetta
              era alta 36px (min-h-9) accanto a PulsanteDocumento
              ("Vedi contratto" + icona download) alto 44px (min-h-11):
              stessa riga, due altezze diverse. Allineata alla stessa
              altezza del componente condiviso invece di lasciarla al suo
              valore di default. */}
              <label className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border bg-background px-2.5 text-xs font-semibold transition hover:border-primary/40">
                {inCorsoContrattoSubentro ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />}
                {praticaSubentro.contratto_pdf_url ? "Ricarica contratto" : "Carica contratto (PDF)"}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  disabled={inCorsoContrattoSubentro}
                  onChange={(e) => {
                    caricaContrattoSubentroClick(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
              {praticaSubentro.contratto_pdf_url && (
                <PulsanteDocumento percorso={praticaSubentro.contratto_pdf_url} nome="contratto-subentro.pdf" etichetta="Vedi contratto" onOttieniUrl={urlDocumentoRichiesta} />
              )}
            </div>
            {praticaSubentro.contratto_pdf_url && !praticaSubentro.contratto_approvato_nuovo_cliente_il && (
              <Button size="sm" variant="outline" onClick={inviaContrattoSubentroClick} disabled={inCorsoInvioContrattoSubentro} className="mt-2 min-h-9 w-full">
                {inCorsoInvioContrattoSubentro ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Send className="h-3.5 w-3.5" strokeWidth={2.25} />}
                {inCorsoInvioContrattoSubentro ? "Invio…" : praticaSubentro.contratto_inviato_approvazione_il ? "Invia di nuovo" : "Invia per approvazione al nuovo cliente"}
              </Button>
            )}
          </div>
        </>
      )}

      {/* ★ NUOVA (2026-09, "è un macello, va riorganizzata e
      semplificata" — passo 3+5 della proposta) — un solo segnale, acceso
      da solo quando le tracce sopra sono complete, invece di dover andare
      a spostare a mano la card tra le colonne di stato in "Richieste
      Clienti". Il pulsante chiude per davvero la pratica.
      ★ ESTESA (2026-09, "il contratto nuovo approvato solo da nuovo") —
      "completa" ora richiede anche il contratto approvato e il Ticket
      "Completato" (installazione svolta), non solo i due consensi di
      partenza — la pratica non è finita finché non lo è davvero. */}
      {praticaSubentro.stato === "Lavorata" ? (
        <div className="flex items-center gap-1.5 rounded-lg bg-success/10 px-3 py-2 text-xs font-semibold text-success">
          <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
          Subentro chiuso — trasferimento completato.
        </div>
      ) : (
        praticaSubentro.vecchio_cliente_confermato_il &&
        nuovoClienteHaRisposto &&
        praticaSubentro.contratto_approvato_nuovo_cliente_il &&
        ticketCompletato && (
          <div className="flex flex-col gap-2 rounded-xl border border-success/30 bg-success/10 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-success">
              <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
              Pronta da completare — contratto approvato, installazione svolta.
            </p>
            <Button size="sm" onClick={completaSubentroClick} disabled={inCorsoCompletamentoSubentro} className="min-h-9">
              {inCorsoCompletamentoSubentro ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
              {inCorsoCompletamentoSubentro ? "Chiusura in corso…" : "Trasferimento completato"}
            </Button>
            <p className="text-[11px] text-muted-foreground">Premi qui dopo aver eseguito il cambio intestatario nel sistema esterno (Aruba/anagrafica).</p>
          </div>
        )
      )}
    </div>
  );
}

function StatoTraccia({
  etichetta,
  stato,
  testoOk,
  testoNo,
  testoAttesa,
}: {
  etichetta: string;
  stato: TipoStatoTraccia;
  testoOk: string;
  testoNo: string;
  testoAttesa: string;
}) {
  const { icona: Icona, classi } = CONFIG_STATO_TRACCIA[stato];
  const testo = { ok: testoOk, no: testoNo, attesa: testoAttesa }[stato];
  return (
    <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${classi}`}>
      <Icona className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
      {etichetta} — {testo}
    </div>
  );
}
