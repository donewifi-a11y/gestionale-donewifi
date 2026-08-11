import { createClient } from "@/lib/supabase/server";
import { NuovoPreventivoForm } from "@/components/preventivi/nuovo-preventivo-form";
import type { Tariffa, MaterialeMagazzino } from "@/lib/types";

export default async function NuovoPreventivoPage() {
  const supabase = await createClient();

  const [{ data: tariffe }, { data: materiali }] = await Promise.all([
    supabase.from("tariffe").select("*").eq("attivo", true).order("ordine", { ascending: true }),
    supabase.from("materiali_magazzino").select("*").eq("attivo", true).order("ordine", { ascending: true }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <NuovoPreventivoForm tariffe={(tariffe as Tariffa[]) ?? []} materiali={(materiali as MaterialeMagazzino[]) ?? []} />
    </div>
  );
}
