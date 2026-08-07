import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: riga } = await supabase
    .from("token_approvazione")
    .select("ticket_id, segnalazione_id, origine, creato_il")
    .eq("token", token)
    .maybeSingle();
  if (!riga) {
    return NextResponse.json({ errore: "Questo link di approvazione è scaduto o è già stato usato." }, { status: 404 });
  }

  // ★ FIX — il token era monouso (cancellato all'uso, corretto) ma senza
  // scadenza temporale: un'email di conferma dimenticata in una vecchia
  // casella restava valida per sempre. 30 giorni è ampiamente sufficiente
  // per confermare un intervento/contratto appena concluso.
  const SCADENZA_MS = 30 * 24 * 60 * 60 * 1000;
  if (Date.now() - new Date(riga.creato_il).getTime() > SCADENZA_MS) {
    await supabase.from("token_approvazione").delete().eq("token", token);
    return NextResponse.json({ errore: "Questo link di approvazione è scaduto. Contatta Done Wifi per assistenza." }, { status: 410 });
  }

  // ★ NUOVA — stesso token monouso, ma ora può riferirsi anche a una
  // Segnalazione (approvazione contratto) invece che solo a un Ticket
  // (conferma intervento) — vedi token_approvazione.origine, migrazione 0044.
  if (riga.origine === "contratto" && riga.segnalazione_id) {
    const adesso = new Date().toISOString();
    const { error } = await supabase
      .from("segnalazioni")
      .update({ contratto_approvato_cliente_il: adesso })
      .eq("id", riga.segnalazione_id);
    if (error) return NextResponse.json({ errore: error.message }, { status: 500 });

    // ★ la voce di storico è la "prova" richiesta nella pratica: data/ora
    // dell'approvazione e che è arrivata da questo stesso link inviato solo
    // all'email del cliente (nessun operatore umano l'ha cliccato).
    await supabase.from("storico").insert({
      origine: "segnalazione",
      riferimento_id: riga.segnalazione_id,
      operazione: "Contratto approvato dal cliente",
      valore_dopo: `Approvato via link email il ${adesso}`,
    });
  } else if (riga.ticket_id) {
    const { error } = await supabase
      .from("tickets")
      .update({ confermato_cliente_il: new Date().toISOString() })
      .eq("id", riga.ticket_id);
    if (error) return NextResponse.json({ errore: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ errore: "Link non valido." }, { status: 404 });
  }

  // ★ monouso: cancellato subito dopo l'uso, come il vecchio token in PropertiesService.
  await supabase.from("token_approvazione").delete().eq("token", token);

  return NextResponse.json({ ok: true });
}
