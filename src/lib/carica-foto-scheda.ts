"use client";

import { createClient } from "@/lib/supabase/client";
import { comprimiImmagine } from "@/lib/comprimi-immagine";

/** ★ NUOVA (2026-09-02, bug reale: "Errore imprevisto durante il
 * salvataggio" su pose — causa reale: le foto grezze da fotocamera passavano
 * nel corpo della Server Action, superando il limite di default di 1MB di
 * Next.js) — stesso pattern di caricaDocumento() in richiesta-dati-form.tsx:
 * comprime, chiede un signed upload URL autenticato (api/pose/upload-scheda),
 * carica il file vero direttamente dal browser allo storage Supabase — la
 * Server Action riceve solo il percorso, mai il contenuto del file. */
export async function caricaFotoScheda(file: File, cartella: string): Promise<{ nome: string; percorso: string }> {
  const fileDaCaricare = await comprimiImmagine(file);

  const rispostaUrl = await fetch("/api/pose/upload-scheda", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cartella, nomeFile: fileDaCaricare.name }),
  });
  const risultatoUrl = await rispostaUrl.json();
  if (!rispostaUrl.ok) throw new Error(risultatoUrl.errore || `Errore preparazione upload "${file.name}".`);

  const supabase = createClient();
  const { error } = await supabase.storage.from("documenti").uploadToSignedUrl(risultatoUrl.percorso, risultatoUrl.token, fileDaCaricare);
  if (error) throw new Error(`Errore caricamento "${file.name}": ${error.message}`);

  return { nome: file.name, percorso: risultatoUrl.percorso };
}
