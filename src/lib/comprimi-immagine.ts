/** ★ ESTRATTA (2026-09-02, bug reale: "Errore imprevisto durante il
 * salvataggio" su pose, Nuova installazione — "An unexpected response was
 * received from the server" in console, causa reale trovata: le foto da
 * fotocamera passavano nel corpo della Server Action, superando il limite
 * di default di 1MB di Next.js e i ~4.5MB delle funzioni Vercel) — era
 * definita solo dentro richiesta-dati-form.tsx per lo stesso problema già
 * risolto lì; estratta qui per essere riusata anche da pose e dalle Schede
 * di Installazione/Lavorazione, invece di duplicarla.
 *
 * Le foto da fotocamera/smartphone arrivano spesso a 4-8MB l'una: caricarle
 * così come sono è lento e pesa inutilmente sullo storage, per una foto che
 * deve solo restare leggibile. Ridimensiona al lato lungo massimo e
 * ricomprime in JPEG — se il risultato non è più piccolo dell'originale
 * (già leggero) tiene l'originale invece di peggiorarlo. */
export async function comprimiImmagine(file: File, latoMax = 1920, qualita = 0.8): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scala = Math.min(1, latoMax / Math.max(bitmap.width, bitmap.height));
    const larghezza = Math.round(bitmap.width * scala);
    const altezza = Math.round(bitmap.height * scala);
    const canvas = document.createElement("canvas");
    canvas.width = larghezza;
    canvas.height = altezza;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, larghezza, altezza);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", qualita));
    if (!blob || blob.size >= file.size) return file;
    const nomeCompresso = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nomeCompresso, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
