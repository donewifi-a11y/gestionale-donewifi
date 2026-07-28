import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LoginForm } from "@/components/login-form";
import { Wifi } from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const { errore } = await searchParams;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[oklch(0.22_0.035_255)] px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-32 h-96 w-96 rounded-full bg-[#6E9FDB]/20 blur-3xl"
      />

      <Card className="relative w-full max-w-sm border-white/10 bg-card/95 shadow-2xl backdrop-blur">
        <CardHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/30">
            <Wifi className="h-5 w-5" strokeWidth={2.5} />
          </div>
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
