import { redirect } from "next/navigation";

export interface StaffCompleto {
  id: string;
  email: string;
  nome: string | null;
  area_accesso: string;
  attivo: boolean;
}

// ★ ESTESA (2026-08-28, richiesta esplicita — "riorganizziamo tutto...
// rendere univoci i posti dove aprire le diverse sezioni" → artifact
// "Audit Ingressi") — questa pagina era già stata tolta dal menu (restava
// raggiungibile solo a chi conosceva l'indirizzo), la tab "Accessi
// condivisi" dentro /persone era già il vero punto d'ingresso da tempo.
// Ora anche l'URL diretto porta lì, invece di mostrare una pagina "vecchia"
// gemella di quella nuova: un solo posto vero, non due che sembrano uguali.
export default function UtentiPage() {
  redirect("/persone");
}
