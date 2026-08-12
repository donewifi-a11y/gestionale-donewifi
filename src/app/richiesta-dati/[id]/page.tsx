import { AlertTriangle } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/server";
import { RichiestaDatiFlow } from "@/components/richiesta-dati/richiesta-dati-flow";
import type { Tariffa, MaterialeMagazzino } from "@/lib/types";

export default async function RichiestaDatiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: segnalazione } = await supabase
    .from("segnalazioni")
    .select("id, nome, dati_ricevuti_at, via, civico, comune, cap")
    .eq("id", id)
    .single();

  // ★ catalogo tariffe attive E pubbliche per lo step "scegli il tuo piano"
  // — letto qui (service role, form pubblico senza login) e passato già
  // pronto al form. `pubblica = false` esclude piani sottoscrivibili solo
  // su trattativa diretta, non pensati per comparire in vetrina.
  const { data: tariffe } = await supabase
    .from("tariffe")
    .select("*")
    .eq("attivo", true)
    .eq("pubblica", true)
    .order("ordine", { ascending: true });

  // ★ router/extender per lo step "Scegli il tuo piano" — dal catalogo
  // Materiali già esistente, solo le voci Tp-link della categoria
  // dedicata: EX141/EX520v come router, HX141 come extender mesh (vedi
  // configuratore-piano.tsx per il perché di questo filtro).
  const { data: apparati } = await supabase
    .from("materiali_magazzino")
    .select("*")
    .eq("attivo", true)
    .eq("categoria", "ROUTER, EXTENDER, POWER LINE, SWITCH E AP")
    .ilike("nome", "Tp-link%")
    .order("prezzo_unitario", { ascending: true });
  const apparatiTpLink = (apparati as MaterialeMagazzino[]) ?? [];
  const extender = apparatiTpLink.find((a) => a.nome.includes("HX141")) ?? null;
  const router = apparatiTpLink.filter((a) => a.id !== extender?.id);

  if (!segnalazione) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#141414] p-6 text-center">
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl bg-card p-8 shadow-2xl">
          <AlertTriangle className="h-8 w-8 text-warning" strokeWidth={2} />
          <p className="text-muted-foreground">Link non valido o scaduto. Contatta Done Wifi per assistenza.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#141414]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-primary/30 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl"
      />

      <div className="relative mx-auto min-h-screen max-w-lg px-5 py-10 sm:py-16">
        {/* ★ REBRAND — logo vero (variante bianca) al posto dell'icona
        WiFi generica, vedi portale/page.tsx per lo stesso trattamento. */}
        <div className="mb-8 flex flex-col items-center text-center">
          <img src="/brand/logo-bianco.png" alt="Done Wifi" className="mb-3 h-20 w-20" />
          <p className="mt-1 max-w-xs text-sm text-white/70">
            Ciao <span className="font-semibold text-white">{segnalazione.nome}</span>, completa i dati per
            procedere con il tuo contratto.
          </p>
        </div>
        <RichiestaDatiFlow
          segnalazioneId={segnalazione.id}
          giaInviato={!!segnalazione.dati_ricevuti_at}
          nomeSegnalazione={segnalazione.nome}
          tariffe={(tariffe as Tariffa[]) ?? []}
          router={router}
          extender={extender}
          indirizzo={{
            via: segnalazione.via ?? "",
            civico: segnalazione.civico ?? "",
            comune: segnalazione.comune ?? "",
            cap: segnalazione.cap ?? "",
          }}
        />
      </div>
    </div>
  );
}
