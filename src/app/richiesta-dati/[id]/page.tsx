import { createServiceClient } from "@/lib/supabase/server";
import { RichiestaDatiForm } from "@/components/richiesta-dati/richiesta-dati-form";

export default async function RichiestaDatiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: segnalazione } = await supabase
    .from("segnalazioni")
    .select("id, nome, dati_ricevuti_at")
    .eq("id", id)
    .single();

  if (!segnalazione) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">Link non valido o scaduto. Contatta Done Wifi per assistenza.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg p-6">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Done Wifi</h1>
        <p className="text-muted-foreground">
          Ciao {segnalazione.nome}, completa i dati per procedere con il tuo contratto.
        </p>
      </div>
      <RichiestaDatiForm segnalazioneId={segnalazione.id} giaInviato={!!segnalazione.dati_ricevuti_at} />
    </div>
  );
}
