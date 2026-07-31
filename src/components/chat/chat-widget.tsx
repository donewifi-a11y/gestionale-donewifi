"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, ChevronLeft, Send, Paperclip, Users, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getContattiChat,
  getOrCreaConversazioneDiretta,
  getMessaggi,
  inviaMessaggio,
  inviaAllegatoChat,
  urlAllegatoChat,
  type ContattoChat,
  type GruppoChat,
} from "@/app/(app)/chat/actions";
import type { MessaggioChat } from "@/lib/types";

interface Thread {
  conversazioneId: string;
  titolo: string;
  isGruppo: boolean;
}

export function ChatWidget({ personaCorrenteId }: { personaCorrenteId: string | null }) {
  const [aperto, setAperto] = useState(false);
  const [contatti, setContatti] = useState<{ persone: ContattoChat[]; gruppi: GruppoChat[] } | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [messaggi, setMessaggi] = useState<MessaggioChat[]>([]);
  const [testo, setTesto] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const fineListaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aperto && !contatti) getContattiChat().then(setContatti);
  }, [aperto, contatti]);

  useEffect(() => {
    fineListaRef.current?.scrollIntoView({ block: "end" });
  }, [messaggi]);

  // ★ un messaggio nuovo arriva qui via Realtime — sia per chi lo manda
  // che per chi lo riceve, invece di gestire due percorsi diversi.
  useEffect(() => {
    if (!thread) return;
    const supabase = createClient();
    const canale = supabase
      .channel(`chat-${thread.conversazioneId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messaggi_chat", filter: `conversazione_id=eq.${thread.conversazioneId}` },
        (payload) => setMessaggi((prev) => [...prev, payload.new as MessaggioChat])
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canale);
    };
  }, [thread]);

  async function apriDiretta(persona: ContattoChat) {
    const risultato = await getOrCreaConversazioneDiretta(persona.id);
    if (risultato.errore || !risultato.id) {
      alert(risultato.errore || "Errore imprevisto.");
      return;
    }
    setMessaggi(await getMessaggi(risultato.id));
    setThread({ conversazioneId: risultato.id, titolo: persona.nome, isGruppo: false });
  }

  async function apriGruppo(gruppo: GruppoChat) {
    setMessaggi(await getMessaggi(gruppo.id));
    setThread({ conversazioneId: gruppo.id, titolo: gruppo.reparto, isGruppo: true });
  }

  async function inviaTesto() {
    if (!testo.trim() || !thread) return;
    setInCorso(true);
    const risultato = await inviaMessaggio(thread.conversazioneId, testo);
    setInCorso(false);
    if (risultato.errore) {
      alert(risultato.errore);
      return;
    }
    setTesto("");
  }

  async function inviaFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !thread) return;
    setInCorso(true);
    const dati = new FormData();
    dati.set("file", file);
    const risultato = await inviaAllegatoChat(thread.conversazioneId, dati);
    setInCorso(false);
    e.target.value = "";
    if (risultato.errore) alert(risultato.errore);
  }

  async function apriAllegato(percorso: string) {
    const risultato = await urlAllegatoChat(percorso);
    if (risultato.errore || !risultato.url) {
      alert(risultato.errore || "Errore imprevisto.");
      return;
    }
    window.open(risultato.url, "_blank", "noopener,noreferrer");
  }

  function nomeMittente(mittenteId: string): string {
    if (mittenteId === personaCorrenteId) return "Tu";
    return contatti?.persone.find((p) => p.id === mittenteId)?.nome ?? "—";
  }

  if (!personaCorrenteId) return null;

  return (
    <div className="fixed bottom-5 right-5 z-40 print:hidden">
      {!aperto && (
        <button
          onClick={() => setAperto(true)}
          className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),black_20%)] text-primary-foreground shadow-lg shadow-primary/30 transition hover:-translate-y-0.5 hover:shadow-xl"
          aria-label="Apri chat"
        >
          <MessageCircle className="h-5 w-5" strokeWidth={2.25} />
        </button>
      )}

      {aperto && (
        <div className="flex h-[480px] w-80 flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2.5">
            {thread && (
              <button onClick={() => setThread(null)} className="rounded-md p-1 hover:bg-muted" aria-label="Indietro">
                <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
              </button>
            )}
            <span className="flex-1 truncate text-sm font-bold">{thread ? thread.titolo : "Chat"}</span>
            <button onClick={() => { setAperto(false); setThread(null); }} className="rounded-md p-1 hover:bg-muted" aria-label="Chiudi">
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>

          {!thread && (
            <div className="flex-1 overflow-y-auto p-2">
              {contatti && contatti.gruppi.length > 0 && (
                <>
                  <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Gruppi reparto</p>
                  {contatti.gruppi.map((g) => (
                    <button key={g.id} onClick={() => apriGruppo(g)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-muted/60">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                        <Users className="h-3.5 w-3.5" strokeWidth={2.25} />
                      </span>
                      {g.reparto}
                    </button>
                  ))}
                </>
              )}
              {contatti && contatti.persone.length > 0 && (
                <>
                  <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Persone</p>
                  {contatti.persone.map((p) => (
                    <button key={p.id} onClick={() => apriDiretta(p)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-muted/60">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                        {p.nome.slice(0, 2).toUpperCase()}
                      </span>
                      {p.nome}
                    </button>
                  ))}
                </>
              )}
              {!contatti && <p className="p-3 text-center text-xs text-muted-foreground">Caricamento...</p>}
            </div>
          )}

          {thread && (
            <>
              <div className="flex-1 overflow-y-auto p-3">
                {messaggi.length === 0 && <p className="text-center text-xs text-muted-foreground">Nessun messaggio ancora.</p>}
                <div className="flex flex-col gap-2">
                  {messaggi.map((m) => {
                    const mio = m.mittente_id === personaCorrenteId;
                    return (
                      <div key={m.id} className={`flex flex-col ${mio ? "items-end" : "items-start"}`}>
                        {thread.isGruppo && !mio && (
                          <span className="mb-0.5 px-1 text-[10px] font-semibold text-muted-foreground">{nomeMittente(m.mittente_id)}</span>
                        )}
                        <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${mio ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                          {m.testo}
                          {m.allegato_url && (
                            <button onClick={() => apriAllegato(m.allegato_url!)} className={`flex items-center gap-1.5 text-xs underline-offset-2 hover:underline ${m.testo ? "mt-1" : ""}`}>
                              <FileText className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                              {m.allegato_nome || "Allegato"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={fineListaRef} />
                </div>
              </div>
              <div className="flex items-center gap-1.5 border-t p-2">
                <label className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted">
                  <Paperclip className="h-4 w-4" strokeWidth={2.25} />
                  <input type="file" className="hidden" onChange={inviaFile} disabled={inCorso} />
                </label>
                <input
                  value={testo}
                  onChange={(e) => setTesto(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && inviaTesto()}
                  placeholder="Scrivi un messaggio..."
                  disabled={inCorso}
                  className="h-8 flex-1 rounded-full border bg-background px-3 text-sm"
                />
                <button
                  onClick={inviaTesto}
                  disabled={inCorso || !testo.trim()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition disabled:opacity-40"
                  aria-label="Invia"
                >
                  <Send className="h-3.5 w-3.5" strokeWidth={2.25} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
