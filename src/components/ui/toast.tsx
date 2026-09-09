"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type TipoToast = "errore" | "successo" | "info";

/** ★ NUOVA (2026-09-09, "procedi con tutte" — proposta 2 dell'artifact
 * "Notifiche in Azione": recap "ti sei perso N messaggi") — un pulsante
 * facoltativo dentro il toast, es. "Apri Chat". Facoltativo e in coda:
 * nessuna delle chiamate esistenti (solo messaggio+tipo) cambia comportamento. */
interface AzioneToast {
  testo: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  messaggio: string;
  tipo: TipoToast;
  azione?: AzioneToast;
}

interface ToastContextValue {
  mostra: (messaggio: string, tipo?: TipoToast, azione?: AzioneToast) => void;
}

const ToastContext = createContext<ToastContextValue>({ mostra: () => {} });

const STILE: Record<TipoToast, string> = {
  errore: "border-critical/30 bg-critical/10 text-critical",
  successo: "border-success/30 bg-success/10 text-success",
  info: "border-border bg-card text-foreground",
};

const ICONA: Record<TipoToast, typeof AlertTriangle> = {
  errore: AlertTriangle,
  successo: CheckCircle2,
  info: Info,
};

/** ★ FIX — 14 punti nel gestionale usavano `alert()` per mostrare un
 * errore: un popup nativo del browser che blocca l'interfaccia, in mezzo a
 * un pattern di errore inline altrimenti curato (banner rosso + icona,
 * vedi persone-board.tsx). Sostituiscono tutti quei punti — stessa firma
 * semplice di `alert(messaggio)`, ma non bloccante e coerente con il
 * resto del gestionale. Montato una sola volta in AppShell, come
 * Online/ChatData/TodoData Provider. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const mostra = useCallback((messaggio: string, tipo: TipoToast = "errore", azione?: AzioneToast) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, messaggio, tipo, azione }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  const rimuovi = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <ToastContext.Provider value={{ mostra }}>
      {children}
      {/* ★ in alto al centro: gli angoli in basso sono già occupati dai
      pop-up Chat/To-Do (bottom-5 left/right-5). */}
      <div className="pointer-events-none fixed left-1/2 top-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2 print:hidden">
        {toasts.map((t) => {
          const Icona = ICONA[t.tipo];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm shadow-2xl ${STILE[t.tipo]}`}
            >
              <Icona className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.25} />
              <span className="flex-1">{t.messaggio}</span>
              {t.azione && (
                <button
                  onClick={() => {
                    t.azione!.onClick();
                    rimuovi(t.id);
                  }}
                  className="shrink-0 whitespace-nowrap rounded-md bg-foreground/10 px-2 py-1 text-xs font-bold hover:bg-foreground/15"
                >
                  {t.azione.testo}
                </button>
              )}
              <button onClick={() => rimuovi(t.id)} className="shrink-0 rounded p-0.5 opacity-70 transition hover:opacity-100" aria-label="Chiudi">
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (messaggio: string, tipo?: TipoToast, azione?: AzioneToast) => void {
  return useContext(ToastContext).mostra;
}
