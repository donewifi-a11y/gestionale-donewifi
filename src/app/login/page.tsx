import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage({
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

      {/* ★ REBRAND — logo vero al posto dell'icona WiFi generica. */}
      <Card className="relative w-full max-w-sm border-white/10 bg-card/95 shadow-2xl backdrop-blur">
        <CardHeader>
          <img src="/brand/logo-completo.png" alt="Done Wifi" className="mb-1 h-14 w-14" />
          <CardTitle className="font-heading text-xl">Accedi al gestionale</CardTitle>
          <CardDescription>Done Wifi — Gestionale CRM</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm erroreIniziale={errore} />
        </CardContent>
      </Card>
    </div>
  );
}
