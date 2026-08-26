import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, CalendarClock } from "lucide-react";
import { getAppuntamentoTecnicoEsterno, getCatalogoMaterialiEsterno } from "../../actions";
import { getTecnicoEsternoCorrente } from "@/lib/tecnico-esterno";
import { SchedaDettaglioPose } from "@/components/pose/scheda-dettaglio";
import { COLORE_SERVIZIO } from "@/lib/types";

export default async function AppuntamentoPosePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const tecnico = await getTecnicoEsternoCorrente();
  if (!tecnico) redirect("/pose/login");

  const [appuntamento, catalogoMateriali] = await Promise.all([getAppuntamentoTecnicoEsterno(id), getCatalogoMaterialiEsterno()]);
  if (!appuntamento) notFound();

  const completato = appuntamento.stato !== "Programmato";
  const colore = COLORE_SERVIZIO[appuntamento.tipo_servizio];

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-4 py-6">
      <Link href="/pose" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
        I tuoi interventi
      </Link>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <span className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${colore.sfondo} ${colore.testo}`}>{appuntamento.tipo_servizio}</span>
        <p className="mt-2 text-lg font-bold">{appuntamento.titolo}</p>
        <div className="mt-2 flex flex-col gap-1.5 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
            {new Date(appuntamento.data_ora).toLocaleString("it-IT", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </span>
          {appuntamento.indirizzo && (
            <span className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
              {appuntamento.indirizzo}
            </span>
          )}
        </div>
      </div>

      {completato ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Questo appuntamento risulta già {appuntamento.stato.toLowerCase()}.</p>
      ) : (
        <SchedaDettaglioPose appuntamento={appuntamento} catalogoMateriali={catalogoMateriali} />
      )}
    </div>
  );
}
