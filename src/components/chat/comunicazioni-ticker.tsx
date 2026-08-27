"use client";

import { Bell, MessageCircle } from "lucide-react";
import { useChatData } from "@/components/chat/chat-data-context";
import { useChatUi } from "@/components/chat/chat-ui-context";

interface Voce {
  id: string;
  nome: string;
  testo: string;
  daSistema: boolean;
  quando: string;
  isGruppo: boolean;
}

/** ★ NUOVA (2026-08-27, richiesta esplicita: "facciamo la B" — Opzione B
 * dell'artifact "Layout Comunicazioni": barra attività + rail fissa) —
 * su schermi ≥ xl la rail fissa in app-shell.tsx è già sempre in vista,
 * questa striscia sarebbe ridondante lì (`xl:hidden`). Sotto quella
 * soglia (tablet, laptop piccoli) è l'unico modo di accorgersi di
 * un'attività recente senza aprire il pop-up: un tocco sulla striscia lo
 * apre già sulla lista conversazioni (apriPopup(), via ChatUiContext). */
export function ComunicazioniTicker() {
  const { persone, gruppi, nonLettiTotali, pronto } = useChatData();
  const { apriPopup } = useChatUi();

  if (!pronto) return null;

  const voci: Voce[] = [
    ...gruppi
      .filter((g) => g.ultimoCreatoIl)
      .map((g): Voce => ({ id: `g-${g.id}`, nome: g.reparto, testo: g.ultimoTesto ?? (g.ultimoAllegatoNome ? `📎 ${g.ultimoAllegatoNome}` : ""), daSistema: g.ultimoDaSistema, quando: g.ultimoCreatoIl!, isGruppo: true })),
    ...persone
      .filter((p) => p.ultimoCreatoIl)
      .map((p): Voce => ({ id: `p-${p.id}`, nome: p.nome, testo: p.ultimoTesto ?? (p.ultimoAllegatoNome ? `📎 ${p.ultimoAllegatoNome}` : ""), daSistema: p.ultimoDaSistema, quando: p.ultimoCreatoIl!, isGruppo: false })),
  ]
    .sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime())
    .slice(0, 6);

  if (voci.length === 0) return null;

  return (
    <button
      onClick={apriPopup}
      className="xl:hidden flex w-full items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5 text-left shadow-sm transition hover:bg-muted/40"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
      <div className="flex min-w-0 flex-1 gap-4 overflow-x-auto">
        {voci.map((v) => (
          <span key={v.id} className="flex shrink-0 items-center gap-1.5 text-xs">
            {v.daSistema && <Bell className="h-3 w-3 shrink-0 text-primary/70" strokeWidth={2.25} />}
            <b className="font-bold">{v.nome}</b>
            <span className="max-w-[170px] truncate text-muted-foreground">{v.testo}</span>
          </span>
        ))}
      </div>
      {nonLettiTotali > 0 && (
        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">{nonLettiTotali}</span>
      )}
    </button>
  );
}
