import { redirect } from "next/navigation";

// ★ FUSA (2026-09-03, "meno voci di menu possibili" — artifact "Meno Voci
// nel Menu", confermata) — questa pagina è durata poche ore: creata,
// poi fusa come secondo tab dentro Archivio ("Schede e Rapportini") non
// appena l'utente ha fatto notare che erano due porte per la stessa cosa.
// Redirect per chi avesse già salvato il link — stesso trattamento già
// usato per /utenti e /tecnici-esterni.
export default function RapportiLavoroPage() {
  redirect("/archivio");
}
