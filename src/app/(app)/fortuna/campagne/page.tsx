import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FortunaIntestazione } from "@/components/fortuna/fortuna-intestazione";
import { FortunaNonConfigurata } from "@/components/fortuna/fortuna-non-configurata";
import { createFortunaClient, fortunaConfigurata } from "@/lib/fortuna/client";
import { richiediFortuna } from "@/lib/fortuna/permessi";
import { daOraRoma, formattaData } from "@/lib/fortuna/premi";

export const dynamic = "force-dynamic";

async function creaCampagna(formData: FormData) {
  "use server";
  await richiediFortuna("admin");
  const nome = String(formData.get("nome") ?? "").trim();
  const inizio = String(formData.get("inizio") ?? "");
  const fine = String(formData.get("fine") ?? "");
  if (!nome || !inizio || !fine) redirect(`/fortuna/campagne?errore=${encodeURIComponent("Compila tutti i campi.")}`);

  const { data, error } = await createFortunaClient()
    .from("fortuna_campagne")
    .insert({ nome, inizio: daOraRoma(inizio), fine: daOraRoma(fine), stato: "bozza" })
    .select("id")
    .single();
  if (error || !data) redirect(`/fortuna/campagne?errore=${encodeURIComponent("Date non valide (la fine deve seguire l'inizio).")}`);
  redirect(`/fortuna/campagne/${data.id}`);
}

export default async function Campagne({ searchParams }: { searchParams: Promise<{ errore?: string }> }) {
  await richiediFortuna("admin");
  const intestazione = <FortunaIntestazione attiva="campagne" isAdmin />;
  if (!fortunaConfigurata()) return <div className="mx-auto max-w-5xl">{intestazione}<FortunaNonConfigurata /></div>;

  const { errore } = await searchParams;
  const { data: campagne } = await createFortunaClient().from("fortuna_campagne").select("id, nome, stato, inizio, fine").order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-5xl">
      {intestazione}
      <Card className="mb-6">
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Stato</TableHead><TableHead>Dal</TableHead><TableHead>Al</TableHead></TableRow></TableHeader>
            <TableBody>
              {(campagne ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium"><Link className="text-primary hover:underline" href={`/fortuna/campagne/${c.id}`}>{c.nome}</Link></TableCell>
                  <TableCell><Badge variant={c.stato === "attiva" ? "default" : "outline"}>{c.stato}</Badge></TableCell>
                  <TableCell>{formattaData(c.inizio)}</TableCell>
                  <TableCell>{formattaData(c.fine)}</TableCell>
                </TableRow>
              ))}
              {!campagne?.length && <TableRow><TableCell colSpan={4} className="text-muted-foreground">Nessuna campagna: creane una qui sotto.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <h2 className="mb-3 font-semibold">Nuova campagna</h2>
          {errore && <p role="alert" className="mb-3 rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive">{errore}</p>}
          <form action={creaCampagna} className="flex max-w-md flex-col gap-3">
            <Input name="nome" placeholder="Nome campagna" required />
            <label className="flex flex-col gap-1 text-sm">Inizio (ora italiana)<Input name="inizio" type="datetime-local" required /></label>
            <label className="flex flex-col gap-1 text-sm">Fine (ora italiana)<Input name="fine" type="datetime-local" required /></label>
            <Button size="lg" className="h-9 px-4">Crea come bozza</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
