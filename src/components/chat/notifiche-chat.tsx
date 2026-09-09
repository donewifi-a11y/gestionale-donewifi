"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useChatData } from "@/components/chat/chat-data-context";
import { suonaAvvisoChat, mostraNotificaDesktopChat, aggiornaTitoloNonLetti, aggiornaFaviconNonLetti } from "@/lib/notifiche-chat";

/** ★ NUOVA (2026-09-09, richiesta esplicita: "vorrei che le notifiche
 * delle chat siano molto più visibili") — componente senza resa visiva
 * propria, montato una sola volta in app-shell.tsx: osserva i dati già
 * caricati da ChatDataProvider e orchestra i tre canali di avviso (vedi
 * lib/notifiche-chat.ts). Non duplica nessuna sottoscrizione realtime —
 * si limita a reagire ai cambi di `persone`/`gruppi`/`nonLettiTotali` già
 * tenuti aggiornati altrove. */
export function NotificheChat() {
  const { persone, gruppi, nonLettiTotali, pronto } = useChatData();
  const pathname = usePathname();
  // ★ non letti per conversazione al giro precedente — null finché non è
  // arrivato il primo caricamento vero: senza questa distinzione, aprire
  // il gestionale con dell'arretrato già in sospeso farebbe suonare/
  // notificare tutto l'arretrato in un colpo solo, non solo il nuovo.
  const precedentiRef = useRef<Map<string, number> | null>(null);

  // ★ titolo scheda + favicon — riapplicati anche a ogni cambio pagina,
  // non solo a ogni cambio dei non letti: la navigazione tra pagine
  // rimette il titolo scelto da quella pagina, perdendo il badge finché
  // non arriva un nuovo evento chat.
  useEffect(() => {
    aggiornaTitoloNonLetti(nonLettiTotali);
    aggiornaFaviconNonLetti(nonLettiTotali);
  }, [nonLettiTotali, pathname]);

  useEffect(() => {
    if (!pronto) return;
    const attuali = new Map<string, number>();
    const conversazioni: { id: string; nome: string; nonLetti: number; ultimoTesto: string | null; ultimoAllegatoNome: string | null }[] = [
      ...gruppi.map((g) => ({ id: `g-${g.id}`, nome: g.reparto, nonLetti: g.nonLetti, ultimoTesto: g.ultimoTesto, ultimoAllegatoNome: g.ultimoAllegatoNome })),
      ...persone.map((p) => ({ id: `p-${p.id}`, nome: p.nome, nonLetti: p.nonLetti, ultimoTesto: p.ultimoTesto, ultimoAllegatoNome: p.ultimoAllegatoNome })),
    ];
    for (const c of conversazioni) attuali.set(c.id, c.nonLetti);

    const precedenti = precedentiRef.current;
    if (precedenti) {
      for (const c of conversazioni) {
        const prima = precedenti.get(c.id) ?? 0;
        if (c.nonLetti > prima) {
          // ★ il suono avvisa sempre — utile anche con la scheda in primo
          // piano ma su una pagina diversa dalla Chat. La notifica
          // desktop, molto più invasiva (un popup del sistema operativo),
          // solo se non si sta già guardando la scheda: altrimenti sarebbe
          // un avviso sopra quello che si ha già sott'occhio.
          suonaAvvisoChat();
          if (document.visibilityState !== "visible" || !document.hasFocus()) {
            const corpo = c.ultimoTesto || (c.ultimoAllegatoNome ? `📎 ${c.ultimoAllegatoNome}` : "Nuovo messaggio");
            mostraNotificaDesktopChat(c.nome, corpo);
          }
        }
      }
    }
    precedentiRef.current = attuali;
  }, [persone, gruppi, pronto]);

  return null;
}
