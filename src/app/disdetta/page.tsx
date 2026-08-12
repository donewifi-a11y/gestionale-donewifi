import { Mail, Send, ListChecks, AlertTriangle } from "lucide-react";
import { CopiaBottone } from "@/components/condivisi/copia-bottone";

export const metadata = { title: "Come disdire il contratto - Done Wifi" };

export default async function DisdettaPage({ searchParams }: { searchParams: Promise<{ ticket?: string }> }) {
  const { ticket } = await searchParams;

  const testoTemplate = `Oggetto: Richiesta di disdetta contratto${ticket ? ` — Pratica ${ticket}` : ""}

Il/La sottoscritto/a [Nome e Cognome / Ragione Sociale], Codice Fiscale [___________],
titolare del contratto n. [codice cliente/contratto], relativo alla fornitura del
servizio internet presso l'indirizzo [indirizzo di installazione],

CHIEDE

la disdetta del contratto in essere con Done Wifi, con decorrenza dalla data di
ricezione della presente comunicazione.

Recapito per eventuali comunicazioni: [telefono / email]

Si allega copia di documento d'identità in corso di validità.

Data: __________          Firma: __________`;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="border-b bg-card py-4 text-center shadow-sm">
        <img src="/brand/logo-completo.png" alt="Done Wifi" className="mx-auto h-12 w-12" />
      </div>

      <div className="mx-auto max-w-xl px-5 py-10">
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] p-1.5 shadow-md shadow-primary/30">
            <img src="/brand/logo-marchio.png" alt="" className="h-full w-full object-contain" />
          </div>
          <h1 className="mt-3 font-heading text-xl font-bold tracking-tight">Come disdire il tuo contratto</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            Per rendere effettiva la disdetta del tuo contratto Done Wifi, invia la tua richiesta con una delle
            due modalità ufficiali qui sotto.
          </p>

          {ticket && (
            <span className="mb-5 inline-flex w-fit items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 font-mono text-xs font-bold text-accent-foreground">
              🎫 Pratica {ticket}
            </span>
          )}

          <div className="mb-4 rounded-xl border p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold">
              <Mail className="h-4 w-4 text-primary" strokeWidth={2.25} />
              Raccomandata A/R
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              Invia una lettera raccomandata con ricevuta di ritorno all&apos;indirizzo:
            </p>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2.5 text-xs font-semibold">
              <span>Studio Armonia Srl, Via Tourneuve 6, 11100 Aosta (AO)</span>
              <CopiaBottone testo="Studio Armonia Srl, Via Tourneuve 6, 11100 Aosta (AO)" />
            </div>
          </div>

          <div className="mb-5 flex items-center gap-3 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> oppure <span className="h-px flex-1 bg-border" />
          </div>

          <div className="mb-6 rounded-xl border p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold">
              <Send className="h-4 w-4 text-primary" strokeWidth={2.25} />
              PEC (Posta Elettronica Certificata)
            </div>
            <p className="mb-2 text-xs text-muted-foreground">Se disponi di una casella PEC, invia la disdetta a:</p>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2.5 text-xs font-semibold">
              <span>studioarmonia@pec.it</span>
              <CopiaBottone testo="studioarmonia@pec.it" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Indica nell&apos;oggetto &ldquo;Disdetta contratto{ticket ? ` — pratica ${ticket}` : ""}&rdquo;.
            </p>
          </div>

          <div className="mb-6 rounded-xl border border-primary/30 bg-accent-soft p-4">
            <div className="mb-1 flex items-center gap-2 text-sm font-bold">
              <ListChecks className="h-4 w-4 text-primary" strokeWidth={2.25} />
              Cosa deve contenere la comunicazione
            </div>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-4 text-xs leading-relaxed">
              <li><b>Dati del titolare del contratto</b> — nome e cognome (o ragione sociale e P.IVA se azienda)</li>
              <li><b>Codice cliente e/o numero contratto</b> — si trovano in alto su ogni fattura</li>
              <li><b>Indirizzo di installazione del servizio</b></li>
              <li><b>Codice Fiscale del titolare</b></li>
              <li><b>Un recapito telefonico o email</b> per essere ricontattati in caso di verifiche</li>
              <li><b>Data e firma</b> del titolare del contratto</li>
              <li><b>Copia di un documento d&apos;identità</b> in corso di validità (fronte e retro)</li>
            </ol>
          </div>

          <div className="mb-6 rounded-xl border p-4">
            <div className="mb-2 text-sm font-bold">✏️ Fac-simile testo da usare</div>
            <pre className="whitespace-pre-wrap rounded-lg bg-muted/60 p-3 font-mono text-[11.5px] leading-relaxed">{testoTemplate}</pre>
            <div className="mt-2 flex justify-end">
              <CopiaBottone testo={testoTemplate} />
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-critical/30 bg-critical/10 p-3.5 text-xs leading-relaxed text-critical">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
            <div>
              <b className="block uppercase tracking-wide">Recupero apparati richiesto</b>
              Antenna e router dovranno essere restituiti al nostro personale al momento della disattivazione. Ti
              contatteremo per concordare data e modalità di ritiro.
            </div>
          </div>

          <p className="mt-5 text-center text-[11px] text-muted-foreground">
            Per qualsiasi dubbio sulla procedura, scrivi a <b>servizioclienti@donewifi.it</b>.
          </p>
        </div>
      </div>
    </div>
  );
}
