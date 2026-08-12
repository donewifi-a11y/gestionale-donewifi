export const metadata = { title: "Informativa Privacy - Done Wifi" };

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="border-b bg-card py-4 text-center shadow-sm">
        <img src="/brand/logo-completo.png" alt="Done Wifi" className="mx-auto h-12 w-12" />
      </div>
      <div className="mx-auto max-w-2xl px-5 py-10">
        <div className="rounded-2xl border bg-card p-7 shadow-sm sm:p-9">
          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] p-1.5 shadow-md shadow-primary/30">
            <img src="/brand/logo-marchio.png" alt="" className="h-full w-full object-contain" />
          </div>
          <h1 className="mt-3 font-heading text-2xl font-bold tracking-tight">
            Informativa sul trattamento dei dati personali
          </h1>
          <p className="mb-6 text-xs text-muted-foreground">
            Ai sensi degli articoli 13 e 14 del Regolamento UE 2016/679 (GDPR)
          </p>

          <Sezione titolo="1. Titolare del trattamento">
            <p>
              Studio Armonia Srl, con sede in Via Tourneuve 6, 11100 Aosta (AO), P.IVA 05690180012,
              contattabile all&apos;indirizzo email privacy@donewifi.it (PEC: studioarmonia@pec.it).
            </p>
          </Sezione>

          <Sezione titolo="2. Dati raccolti e finalità del trattamento">
            <p>Attraverso il portale e i moduli online raccogliamo, a seconda della pratica richiesta:</p>
            <ul>
              <li>Dati anagrafici (nome, cognome, o ragione sociale e dati del legale rappresentante), codice fiscale, partita IVA;</li>
              <li>Recapiti (telefono, email, indirizzo di installazione/fatturazione);</li>
              <li>Coordinate bancarie (IBAN), in caso di richieste di addebito o variazione;</li>
              <li>Documento d&apos;identità, per verificare l&apos;identità del richiedente in caso di subentro, trasferimento o nuovo contratto;</li>
              <li>Tessera sanitaria (solo se necessaria per la pratica specifica) — dato relativo alla salute ai sensi dell&apos;art. 9 GDPR, trattato con misure di sicurezza rafforzate e per il solo tempo necessario a completare la verifica richiesta.</li>
            </ul>
            <p>Questi dati sono trattati esclusivamente per:</p>
            <ul>
              <li>dare seguito alla richiesta specifica (attivazione, subentro, trasferimento, variazione IBAN, aggiornamento anagrafico);</li>
              <li>adempiere a obblighi contrattuali, contabili e fiscali;</li>
              <li>rispondere a obblighi di legge (es. normativa antiriciclaggio, fatturazione).</li>
            </ul>
          </Sezione>

          <Sezione titolo="3. Base giuridica">
            <p>
              Il trattamento si fonda sull&apos;esecuzione di misure precontrattuali/contrattuali richieste
              dall&apos;interessato (art. 6.1.b GDPR) e sull&apos;adempimento di obblighi di legge (art. 6.1.c
              GDPR). Per i dati di cui all&apos;art. 9 GDPR (es. tessera sanitaria), il trattamento avviene solo
              se strettamente necessario alla pratica richiesta e sulla base del consenso esplicito fornito in
              fase di invio del modulo.
            </p>
          </Sezione>

          <Sezione titolo="4. Modalità di trattamento e conservazione">
            <p>
              I dati sono trattati con strumenti informatici (infrastruttura cloud Supabase/Vercel) con misure
              tecniche e organizzative adeguate a garantirne la sicurezza. I documenti caricati vengono
              conservati per il tempo necessario a completare la verifica della pratica e, di norma,{" "}
              <b>eliminati entro 30 giorni dalla chiusura della pratica stessa</b>. I dati anagrafici necessari
              alla gestione del rapporto contrattuale sono conservati per la durata del contratto e per il
              periodo successivo previsto dagli obblighi di legge (es. fiscali/contabili).
            </p>
          </Sezione>

          <Sezione titolo="5. Destinatari dei dati">
            <p>
              I dati sono trattati dal personale autorizzato di Studio Armonia Srl e possono essere condivisi
              con fornitori di servizi informatici (es. Supabase e Vercel, in qualità di responsabili del
              trattamento per l&apos;infrastruttura utilizzata) esclusivamente per le finalità sopra indicate. I
              dati non vengono ceduti a terzi per finalità commerciali.
            </p>
          </Sezione>

          <Sezione titolo="6. Diritti dell'interessato">
            <p>
              In qualsiasi momento puoi esercitare i diritti previsti dagli articoli 15-22 del GDPR: accesso ai
              tuoi dati, rettifica, cancellazione, limitazione del trattamento, portabilità, opposizione. Puoi
              inoltre proporre reclamo all&apos;Autorità Garante per la Protezione dei Dati Personali
              (www.garanteprivacy.it). Per esercitare questi diritti scrivi a privacy@donewifi.it (PEC:
              studioarmonia@pec.it).
            </p>
          </Sezione>

          <Sezione titolo="7. Conferimento dei dati">
            <p>
              Il conferimento dei dati richiesti nei moduli è necessario per dare seguito alla pratica
              richiesta: in assenza, non sarà possibile procedere con l&apos;attivazione, il subentro o la
              variazione richiesta.
            </p>
          </Sezione>
        </div>
      </div>
    </div>
  );
}

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="mb-1.5 border-l-2 border-primary pl-2.5 font-heading text-xs font-bold uppercase tracking-wide">
        {titolo}
      </h2>
      <div className="space-y-2 text-[13.5px] leading-relaxed text-muted-foreground [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </div>
  );
}
