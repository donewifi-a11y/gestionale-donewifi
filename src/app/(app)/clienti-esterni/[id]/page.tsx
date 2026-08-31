import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, Mail, MapPin, FileText, History, Ticket as TicketIcon, Euro, Plus, FileCheck2, FileSignature } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getStoricoProfiloCliente, getFattureCliente, getTicketCollegati, getPreventiviCollegati, getInstallazioniCliente, getPraticheClienteEsterno, getContrattiPrecedenti } from "../actions";
import { InstallazioniCliente } from "@/components/clienti-esterni/installazioni-cliente";
import { NuovaPraticaClienteEsterno } from "@/components/clienti-esterni/nuova-pratica";
import { formattaValuta } from "@/lib/types";
import type { ClienteEsterno } from "@/lib/types";

function nomeVisualizzato(c: ClienteEsterno): string {
  return c.ragionesociale || [c.cognome, c.nome].filter(Boolean).join(" ") || "—";
}

export default async function SchedaClienteEsternoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idNumero = Number(id);
  if (!Number.isFinite(idNumero)) notFound();

  const supabase = await createClient();
  const { data: cliente } = await supabase.from("clienti_esterni").select("*").eq("id", idNumero).maybeSingle();
  if (!cliente) notFound();

  const c = cliente as ClienteEsterno;

  const [storico, fatture, ticketCollegati, preventiviCollegati, installazioni, pratiche, contrattiPrecedenti] = await Promise.all([
    getStoricoProfiloCliente(c.id),
    getFattureCliente(c.codice_fiscale, c.partita_iva),
    getTicketCollegati(c.telefono),
    getPreventiviCollegati(c.id, c.telefono),
    getInstallazioniCliente(c.telefono),
    getPraticheClienteEsterno(c.id),
    getContrattiPrecedenti(c),
  ]);

  const fatturatoTotale = fatture.reduce((s, f) => s + (Number(f.importo) || 0), 0);
  const insoluti = fatture.filter((f) => !f.pagata);
  const insolutoTotale = insoluti.reduce((s, f) => s + (Number(f.importo) || 0), 0);

  const indirizzoCompleto = [c.indirizzo, c.numero_civico].filter(Boolean).join(" ") + (c.comune ? `, ${c.comune}` : "");
  const parametriNuovoTicket = new URLSearchParams({
    cliente: nomeVisualizzato(c),
    ...(c.telefono ? { telefono: c.telefono } : {}),
    ...(c.email ? { email: c.email } : {}),
    ...(indirizzoCompleto.trim() ? { indirizzo: indirizzoCompleto } : {}),
  });

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/clienti-esterni" className="mb-4 flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
        Anagrafica Clienti
      </Link>

      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground">
            {nomeVisualizzato(c).slice(0, 2).toUpperCase()}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-2xl font-bold tracking-tight">{nomeVisualizzato(c)}</h1>
              {c.attivo ? (
                <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Attivo</span>
              ) : (
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Non attivo</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Dati importati dall&apos;anagrafica Aruba — aggiornati il {new Date(c.aggiornato_il).toLocaleString("it-IT")}.</p>
          </div>
        </div>
        <Link
          href={`/tickets/nuovo?${parametriNuovoTicket.toString()}`}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          Nuovo Ticket
        </Link>
      </div>

      {/* ★ RIORGANIZZAZIONE (2026-08-31, proposta "Barra laterale" scelta
      dall'utente su 3 — vedi artifact "Scheda Cliente: Proposte") — la
      scheda era un'unica colonna lunga con "Avvia una nuova pratica"
      sepolto quasi in fondo ("le pratiche sotto da aprire non sono
      comode"). Ora è una barra laterale fissa (identità cliente + azioni
      rapide, sempre visibile scorrendo) accanto a una colonna principale
      col resto dei contenuti — stesso principio dei pannelli contatto di
      un CRM: l'azione da compiere resta a portata di click ovunque ci si
      trovi nella pagina. */}
      <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[300px_1fr]">
        <aside className="flex flex-col gap-5 md:sticky md:top-5">
          <div className="rounded-2xl border bg-card p-5 shadow-md">
            <h2 className="mb-3 font-heading text-sm font-bold">Dati anagrafici</h2>
            <div className="flex flex-col gap-2 text-sm">
              {c.telefono && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.25} />
                  <a href={`tel:${c.telefono}`} className="text-primary hover:underline">{c.telefono}</a>
                </div>
              )}
              {c.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.25} />
                  <a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a>
                </div>
              )}
              {(c.indirizzo || c.comune) && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.25} />
                  <span>{[c.indirizzo, c.numero_civico].filter(Boolean).join(" ")}{c.cap && `, ${c.cap}`} {c.comune} {c.provincia && `(${c.provincia})`}</span>
                </div>
              )}
              <p className="mt-1 border-t pt-2 text-sm"><span className="text-muted-foreground">Profilo attuale: </span><span className="font-semibold">{c.profilo_internet || "—"}</span></p>
              <div className="grid grid-cols-2 gap-2 border-t pt-2 text-xs text-muted-foreground">
                <div><span className="font-semibold text-foreground">CF: </span>{c.codice_fiscale || "—"}</div>
                <div><span className="font-semibold text-foreground">P.IVA: </span>{c.partita_iva || "—"}</div>
                <div><span className="font-semibold text-foreground">Codice gestionale: </span>{c.codice_gestionale || "—"}</div>
                <div><span className="font-semibold text-foreground">Contratto: </span>{c.id_contratto || "—"}</div>
              </div>
            </div>
          </div>

          <NuovaPraticaClienteEsterno
            clienteId={c.id}
            telefono={c.telefono}
            email={c.email}
            nome={nomeVisualizzato(c)}
          />
        </aside>

        <div className="flex flex-col gap-5">
          <div className="rounded-2xl border bg-card p-5 shadow-md">
            <h2 className="mb-3 flex items-center gap-1.5 font-heading text-sm font-bold">
              <History className="h-3.5 w-3.5" strokeWidth={2.25} />
              Storico cambi profilo
            </h2>
            {storico.length === 0 && (
              <p className="text-xs text-muted-foreground">Nessun cambio rilevato ancora (lo storico parte da quando è nata questa pagina).</p>
            )}
            <div className="flex flex-col gap-1 text-xs">
              {storico.map((s) => (
                <div key={s.id} className="border-t py-1 first:border-t-0">
                  <span className="text-muted-foreground">{new Date(s.rilevato_il).toLocaleDateString("it-IT")}: </span>
                  {s.profilo_precedente || "—"} → {s.profilo_nuovo || "—"}
                </div>
              ))}
            </div>

            {/* ★ NUOVA (2026-08) — controparte di dedupClientiPerContratto(): un
            rinnovo Aruba dello stesso codice_gestionale crea una riga nuova
            invece di aggiornare quella esistente. Le liste mostrano solo
            l'ultima riga (questa), le altre restano visibili qui come storico
            invece di sparire o comparire come clienti a sé. */}
            {contrattiPrecedenti.length > 0 && (
              <>
                <div className="mt-3 flex items-center gap-1.5 border-t pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <History className="h-3 w-3" strokeWidth={2.25} />
                  Contratti precedenti (rinnovi/ricodifiche di questa installazione)
                </div>
                <div className="mt-1 flex flex-col gap-1 text-xs">
                  {contrattiPrecedenti.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 border-t py-1 first:border-t-0">
                      <span>
                        <span className="font-mono text-muted-foreground">{p.id_contratto || "—"}</span> — {p.profilo_internet || "—"}
                      </span>
                      <span className="shrink-0 text-muted-foreground">{new Date(p.aggiornato_il).toLocaleDateString("it-IT")}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-md">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 font-heading text-sm font-bold">
                <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
                Fatture ({fatture.length})
              </h2>
              <div className="flex gap-4 text-xs">
                <span className="flex items-center gap-1"><Euro className="h-3 w-3" strokeWidth={2.5} /><span className="text-muted-foreground">Totale: </span><span className="font-semibold tabular-nums">{formattaValuta(fatturatoTotale)}</span></span>
                {insoluti.length > 0 && (
                  <span className="text-critical"><span className="font-semibold">{insoluti.length}</span> insolute · <span className="tabular-nums">{formattaValuta(insolutoTotale)}</span></span>
                )}
              </div>
            </div>
            {fatture.length === 0 && <p className="text-sm text-muted-foreground">Nessuna fattura importata per questo cliente.</p>}
            {fatture.length > 0 && (
              <div className="max-h-72 overflow-x-auto overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="pb-2 font-semibold">Numero</th>
                      <th className="pb-2 font-semibold">Emissione</th>
                      <th className="pb-2 font-semibold">Scadenza</th>
                      <th className="pb-2 text-right font-semibold">Importo</th>
                      <th className="pb-2 text-right font-semibold">Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fatture.map((f) => (
                      <tr key={f.id} className="border-b last:border-0">
                        <td className="py-1.5 font-mono text-xs">{f.numero}</td>
                        <td className="py-1.5">{f.emissione ? new Date(f.emissione).toLocaleDateString("it-IT") : "—"}</td>
                        <td className="py-1.5">{f.scadenza ? new Date(f.scadenza).toLocaleDateString("it-IT") : "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{formattaValuta(f.importo)}</td>
                        <td className="py-1.5 text-right">
                          {f.pagata ? (
                            <span className="rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">Pagata</span>
                          ) : (
                            <span className="rounded-full bg-critical/10 px-2 py-0.5 text-[11px] font-semibold text-critical">Insoluta</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-md">
            <h2 className="mb-3 flex items-center gap-1.5 font-heading text-sm font-bold">
              <FileText className="h-3.5 w-3.5" strokeWidth={2.25} />
              Preventivi collegati
            </h2>
            {preventiviCollegati.length === 0 && (
              <p className="text-sm text-muted-foreground">Nessun preventivo trovato per questo cliente.</p>
            )}
            <div className="flex flex-col gap-1.5">
              {preventiviCollegati.map((p) => (
                <Link
                  key={p.id}
                  href={`/preventivi?aperto=${p.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition hover:bg-muted/60"
                >
                  <span>
                    <span className="font-mono text-xs text-muted-foreground">#{p.numero}</span> — {formattaValuta(p.totale)}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {p.stato} · {new Date(p.creato_il).toLocaleDateString("it-IT")}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-md">
            <h2 className="mb-3 flex items-center gap-1.5 font-heading text-sm font-bold">
              <FileCheck2 className="h-3.5 w-3.5" strokeWidth={2.25} />
              Installazioni effettuate ({installazioni.length})
            </h2>
            <InstallazioniCliente installazioni={installazioni} />
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-md">
            <h2 className="mb-3 flex items-center gap-1.5 font-heading text-sm font-bold">
              <FileSignature className="h-3.5 w-3.5" strokeWidth={2.25} />
              Documenti e pratiche inviate ({pratiche.length})
            </h2>
            {pratiche.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna pratica inviata finora per questo cliente.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {pratiche.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-2 text-sm">
                    <span className="font-semibold">{p.tipo_richiesta}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {p.stato} · {new Date(p.data).toLocaleDateString("it-IT")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-md">
            <h2 className="mb-3 flex items-center gap-1.5 font-heading text-sm font-bold">
              <TicketIcon className="h-3.5 w-3.5" strokeWidth={2.25} />
              Ticket collegati nel gestionale
            </h2>
            {ticketCollegati.length === 0 && (
              <p className="text-sm text-muted-foreground">Nessun ticket trovato con questo numero di telefono.</p>
            )}
            <div className="flex flex-col gap-1.5">
              {ticketCollegati.map((t) => (
                <Link
                  key={t.id}
                  href={`/tickets?aperto=${t.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition hover:bg-muted/60"
                >
                  <span><span className="font-mono text-xs text-muted-foreground">#{t.numero}</span> — {t.categoria}</span>
                  <span className="text-xs text-muted-foreground">{t.stato} · {new Date(t.data_creazione).toLocaleDateString("it-IT")}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
