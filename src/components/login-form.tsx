"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";
import { selezionaPersonaDopoLogin } from "@/app/login/actions";

export function LoginForm({ erroreIniziale }: { erroreIniziale?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errore, setErrore] = useState<string | null>(
    erroreIniziale === "account-non-attivo"
      ? "Questo account non è (ancora) attivo. Contatta un amministratore per abilitarlo."
      : null
  );
  const [caricamento, setCaricamento] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrore(null);
    setCaricamento(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setErrore("Email o password non corrette.");
      setCaricamento(false);
      return;
    }

    // ★ login individuale — se questo account è collegato a una Persona,
    // la seleziona subito: non serve più il passaggio "Tu sei". Un
    // problema qui (rete, RLS non ancora allineata, ecc.) non deve mai
    // impedire l'accesso: il login vero è già riuscito sopra.
    try {
      await selezionaPersonaDopoLogin();
    } catch {
      // ignorato di proposito — al peggio si sceglie "Tu sei" a mano.
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {errore && (
        <p className="flex items-start gap-2 rounded-lg bg-critical/10 p-2.5 text-sm text-critical">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
          {errore}
        </p>
      )}
      <Button type="submit" disabled={caricamento} className="mt-2">
        {caricamento ? "Accesso in corso…" : "Accedi"}
      </Button>
    </form>
  );
}