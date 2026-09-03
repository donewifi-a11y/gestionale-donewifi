import { redirect } from "next/navigation";

// ★ FUSA (2026-09-03, "meno voci di menu possibili" — artifact "Meno Voci
// nel Menu", confermata) — le Dashboard per reparto sono confluite in
// /dashboard come tab (vedi SezioneDashboardReparto), non più pagine a sé.
// Redirect per chi avesse un link salvato — stesso trattamento già usato
// per /utenti, /tecnici-esterni e /rapporti-lavoro.
export default function DashboardRepartoPage() {
  redirect("/dashboard");
}
