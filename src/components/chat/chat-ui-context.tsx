"use client";

import { createContext, useContext } from "react";

interface ChatUi {
  /** Apre il pop-up Chat flottante (stesso richiamato dal pulsante in
   * fondo alla sidebar) — serve a chi non ha la rail fissa in vista
   * (sotto il breakpoint xl, vedi app-shell.tsx) per aprire una
   * conversazione da un altro punto della pagina, es. la striscia
   * "Comunicazioni" in home. */
  apriPopup: () => void;
}

const ChatUiContext = createContext<ChatUi>({ apriPopup: () => {} });

export function ChatUiProvider({ apriPopup, children }: { apriPopup: () => void; children: React.ReactNode }) {
  return <ChatUiContext.Provider value={{ apriPopup }}>{children}</ChatUiContext.Provider>;
}

export function useChatUi(): ChatUi {
  return useContext(ChatUiContext);
}
