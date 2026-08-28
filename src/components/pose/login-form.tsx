"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { loginTecnicoEsterno, loginStaffPose } from "@/app/pose/actions";

// ★ ESTESA (2026-08-28, richiesta esplicita: "poter usare su
// pose.donewifi.it anche la possibilità di entrare con le credenziali di
// chi usa gestione.donewifi") — un solo campo, un solo form: se contiene
// "@" è un'email (staff interno, stesse credenziali del login principale,
// vera sessione Supabase Auth), altrimenti è il nome utente fisso di un
// tecnico esterno. Evita di dover chiedere prima "chi sei" con un
// selettore in più, su una schermata pensata per essere aperta in fretta
// da smartphone.
export function LoginTecnicoEsternoForm({ erroreIniziale }: { erroreIniziale?: string }) {
  const router = useRouter();
  const [identificativo, setIdentificativo] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState<string | null>(erroreIniziale ? "Accedi di nuovo per continuare." : null);
  const [caricamento, setCaricamento] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setCaricamento(true);

    const valore = identificativo.trim();
    const risultato = valore.includes("@") ? await loginStaffPose(valore, password) : await loginTecnicoEsterno(valore, password);
    setCaricamento(false);
    if (risultato.errore) {
      setErrore(risultato.errore);
      return;
    }

    router.push("/pose");
    router.refresh();
  }

  return (
    // ★ pose.donewifi.it è solo smartphone/tablet: campi e bottone più
    // grandi del default desktop (h-8) usato altrove nel gestionale.
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Nome utente o email</Label>
        <Input
          id="username"
          type="text"
          autoComplete="username"
          required
          autoFocus
          value={identificativo}
          onChange={(e) => setIdentificativo(e.target.value)}
          className="h-12 text-base"
        />
        <p className="text-xs text-muted-foreground">
          Tecnico esterno: il tuo nome utente. Staff interno: la tua email di gestione.donewifi.it.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-12 text-base"
        />
      </div>
      {errore && (
        <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          {errore}
        </p>
      )}
      <Button type="submit" disabled={caricamento} className="mt-2 h-12 text-base">
        {caricamento ? "Accesso in corso…" : "Accedi"}
      </Button>
    </form>
  );
}
