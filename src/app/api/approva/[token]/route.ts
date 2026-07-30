import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceClient();

  const { data: riga } = await supabase.from("token_approvazione").select("ticket_id").eq("token", token).maybeSingle();
  if (!riga) {
    return NextResponse.json({ errore: "Questo link di approvazione è scaduto o è già stato usato." }, { status: 404 });
  }

  const { error } = await supabase
    .from("tickets")
    .update({ confermato_cliente_il: new Date().toISOString() })
    .eq("id", riga.ticket_id);
  if (error) return NextResponse.json({ errore: error.message }, { status: 500 });

  // ★ monouso: cancellato subito dopo l'uso, come il vecchio token in PropertiesService.
  await supabase.from("token_approvazione").delete().eq("token", token);

  return NextResponse.json({ ok: true });
}
