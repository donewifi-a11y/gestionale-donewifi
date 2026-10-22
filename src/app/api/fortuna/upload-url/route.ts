import { NextResponse } from "next/server";
import { createFortunaClient } from "@/lib/fortuna/client";
import { personaFortuna } from "@/lib/fortuna/permessi";
import { BUCKET_PREMI } from "@/lib/fortuna/premi";

const TIPI: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/**
 * ★ NUOVA — URL firmato per caricare UN'immagine di un premio Fortuna direttamente su Supabase Storage
 * dal browser (il file non passa dal server: niente limiti di dimensione delle richieste su Vercel).
 * Solo amministratori.
 */
export async function POST(request: Request) {
  if (!(await personaFortuna("admin"))) return NextResponse.json({ errore: "Non autorizzato." }, { status: 403 });

  const { tipo } = (await request.json().catch(() => ({}))) as { tipo?: string };
  const estensione = tipo ? TIPI[tipo] : undefined;
  if (!estensione) return NextResponse.json({ errore: "Formato non supportato: usa PNG, JPG o WebP." }, { status: 400 });

  const db = createFortunaClient();
  const path = `${crypto.randomUUID()}.${estensione}`;
  const { data, error } = await db.storage.from(BUCKET_PREMI).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ errore: "Impossibile preparare il caricamento." }, { status: 500 });

  return NextResponse.json({ path, token: data.token, urlPubblico: db.storage.from(BUCKET_PREMI).getPublicUrl(path).data.publicUrl });
}
