"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useChatData } from "@/components/chat/chat-data-context";
import { useChatUi } from "@/components/chat/chat-ui-context";
import { useToast } from "@/components/ui/toast";
import {
  suonaAvvisoChat,
  suonaAvvisoUrgente,
  mostraNotificaDesktopChat,
  aggiornaTitoloNonLetti,
  aggiornaFaviconNonLetti,
  aggiornaBadgeApp,
} from "@/lib/notifiche-chat";

/** ★ NUOVA (2026-09-09, richiesta esplicita: "vorrei che le notifiche
 * delle chat siano molto più visibili") — componente senza resa visiva
 * propria, montato una sola volta in app-shell.tsx: osserva i dati già
 * caricati da ChatDataProvider e orchestra i canali di avviso (vedi
 * lib/notifiche-chat.ts). Non duplica nessuna sottoscrizione realtime —
 * si limita a reagire ai cambi di `persone`/`gruppi`/`nonLettiTotali` già
 * tenuti aggiornati altrove.
 *
 * ★ ESTESA (2026-09-09, "procedi con tutte" — le 4 proposte dell'artifact
 * "Notifiche in Azione"): badge sull'icona dell'app (Badging API — serve
 * solo se il gestionale è installato come app, vedi manifest.ts, nessun
 * effetto altrimenti), recap "ti sei perso N messaggi" al ritorno da
 * un'assenza, suono più marcato per un messaggio diretto o una menzione
 * di gruppo (la 3ª proposta, "sta scrivendo…", vive invece in
 * chat-panel.tsx — richiede il canale della conversazione aperta, non i
 * dati aggregati di qui). */
export function NotificheChat({ nomePersonaCorrente }: { nomePersonaCorrente: string | null }) {
  const { persone, gruppi, nonLettiTotali, pronto } = useChatData();
  const { apriPopup } = useChatUi();
  const toast = useToast();
  const pathname = usePathname();
  // ★ non letti per conversazione al giro precedente — null finché non è
  // arrivato il primo caricamento vero: senza questa distinzione, aprire
  // il gestionale con dell'arretrato già in sospeso farebbe suonare/
  // notificare tutto l'arretrato in un colpo solo, non solo il nuovo.
  const precedentiRef = useRef<Map<string, number> | null>(null);
  // ★ istantanea dei non letti presa quando la scheda passa in secondo
  // piano (tab nascosta) — confrontata con quella al ritorno per il
  // recap "ti sei perso...". Resta null se non si è mai nascosta.
  const nascostoDaRef = useRef<Map<string, number> | null>(null);

  // ★ titolo scheda + favicon + badge app — riapplicati anche a ogni
  // cambio pagina, non solo a ogni cambio dei non letti: la navigazione
  // tra pagine rimette il titolo scelto da quella pagina, perdendo il
  // badge finché non arriva un nuovo evento chat.
  useEffect(() => {
    aggiornaTitoloNonLetti(nonLettiTotali);
    aggiornaFaviconNonLetti(nonLettiTotali);
    aggiornaBadgeApp(nonLettiTotali);
  }, [nonLettiTotali, pathname]);

  function elencoConversazioni() {
    return [
      ...gruppi.map((g) => ({ id: `g-${g.id}`, nome: g.reparto, nonLetti: g.nonLetti, ultimoTesto: g.ultimoTesto, ultimoAllegatoNome: g.ultimoAllegatoNome, diretta: false })),
      ...persone.map((p) => ({ id: `p-${p.id}`, nome: p.nome, nonLetti: p.nonLetti, ultimoTesto: p.ultimoTesto, ultimoAllegatoNome: p.ultimoAllegatoNome, diretta: true })),
    ];
  }
  // ★ il listener di visibilitychange sotto si attacca una volta sola (non
  // deve riattaccarsi a ogni nuovo messaggio): legge sempre l'elenco più
  // fresco da questo ref, risincronizzato a ogni cambio di persone/gruppi
  // in un effetto — mai durante il render — invece che da una chiusura
  // fissata al momento in cui il listener è stato creato.
  const conversazioniRef = useRef<ReturnType<typeof elencoConversazioni>>([]);
  useEffect(() => {
    conversazioniRef.current = elencoConversazioni();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- elencoConversazioni() legge già persone/gruppi correnti; aggiungerla alle dipendenze la ricreerebbe (nuova identità) a ogni render, rieseguendo questo effetto comunque a ogni giro.
  }, [persone, gruppi]);

  // ★ suono + notifica desktop per ogni conversazione i cui non letti
  // sono appena aumentati — non al primo caricamento.
  useEffect(() => {
    if (!pronto) return;
    const conversazioni = elencoConversazioni();
    const attuali = new Map<string, number>();
    for (const c of conversazioni) attuali.set(c.id, c.nonLetti);

    const precedenti = precedentiRef.current;
    if (precedenti) {
      const primoNome = nomePersonaCorrente?.trim().split(/\s+/)[0];
      for (const c of conversazioni) {
        const prima = precedenti.get(c.id) ?? 0;
        if (c.nonLetti > prima) {
          // ★ NUOVA (2026-09-09, proposta 4) — un messaggio diretto (non
          // di gruppo) o una menzione esplicita ("@Nome") dentro un
          // gruppo affollato merita un tono diverso dal ronzio generico
          // di un gruppo che chiacchiera tra sé — l'orecchio distingue da
          // solo cosa richiede attenzione subito.
          const menzionato = !!primoNome && !!c.ultimoTesto && new RegExp(`@${primoNome}`, "i").test(c.ultimoTesto);
          const urgente = c.diretta || menzionato;
          if (urgente) suonaAvvisoUrgente();
          else suonaAvvisoChat();

          if (document.visibilityState !== "visible" || !document.hasFocus()) {
            const corpo = c.ultimoTesto || (c.ultimoAllegatoNome ? `📎 ${c.ultimoAllegatoNome}` : "Nuovo messaggio");
            mostraNotificaDesktopChat(c.nome, corpo);
          }
        }
      }
    }
    precedentiRef.current = attuali;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- elencoConversazioni() legge già persone/gruppi, entrambe già tra le dipendenze; è solo una funzione di supporto, non un valore esterno da tracciare a parte.
  }, [persone, gruppi, pronto, nomePersonaCorrente]);

  // ★ NUOVA (2026-09-09, proposta 2 — "ti sei perso N messaggi") — quando
  // la scheda torna in primo piano dopo essere stata nascosta, riassume
  // in un solo toast quanti messaggi sono arrivati nel frattempo e da chi,
  // invece di lasciare che l'utente lo scopra solo aprendo la Chat per
  // curiosità. Un pulsante "Apri Chat" nel toast porta dritto lì.
  useEffect(() => {
    function alCambioVisibilita() {
      if (document.visibilityState === "hidden") {
        nascostoDaRef.current = precedentiRef.current ? new Map(precedentiRef.current) : new Map();
        return;
      }
      const primaDiNascondersi = nascostoDaRef.current;
      nascostoDaRef.current = null;
      if (!primaDiNascondersi) return;

      const conversazioni = conversazioniRef.current;
      const nuoveVoci: { nome: string; delta: number }[] = [];
      let totale = 0;
      for (const c of conversazioni) {
        const prima = primaDiNascondersi.get(c.id) ?? 0;
        const delta = c.nonLetti - prima;
        if (delta > 0) {
          nuoveVoci.push({ nome: c.nome, delta });
          totale += delta;
        }
      }
      if (totale === 0) return;

      const nomi = nuoveVoci.map((v) => v.nome);
      const daChi = nomi.length <= 2 ? nomi.join(" e ") : `${nomi.slice(0, 2).join(", ")} e altri`;
      toast(
        `Bentornato — ${totale} ${totale === 1 ? "messaggio" : "messaggi"} da ${daChi} mentre eri via.`,
        "info",
        { testo: "Apri Chat", onClick: apriPopup }
      );
    }
    document.addEventListener("visibilitychange", alCambioVisibilita);
    return () => document.removeEventListener("visibilitychange", alCambioVisibilita);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- legge sempre i dati più freschi tramite le closure di elencoConversazioni()/precedentiRef, non serve riattaccare il listener a ogni cambio di persone/gruppi.
  }, [pronto]);

  return null;
}
