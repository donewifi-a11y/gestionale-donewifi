import { redirect } from "next/navigation";

// ★ ESTESA (2026-08-28, richiesta esplicita — "riorganizziamo tutto...
// rendere univoci i posti dove aprire le diverse sezioni" → artifact
// "Audit Ingressi", sezione Persone/Utenti/Tecnici esterni) — la tab
// "Tecnici esterni" dentro /persone (vedi PersoneBoard) è ora il vero
// punto d'ingresso, stesso principio già applicato a /utenti. Chi arriva
// qui con un link salvato o dal segnalibro finisce comunque nel posto
// giusto invece che su una pagina duplicata.
export default function TecniciEsterniPage() {
  redirect("/persone");
}
