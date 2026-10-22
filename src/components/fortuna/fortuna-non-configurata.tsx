import { AlertTriangle } from "lucide-react";

/** ★ NUOVA — mostrata se le variabili d'ambiente del progetto Fortuna non sono ancora impostate. */
export function FortunaNonConfigurata() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <p>
        Fortuna non è ancora collegata. Imposta le variabili <code>NEXT_PUBLIC_FORTUNA_SUPABASE_URL</code>, <code>NEXT_PUBLIC_FORTUNA_SUPABASE_KEY</code> e{" "}
        <code>FORTUNA_SUPABASE_SECRET_KEY</code> (Vercel → Environment Variables) e rifai il deploy.
      </p>
    </div>
  );
}
