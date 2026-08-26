import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LoginTecnicoEsternoForm } from "@/components/pose/login-form";

// ★ NUOVA (2026-08-26) — login separato per pose.donewifi.it: stessa
// identità visiva del login staff (/login), ma sotto è tutt'altro sistema
// (account fisso per tecnico, non Supabase Auth — vedi lib/tecnico-esterno.ts).
export default async function PoseLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const { errore } = await searchParams;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#141414] px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl"
      />

      <Card className="relative w-full max-w-sm border-white/10 bg-card/95 shadow-2xl backdrop-blur">
        <CardHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-completo.png" alt="Done Wifi" className="mb-1 h-14 w-14" />
          <CardTitle className="font-heading text-xl">Pose — Tecnici</CardTitle>
          <CardDescription>Done Wifi — Interventi assegnati a te</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginTecnicoEsternoForm erroreIniziale={errore} />
        </CardContent>
      </Card>
    </div>
  );
}
