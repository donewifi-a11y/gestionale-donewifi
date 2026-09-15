"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatWidget } from "@/components/chat/chat-widget";
import { ChatPanel } from "@/components/chat/chat-panel";
import { OnlineProvider } from "@/components/chat/online-context";
import { ChatDataProvider, useChatData } from "@/components/chat/chat-data-context";
import { NotificheChat } from "@/components/chat/notifiche-chat";
import { ChatUiProvider } from "@/components/chat/chat-ui-context";
import { TodoWidget } from "@/components/todo/todo-widget";
import { TodoDataProvider, useTodoData } from "@/components/todo/todo-data-context";
import { SegnalazioniDatiProvider, useSegnalazioniDati } from "@/components/segnalazioni/segnalazioni-dati-context";
import { ToastProvider } from "@/components/ui/toast";
import { usePersistedState } from "@/lib/use-persisted-state";
import { MessageCircle, PanelRightClose } from "lucide-react";
import type { AreaAccesso, Persona } from "@/lib/types";

/** ★ NUOVA — la sidebar da sola non basta più a contenere lo stato di "chat
 * o to-do aperti": prima ognuno gestiva la propria visibilità da solo
 * (due pulsanti flottanti sempre in vista, segnalato come "troppi
 * pulsanti in giro"). Ora un solo stato condiviso, sollevato qui, decide
 * quale pop-up è aperto — richiamati da un pulsante compatto nella
 * sidebar invece che due FAB permanenti.
 *
 * ★ FIX — `ChatDataProvider`/`TodoDataProvider` avvolgono tutto (sidebar +
 * contenuto + pop-up): un solo posto che tiene lo stato di conversazioni/
 * to-do, letto sia dal riquadro fisso in home sia dal pop-up sia dai badge
 * qui in sidebar — invece di ogni istanza per conto proprio, disallineate
 * tra loro. */
export function AppShell({
  email,
  persone,
  personaCorrenteId,
  personaAmministratore,
  personaReparti,
  children,
}: {
  email: string;
  persone: Persona[];
  personaCorrenteId: string | null;
  personaAmministratore: boolean;
  personaReparti: AreaAccesso[];
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <OnlineProvider personaCorrenteId={personaCorrenteId}>
        <ChatDataProvider personaCorrenteId={personaCorrenteId}>
          <TodoDataProvider personaCorrenteId={personaCorrenteId}>
            <SegnalazioniDatiProvider personaCorrenteId={personaCorrenteId}>
              <AppShellCorpo
                email={email}
                persone={persone}
                personaCorrenteId={personaCorrenteId}
                personaAmministratore={personaAmministratore}
                personaReparti={personaReparti}
              >
                {children}
              </AppShellCorpo>
            </SegnalazioniDatiProvider>
          </TodoDataProvider>
        </ChatDataProvider>
      </OnlineProvider>
    </ToastProvider>
  );
}

function AppShellCorpo({
  email,
  persone,
  personaCorrenteId,
  personaAmministratore,
  personaReparti,
  children,
}: {
  email: string;
  persone: Persona[];
  personaCorrenteId: string | null;
  personaAmministratore: boolean;
  personaReparti: AreaAccesso[];
  children: React.ReactNode;
}) {
  const [strumentoAperto, setStrumentoAperto] = useState<"chat" | "todo" | null>(null);
  // ★ NUOVA (2026-09-15, richiesta esplicita: "voglio anche alleggerire il
  // colpo visivo perché così è caotico e mi viene ansia a guardare" —
  // proposta con artifact "Bacheca Ticket, Ridisegnata", principio "un
  // pannello fisso compete sempre con il contenuto principale") — la rail
  // Chat occupava sempre 300px anche a conversazione ferma da giorni.
  // Richiudibile a striscia sottile (stesso principio della sidebar app di
  // Zendesk): un pallino segna i non letti anche da chiusa, così restare
  // chiusa non nasconde un messaggio nuovo. Ricordato per browser, non per
  // sessione — chi la chiude una volta la vuole chiusa anche il giorno dopo.
  const [railChat, aggiornaRailChat] = usePersistedState("rail-chat-compressa", { compressa: false });
  const { nonLettiTotali } = useChatData();
  const { conteggio: nuoviDatiSegnalazioni } = useSegnalazioniDati();
  const { todo } = useTodoData();
  const todoDaFare = (todo ?? []).filter((t) => !t.fatto).length;
  // ★ NUOVA (2026-09-09, "procedi con tutte" — proposta 4: suono diverso
  // per una menzione) — serve il proprio nome per riconoscere "@Nome"
  // dentro un messaggio di gruppo, vedi notifiche-chat.tsx.
  const nomePersonaCorrente = persone.find((p) => p.id === personaCorrenteId)?.nome ?? null;

  return (
    // ★ NUOVA (2026-08-27, "facciamo la B" — Opzione B dell'artifact
    // "Layout Comunicazioni") — apriPopup esposto via contesto invece che
    // solo come prop della sidebar: la striscia "Comunicazioni" in home
    // (sotto xl, dove la rail qui sotto è nascosta) deve poter aprire lo
    // stesso pop-up senza passare per la sidebar.
    <ChatUiProvider apriPopup={() => setStrumentoAperto((s) => (s === "chat" ? null : "chat"))}>
      <NotificheChat nomePersonaCorrente={nomePersonaCorrente} />
      <div className="flex min-h-screen flex-col md:flex-row">
        <AppSidebar
          email={email}
          persone={persone}
          personaCorrenteId={personaCorrenteId}
          personaAmministratore={personaAmministratore}
          personaReparti={personaReparti}
          nuoviDatiSegnalazioni={nuoviDatiSegnalazioni}
          onApriChat={() => setStrumentoAperto((s) => (s === "chat" ? null : "chat"))}
          onApriTodo={() => setStrumentoAperto((s) => (s === "todo" ? null : "todo"))}
          nonLettiChat={nonLettiTotali}
          todoDaFare={todoDaFare}
        />
        <main
          className={`flex-1 bg-background p-5 [background-image:radial-gradient(900px_500px_at_100%_-10%,color-mix(in_oklch,var(--primary),transparent_85%),transparent_60%),radial-gradient(700px_420px_at_-5%_100%,color-mix(in_oklch,var(--success),transparent_92%),transparent_55%)] md:ml-72 md:p-8 ${
            railChat.compressa ? "xl:mr-12" : "xl:mr-[300px]"
          }`}
        >
          {children}
        </main>
        {/* ★ NUOVA — rail Comunicazioni fissa, sempre in vista su schermi
        ≥ xl (non solo in home): scelta esplicita dell'utente ("facciamo
        la B") per non dover tornare a Mondo Ticket per accorgersi di un
        messaggio. Sotto xl resta il pop-up di sempre (pulsante sidebar +
        la striscia "Comunicazioni" in home).
        ★ ESTESA (2026-09-15) — richiudibile a striscia da 48px, vedi
        `railChat` sopra: il pallino resta visibile anche chiusa, il resto
        del pannello no. */}
        {personaCorrenteId && (
          <aside
            className={`fixed top-0 right-0 z-30 hidden h-screen flex-col border-l bg-card print:hidden xl:flex ${
              railChat.compressa ? "w-12 items-center p-2 pt-3" : "w-[300px] p-3"
            }`}
          >
            {railChat.compressa ? (
              <button
                type="button"
                onClick={() => aggiornaRailChat({ compressa: false })}
                title="Apri la Chat"
                aria-label={`Apri la Chat${nonLettiTotali > 0 ? ` — ${nonLettiTotali} non letti` : ""}`}
                className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <MessageCircle className="h-4 w-4" strokeWidth={2.25} />
                {nonLettiTotali > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
                )}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => aggiornaRailChat({ compressa: true })}
                  title="Comprimi la Chat"
                  aria-label="Comprimi la Chat"
                  className="mb-1.5 flex h-6 w-6 shrink-0 items-center justify-center self-end rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <PanelRightClose className="h-3.5 w-3.5" strokeWidth={2.25} />
                </button>
                <ChatPanel personaCorrenteId={personaCorrenteId} variant="rail" />
              </>
            )}
          </aside>
        )}
        <ChatWidget personaCorrenteId={personaCorrenteId} aperto={strumentoAperto === "chat"} onChiudi={() => setStrumentoAperto(null)} />
        <TodoWidget personaCorrenteId={personaCorrenteId} aperto={strumentoAperto === "todo"} onChiudi={() => setStrumentoAperto(null)} />
      </div>
    </ChatUiProvider>
  );
}
