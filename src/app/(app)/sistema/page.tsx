import { redirect } from "next/navigation";
import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle, Mail, Send, CalendarDays, MailboxIcon } from "lucide-react";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPersonaCorrente, personaHaAccessoAdmin } from "@/lib/persona";
import { checklistEnv } from "@/lib/env-check";
import { PuliziaMedia } from "@/components/sistema/pulizia-media";
import type { AreaAccesso } from "@/lib/types";

// ★ "Pulizia media" (elencaFileMedia) scansiona ricorsivamente l'intero
// bucket storage e incrocia 6 tabelle diverse — può richiedere più dei 10s
// di default di una funzione serverless su uno storage con molti file.
export const maxDuration = 30;

const ICONE_SERVIZIO: Record<string, typeof Mail> = {
  email: Mail,
  telegram: Send,
  google_calendar: CalendarDays,
};
const NOMI_SERVIZIO: Record<string, string> = {
  email: "Email (SMTP)",
  telegram: "Telegram",
  google_calendar: "Google Calendar",
};

function formattaData(iso: string | null) {
  if (!iso) return "Mai";
  return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function oreFa(iso: string | null) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

// ★ NUOVA — pagina di stato riservata admin, nata da un incidente reale:
// CRON_SECRET era finito nel campo "Note" invece che "Value" su Vercel, e
// per giorni nessuna parte del gestionale l'ha fatto notare. Qui in un
// colpo d'occhio: quali variabili d'ambiente critiche mancano/hanno un
// formato sospetto, e quando ciascuna integrazione esterna (email/
// Telegram/Google Calendar/controllo email in arrivo) ha inviato/
// controllato l'ultima volta con successo — così un problema di
// configurazione si nota qui, non da un cliente che dice "non ho ricevuto
// niente".
export default async function SistemaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const persona = await getPersonaCorrente(supabase);
  if (!personaHaAccessoAdmin(persona)) redirect("/?errore=non-autorizzato");

  const service = createServiceClient();

  const { data: logRighe } = await service
    .from("integrazioni_log")
    .select("servizio, esito, dettaglio, creato_il")
    .order("creato_il", { ascending: false })
    .limit(300);

  const servizi = ["email", "telegram", "google_calendar"] as const;
  const statoServizi = servizi.map((s) => {
    const righe = (logRighe ?? []).filter((r) => r.servizio === s);
    const ultimoOk = righe.find((r) => r.esito === "ok");
    const ultimoErrore = righe.find((r) => r.esito === "errore");
    // ★ "in allarme" solo se l'ultimo tentativo in assoluto è un errore
    // (non se è solo capitato un errore isolato ore fa seguito da invii
    // riusciti) — evita falsi allarmi per un singolo destinatario con
    // email inesistente.
    const ultimoTentativo = righe[0] ?? null;
    return {
      servizio: s,
      ultimoOk: ultimoOk?.creato_il ?? null,
      ultimoErrore: ultimoErrore ? { quando: ultimoErrore.creato_il, dettaglio: ultimoErrore.dettaglio } : null,
      inAllarme: ultimoTentativo?.esito === "errore",
      totaleErroriRecenti: righe.filter((r) => r.esito === "errore" && oreFa(r.creato_il) < 24).length,
    };
  });

  const { data: caselleImap } = await service
    .from("imap_controllo_email")
    .select("reparto, ultimo_controllo_il")
    .order("reparto", { ascending: true });

  const gruppiEnv = checklistEnv();
  const totaleMancanti = gruppiEnv.flatMap((g) => g.voci).filter((v) => !v.presente).length;
  const totaleFormatoSospetto = gruppiEnv.flatMap((g) => g.voci).filter((v) => v.presente && v.formatoValido === false).length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-md shadow-primary/30">
          <ShieldCheck className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Stato Sistema</h1>
          <p className="text-sm text-muted-foreground">Configurazione e integrazioni esterne — solo amministratori.</p>
        </div>
      </div>

      <section className="mb-6 rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Variabili d&apos;ambiente</h2>
        {totaleMancanti === 0 && totaleFormatoSospetto === 0 && (
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
            Tutte presenti, nessun formato sospetto.
          </p>
        )}
        <div className="flex flex-col gap-3">
          {gruppiEnv.map((gruppo) => (
            <div key={gruppo.gruppo}>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{gruppo.gruppo}</p>
              <div className="flex flex-col gap-1">
                {gruppo.voci.map((v) => (
                  <div key={v.chiave} className="flex items-start gap-2 text-xs">
                    {!v.presente ? (
                      <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-critical" strokeWidth={2.25} />
                    ) : v.formatoValido === false ? (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" strokeWidth={2.25} />
                    ) : (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2.25} />
                    )}
                    <div>
                      <span className="font-mono font-semibold">{v.chiave}</span>
                      {!v.presente && <span className="ml-1.5 text-critical">mancante</span>}
                      {v.presente && v.formatoValido === false && (
                        <span className="ml-1.5 text-warning">presente ma formato inatteso — controllare il valore</span>
                      )}
                      {v.nota && <p className="text-[11px] text-muted-foreground">{v.nota}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Integrazioni in uscita</h2>
        <div className="flex flex-col gap-3">
          {statoServizi.map((s) => {
            const Icona = ICONE_SERVIZIO[s.servizio];
            return (
              <div key={s.servizio} className="flex items-start gap-3 rounded-lg border p-2.5">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${s.inAllarme ? "bg-critical/10 text-critical" : "bg-success/10 text-success"}`}>
                  <Icona className="h-4 w-4" strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{NOMI_SERVIZIO[s.servizio]}</span>
                    {s.inAllarme && (
                      <span className="rounded-full bg-critical/10 px-2 py-0.5 text-[10px] font-bold text-critical">Ultimo tentativo fallito</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Ultimo invio riuscito: {formattaData(s.ultimoOk)}</p>
                  {s.totaleErroriRecenti > 0 && (
                    <p className="text-xs text-warning">{s.totaleErroriRecenti} errore/i nelle ultime 24 ore.</p>
                  )}
                  {s.ultimoErrore && (
                    <p className="mt-1 break-words rounded bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
                      Ultimo errore ({formattaData(s.ultimoErrore.quando)}): {s.ultimoErrore.dettaglio || "—"}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="mb-6">
        <PuliziaMedia />
      </div>

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Controllo email in arrivo (IMAP)</h2>
        {!caselleImap || caselleImap.length === 0 ? (
          <p className="flex items-start gap-1.5 text-xs text-warning">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
            Nessun controllo ancora registrato — il cron esterno (cron-job.org) non ha ancora eseguito la prima chiamata, o non è configurato.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {(caselleImap as { reparto: AreaAccesso; ultimo_controllo_il: string | null }[]).map((c) => {
              const allarme = oreFa(c.ultimo_controllo_il) > 1;
              return (
                <div key={c.reparto} className="flex items-center gap-2 text-xs">
                  <MailboxIcon className={`h-3.5 w-3.5 shrink-0 ${allarme ? "text-warning" : "text-success"}`} strokeWidth={2.25} />
                  <span className="font-semibold">{c.reparto}</span>
                  <span className="text-muted-foreground">— ultimo controllo: {formattaData(c.ultimo_controllo_il)}</span>
                  {allarme && <span className="text-warning">(più di un&apos;ora fa — verificare il cron esterno)</span>}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
