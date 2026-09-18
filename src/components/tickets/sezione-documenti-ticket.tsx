"use client";

import type { ComponentProps } from "react";
import { FileText, FileSignature, Repeat, CalendarClock, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SuggerimentoCampo } from "@/components/ui/suggerimento-campo";
import { IconaCategoria } from "@/components/condivisi/icona-categoria";
import { InvioLinkCliente } from "@/components/condivisi/invio-link";
import { PulsanteDocumento } from "@/components/condivisi/pulsante-documento";
import { SchedaVista } from "@/components/schede/scheda-vista";
import { RapportinoVista } from "@/components/tickets/rapportino";
import { SubentroDoppioConsenso } from "@/components/tickets/sezione-subentro";
import { urlDocumentoRichiesta } from "@/app/(app)/richieste-clienti/actions";
import { etichettaDettaglio } from "@/lib/etichette-dettagli";
import type { RapportinoIntervento, RichiestaCliente, SchedaLavoro, Ticket } from "@/lib/types";

/** ★ stesso identico prop bag di SubentroDoppioConsenso: DettaglioTicket lo
 * costruisce una volta sola e lo passa giù invariato — evita di ridichiarare
 * qui gli stessi ~25 campi solo per rigirarli verso il figlio. */
type PropsSubentro = ComponentProps<typeof SubentroDoppioConsenso>;

/**
 * ★ ESTRATTA (2026-09-18, split del monolite DettaglioTicket — ~1175
 * righe in tickets-board.tsx) — nessuna modifica di logica: componente
 * puramente presentazionale, stato/handler restano in DettaglioTicket e
 * arrivano qui come props, stesso pattern di SubentroDoppioConsenso.
 * Copre: Documenti (contratto/scheda-rapportino/moduli ricevuti), Subentro,
 * Dismissione/Disdetta, "Invia una pratica al cliente", "Intervento
 * risolto da remoto".
 *
 * ★ NUOVA — richiesta esplicita: contratto, scheda/rapportino completati e
 * moduli inviati dal cliente (Cambio IBAN/Anagrafica/Trasferimento/
 * Subentro) erano sparsi in punti diversi dello scroll (o del tutto
 * assenti, per i moduli) — ora tutti insieme qui, un solo posto per
 * "tutta la carta" del Ticket.
 */
export function SezioneDocumentiTicket({
  ticket,
  numeroDocumenti,
  scheda,
  rapportino,
  isAdmin,
  onVediContratto,
  richieste,
  praticaSubentro,
  subentro,
  dataDismissione,
  setDataDismissione,
  fissaDismissione,
  inCorsoDismissione,
  erroreDismissione,
  praticheInviabili,
  praticaPerSottocategoria,
  praticaScelta,
  setPraticaScelta,
  linkPratica,
  messaggioPratica,
  onInviaEmailPratica,
  inCorsoApprovazione,
  inviaApprovazione,
}: {
  ticket: Ticket;
  numeroDocumenti: number;
  scheda: SchedaLavoro | null;
  rapportino: RapportinoIntervento | null;
  isAdmin: boolean;
  onVediContratto: () => void;
  richieste: RichiestaCliente[];
  praticaSubentro: RichiestaCliente | undefined;
  subentro: PropsSubentro;
  dataDismissione: string;
  setDataDismissione: (v: string) => void;
  fissaDismissione: () => void;
  inCorsoDismissione: boolean;
  erroreDismissione: string;
  praticheInviabili: { slug: string; titolo: string }[];
  praticaPerSottocategoria: Record<string, string>;
  praticaScelta: string;
  setPraticaScelta: (v: string) => void;
  linkPratica: string;
  messaggioPratica: string;
  onInviaEmailPratica: () => Promise<{ errore: string | null }>;
  inCorsoApprovazione: boolean;
  inviaApprovazione: () => void;
}) {
  const richiesteNonSubentro = richieste.filter((r) => r.tipo_richiesta !== "Subentro");

  return (
    <div className="flex flex-col gap-4">
      {/* ★ FIX (2026-09-18, richiesta esplicita dopo uno screenshot:
      "verifica gli spazi e tutto, finiscono alcune scritte sotto.
      rendi il tutto più ordinato ed omogeneo") — questa intestazione
      non aveva alcuna condizione, a differenza di ogni sotto-sezione
      che le sta sotto (Contratto/Moduli ricevuti/Scheda-rapportino
      hanno tutte il proprio `{condizione && (...)}`): su un Ticket
      senza nessun documento vero (es. Assistenza appena aperta, come
      nello screenshot) restava comunque scritta da sola, seguita
      subito da sezioni che non sono documenti (Dismissione, Invia
      pratica, Intervento risolto da remoto) — sembrava un'etichetta
      rotta invece che una sezione vuota nascosta come tutte le altre.
      `numeroDocumenti` esisteva già solo per il numero tra parentesi:
      ora decide anche se l'intestazione compare. */}
      {numeroDocumenti > 0 && (
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Documenti ({numeroDocumenti})
        </div>
      )}
      {ticket.stato === "Completato" && scheda && <SchedaVista scheda={scheda} modificabile={isAdmin} />}
      {ticket.stato === "Completato" && !scheda && rapportino && (
        <RapportinoVista rapportino={rapportino} importoFatturato={ticket.importo_fatturato} />
      )}

      {/* ★ FIX (2026-09-10, "correggi tutto" — punto 3 dell'artifact
      "Ordine Definitivo per i Ticket") — su un Ticket nato da una
      Segnalazione con contratto già firmato, questo pulsante compariva
      da solo in cima alla tab, senza un'intestazione — l'unico blocco
      così in tutta l'interfaccia (ogni altra sezione qui sotto ne ha
      una, icona colorata + etichetta). Aggiunta per coerenza. */}
      {ticket.contratto_pdf_url && (
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <IconaCategoria icona={FileText} categoria="documento" dimensione="sm" />
            Contratto
          </div>
          <Button size="sm" variant="outline" className="w-fit" onClick={onVediContratto}>
            <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
            Vedi contratto
          </Button>
        </div>
      )}

      {/* ★ FIX (2026-09-09, "problema cliccando documenti" — pagina che
      va in crash) — bug reale trovato sul Ticket #89: la pratica di
      Subentro ha già la sua sezione dedicata più sotto
      (SubentroDoppioConsenso), ma finiva ANCHE qui dentro, dove
      `Object.entries(r.dettagli)` prova a scrivere ogni valore come
      testo. La bozza di contatto salvata onBlur (vedi
      CHIAVE_BOZZA_CONTATTO_SUBENTRO) è un OGGETTO `{telefono, email}`,
      non una stringa — React va in crash ("Objects are not valid as a
      React child") appena quella bozza esiste, cioè non appena lo
      staff scrive un contatto prima che il nuovo cliente risponda.
      Escludere qui il tipo "Subentro" risolve il crash alla radice ed
      elimina anche il doppione (stessa pratica mostrata due volte). */}
      {richiesteNonSubentro.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <IconaCategoria icona={FileSignature} categoria="documento" dimensione="sm" />
            Moduli ricevuti dal cliente
          </div>
          <div className="flex flex-col gap-2">
            {richiesteNonSubentro.map((r) => (
              <div key={r.id} className="rounded-xl border bg-card p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">{r.tipo_richiesta}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(r.data).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {Object.entries(r.dettagli || {}).map(([chiave, valore]) =>
                    /* ★ FIX — stesso principio di sicurezza: se un valore
                    non è testo/numero (non dovrebbe succedere per gli
                    altri tipi di pratica, ma "mai rompere il rendering"
                    per un dato imprevisto), non provarlo a scrivere. */
                    valore && (typeof valore === "string" || typeof valore === "number") ? (
                      <div key={chiave} className="text-xs">
                        <span className="text-muted-foreground">{etichettaDettaglio(chiave)}: </span>
                        <span className="font-medium break-words">{valore}</span>
                      </div>
                    ) : null
                  )}
                </div>
                {r.documenti?.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    {r.documenti.map((doc, i) => (
                      <PulsanteDocumento
                        key={i}
                        percorso={doc.percorso}
                        nome={doc.nome}
                        etichetta={doc.tipo ? `${doc.tipo} — ${doc.nome}` : doc.nome}
                        onOttieniUrl={urlDocumentoRichiesta}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ★ NUOVA (2026-09, "è un macello, va riorganizzata e
      semplificata" — vedi l'artifact "Il Processo del Subentro") —
      sezione propria, sempre visibile, non più una voce da scegliere
      in un menu a tendina generico: lo stesso pulsante "Avvia
      Subentro" di NuovaPraticaClienteEsterno (scheda Cliente Esterno),
      qui applicato al Ticket già aperto invece di doverne creare uno
      nuovo.

      ★ FIX (2026-09-10, "perchè figura il subentro per un cliente che
      deve essere installato... le schermate sono tutte uguali e non
      sono specifiche per il tipo di intervento" — screenshot reale di
      un Ticket Assistenza/Pianificazione installazione con la sezione
      Subentro comunque visibile): questa sezione non aveva NESSUNA
      condizione — compariva identica su ogni Ticket, installazioni
      comprese, dove un subentro (trasferimento di un contratto
      esistente a un nuovo titolare) non ha senso: il cliente non ha
      ancora un contratto da trasferire. Subentro è una pratica
      Commerciale/Amministrativa, mai un'Assistenza.
      ★ FIX (2026-09-18, richiesta esplicita — screenshot reale di un
      Ticket di Disdetta con la sezione Subentro comunque visibile:
      "pratica di subentro non deve essere sempre attivo ma solo quando
      aperta una pratica di subentro da scheda cliente") — restava
      comunque sempre visibile su OGNI Ticket Commerciale/Amministrativa
      (Disdetta compresa, come in questo caso), con un pulsante "Avvia
      pratica di Subentro" pronto a crearne una nuova anche dove non
      c'entra nulla. L'unico punto d'ingresso per avviare un Subentro
      resta la scheda del Cliente Esterno (avviaPraticaSubentro() in
      clienti-esterni/actions.ts) — qui la sezione compare solo per
      gestire/proseguire una pratica GIÀ avviata da lì (`praticaSubentro`
      già trovata sopra), mai per proporne una nuova. */}
      {ticket.categoria !== "Assistenza" && praticaSubentro && (
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <IconaCategoria icona={Repeat} categoria="documento" dimensione="sm" />
            Subentro
          </div>
          <SubentroDoppioConsenso {...subentro} />
        </div>
      )}

      {/* ★ NUOVA (2026-09-10, richiesta esplicita: "problemi con i ticket
      di disdetta... fatturazione... deve dare i tempi per la
      dismissione e una volta fatto deve essere inoltrato al reparto
      analisi di rete... per il ritiro degli apparati") — un solo
      passaggio, non due da ricordarsi separatamente: vedi
      fissaDataDismissioneDisdetta() e fissaDismissione() più sopra. */}
      {ticket.sottocategoria === "Disdetta" && (
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <IconaCategoria icona={CalendarClock} categoria="tempo" dimensione="sm" />
            Dismissione — ritiro apparati
          </div>
          {ticket.data_dismissione_disdetta ? (
            <p className="rounded-lg border bg-muted/30 p-3 text-sm">
              Dismissione fissata per il <b>{new Date(ticket.data_dismissione_disdetta).toLocaleDateString("it-IT")}</b>
              {ticket.reparto === "Analisi Rete" ? " — passato ad Analisi Rete per il ritiro apparati." : "."}
            </p>
          ) : ticket.reparto === "Fatturazione" ? (
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                Fissa la data di dismissione concordata col cliente — il Ticket passerà da solo ad Analisi Rete per
                pianificare il ritiro degli apparati.
              </p>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={dataDismissione}
                  onChange={(e) => setDataDismissione(e.target.value)}
                  className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
                />
                <Button size="sm" onClick={fissaDismissione} disabled={inCorsoDismissione} className="min-h-9 shrink-0">
                  {inCorsoDismissione ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <CalendarClock className="h-3.5 w-3.5" strokeWidth={2.25} />}
                  {inCorsoDismissione ? "Salvataggio…" : "Fissa e passa ad Analisi Rete"}
                </Button>
              </div>
              {erroreDismissione && <p className="text-xs text-critical">{erroreDismissione}</p>}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">In attesa che Fatturazione fissi la data di dismissione.</p>
          )}
        </div>
      )}

      {/* ★ NASCOSTA per i Ticket di Subentro (2026-09-10, "non deve
      comparire invia una pratica al cliente è ancora un refuso del
      passato" — screenshot del popup reale) — da quando Subentro ha la
      sua sezione dedicata sopra (con il proprio flusso completo,
      contratto incluso), PRATICHE_INVIABILI/PRATICA_PER_SOTTOCATEGORIA
      non contengono più "subentro": per un Ticket di Subentro questo
      menu offriva solo "Disdetta contratto", un'opzione senza senso su
      una pratica che sta ancora avviando il trasferimento, avanzo
      visibile di quando Subentro passava di qui. */}
      {/* ★ FIX (2026-09-10, "correggi tutto" — punto 2 dell'artifact
      "Ordine Definitivo per i Ticket") — questo menu era pensato per
      scegliere fra più pratiche; da quando Trasferimento/Cambio IBAN/
      Cambio Anagrafica/Subentro sono usciti da qui (ognuno ha il
      proprio posto), PRATICHE_INVIABILI contiene solo "Disdetta
      contratto" — un menu a tendina più un secondo passaggio per
      un'unica scelta. Con una sola pratica disponibile un pulsante
      diretto basta, stesso pattern di "Avvia Subentro"; il menu
      ricompare da solo se in futuro le pratiche selezionabili
      tornassero più di una. */}
      {/* ★ FIX (2026-09-10, stessa richiesta della sezione Subentro sopra):
      Disdetta contratto è una pratica Amministrativa — non ha senso su un
      Ticket di Assistenza (es. Pianificazione installazione), dove il
      cliente non ha nulla da disdire. */}
      {ticket.categoria !== "Assistenza" && ticket.sottocategoria !== "Subentro" && (
        <div>
          <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            <IconaCategoria icona={FileSignature} categoria="documento" dimensione="sm" />
            Invia una pratica al cliente
          </div>
          {praticheInviabili.length > 1 ? (
            <>
              <p className="mb-2 text-[11px] text-muted-foreground">
                Manda al cliente un link a un modulo pubblico da compilare (es. cambio IBAN, trasloco) — i dati inviati compaiono poi qui, nella tab Documenti.
              </p>
              <select
                value={praticaScelta}
                onChange={(e) => setPraticaScelta(e.target.value)}
                className="h-9 w-full rounded-lg border bg-background px-3 text-xs"
              >
                <option value="">Scegli una pratica...</option>
                {praticheInviabili.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.titolo}
                    {praticaPerSottocategoria[ticket.sottocategoria ?? ""] === p.slug ? " (consigliata)" : ""}
                  </option>
                ))}
              </select>
              {praticaScelta && (
                <div className="mt-2.5">
                  <InvioLinkCliente url={linkPratica} telefono={ticket.telefono} email={ticket.email} messaggio={messaggioPratica} onInviaEmail={onInviaEmailPratica} />
                </div>
              )}
            </>
          ) : !praticaScelta ? (
            // ★ FIX (2026-09-17, "i pulsanti li farei più colorati") —
            // stessa azione vera di "Invia email di approvazione" qui sopra,
            // stesso trattamento.
            <Button variant="default" onClick={() => setPraticaScelta(praticheInviabili[0].slug)} className="min-h-9 w-full">
              <Send className="h-3.5 w-3.5" strokeWidth={2.25} />
              Invia richiesta di disdetta
            </Button>
          ) : (
            <InvioLinkCliente url={linkPratica} telefono={ticket.telefono} email={ticket.email} messaggio={messaggioPratica} onInviaEmail={onInviaEmailPratica} />
          )}
        </div>
      )}

      {ticket.email && (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Intervento risolto da remoto?
            <SuggerimentoCampo testo="Manda al cliente un link email monouso: un suo click conferma che l'intervento è stato risolto, senza dover fissare un appuntamento in loco." />
          </p>
          {/* ★ FIX (2026-09-17, richiesta esplicita dopo uno screenshot:
          "i pulsanti li farei più colorati") — era `variant="outline"`
          come un pulsante qualunque, indistinguibile da un'azione
          secondaria: è invece un'azione vera (manda al cliente il link di
          conferma), merita lo stesso risalto del colore primario già
          usato per "Pianifica appuntamento" quando è l'azione principale. */}
          <Button variant="default" disabled={inCorsoApprovazione} onClick={inviaApprovazione} className="min-h-11">
            {inCorsoApprovazione && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />}
            {inCorsoApprovazione ? "Invio in corso…" : "Invia email di approvazione"}
          </Button>
        </div>
      )}
    </div>
  );
}
