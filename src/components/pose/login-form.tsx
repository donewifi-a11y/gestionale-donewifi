"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { loginTecnicoEsterno } from "@/app/pose/actions";

export function LoginTecnicoEsternoForm({ erroreIniziale }: { erroreIniziale?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState<string | null>(erroreIniziale ? "Accedi di nuovo per continuare." : null);
  const [caricamento, setCaricamento] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setCaricamento(true);

    const risultato = await loginTecnicoEsterno(email, password);
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
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 text-base"
        />
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
