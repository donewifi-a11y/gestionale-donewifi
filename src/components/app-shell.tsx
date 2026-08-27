"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ChatWidget } from "@/components/chat/chat-widget";
import { ChatPanel } from "@/components/chat/chat-panel";
import { OnlineProvider } from "@/components/chat/online-context";
import { ChatDataProvider, useChatData } from "@/components/chat/chat-data-context";
import { ChatUiProvider } from "@/components/chat/chat-ui-context";
import { TodoWidget } from "@/components/todo/todo-widget";
import { TodoDataProvider, useTodoData } from "@/components/todo/todo-data-context";
import { ToastProvider } from "@/components/ui/toast";
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
            <AppShellCorpo
              email={email}
              persone={persone}
              personaCorrenteId={personaCorrenteId}
              personaAmministratore={personaAmministratore}
              personaReparti={personaReparti}
            >
              {children}
            </AppShellCorpo>
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
  const { nonLettiTotali } = useChatData();
  const { todo } = useTodoData();
  const todoDaFare = (todo ?? []).filter((t) => !t.fatto).length;

  return (
    // ★ NUOVA (2026-08-27, "facciamo la B" — Opzione B dell'artifact
    // "Layout Comunicazioni") — apriPopup esposto via contesto invece che
    // solo come prop della sidebar: la striscia "Comunicazioni" in home
    // (sotto xl, dove la rail qui sotto è nascosta) deve poter aprire lo
    // stesso pop-up senza passare per la sidebar.
    <ChatUiProvider apriPopup={() => setStrumentoAperto((s) => (s === "chat" ? null : "chat"))}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <AppSidebar
          email={email}
          persone={persone}
          personaCorrenteId={personaCorrenteId}
          personaAmministratore={personaAmministratore}
          personaReparti={personaReparti}
          onApriChat={() => setStrumentoAperto((s) => (s === "chat" ? null : "chat"))}
          onApriTodo={() => setStrumentoAperto((s) => (s === "todo" ? null : "todo"))}
          nonLettiChat={nonLettiTotali}
          todoDaFare={todoDaFare}
        />
        <main className="flex-1 bg-background p-5 [background-image:radial-gradient(900px_500px_at_100%_-10%,color-mix(in_oklch,var(--primary),transparent_85%),transparent_60%),radial-gradient(700px_420px_at_-5%_100%,color-mix(in_oklch,var(--success),transparent_92%),transparent_55%)] md:ml-72 md:p-8 xl:mr-[300px]">
          {children}
        </main>
        {/* ★ NUOVA — rail Comunicazioni fissa, sempre in vista su schermi
        ≥ xl (non solo in home): scelta esplicita dell'utente ("facciamo
        la B") per non dover tornare a Mondo Ticket per accorgersi di un
        messaggio. Sotto xl resta il pop-up di sempre (pulsante sidebar +
        la striscia "Comunicazioni" in home). */}
        {personaCorrenteId && (
          <aside className="fixed top-0 right-0 z-30 hidden h-screen w-[300px] flex-col border-l bg-card p-3 xl:flex print:hidden">
            <ChatPanel personaCorrenteId={personaCorrenteId} variant="rail" />
          </aside>
        )}
        <ChatWidget personaCorrenteId={personaCorrenteId} aperto={strumentoAperto === "chat"} onChiudi={() => setStrumentoAperto(null)} />
        <TodoWidget personaCorrenteId={personaCorrenteId} aperto={strumentoAperto === "todo"} onChiudi={() => setStrumentoAperto(null)} />
      </div>
    </ChatUiProvider>
  );
}
