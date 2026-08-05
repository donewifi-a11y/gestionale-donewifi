"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MessageCircle, X, ChevronLeft, Send, Paperclip, Users, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOnline } from "@/components/chat/online-context";
import {
  getContattiChat,
  getOrCreaConversazioneDiretta,
  getMessaggi,
  inviaMessaggio,
  inviaAllegatoChat,
  urlAllegatoChat,
  segnaConversazioneLetta,
  getUltimaLetturaAltro,
  type ContattoChat,
  type GruppoChat,
} from "@/app/(app)/chat/actions";
import type { MessaggioChat } from "@/lib/types";

interface Thread {
  conversazioneId: string;
  titolo: string;
  isGruppo: boolean;
  altraPersonaId: string | null;
}

/** ★ ESTRATTO — contenuto della chat, separato dal "come" viene mostrato
 * (prima solo un pulsante flottante sempre in vista, "troppi pulsanti in
 * giro" secondo l'utente). Lo stesso contenuto ora serve sia il pop-up
 * richiamabile dalla sidebar (`ChatPopup`) sia il riquadro fisso nella
 * home (`variant="riquadro"`, dimensioni piene invece che a finestra). */
export function ChatPanel({
  personaCorrenteId,
  onChiudi,
  variant = "popup",
}: {
  personaCorrenteId: string | null;
  onChiudi?: () => void;
  variant?: "popup" | "riquadro";
}) {
  const [contatti, setContatti] = useState<{ persone: ContattoChat[]; gruppi: GruppoChat[] } | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [messaggi, setMessaggi] = useState<MessaggioChat[]>([]);
  const [letturaAltro, setLetturaAltro] = useState<string | null>(null);
  const [testo, setTesto] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const fineListaRef = useRef<HTMLDivElement>(null);
  const online = useOnline();
  // ★ FIX — ChatPanel può essere montata due volte insieme (riquadro fisso
  // in home + pop-up dalla sidebar): se l'utente apre la STESSA
  // conversazione in entrambe, due `.channel()` con lo stesso nome
  // otterrebbero lo stesso oggetto canale già sottoscritto dal client
  // Realtime di Supabase (li deduplica per nome) — stesso crash già
  // risolto per il canale di presenza. Qui, a differenza della presenza,
  // ogni istanza vuole la propria sottoscrizione indipendente (non c'è un
  // dato condiviso da mettere in comune), quindi basta un suffisso univoco
  // per istanza nel nome del canale — il filtro `conversazione_id` nel
  // payload resta invariato, cambia solo il nome usato per evitare la
  // deduplicazione.
  const istanzaId = useId();

  useEffect(() => {
    if (!contatti) getContattiChat().then(setContatti);
  }, [contatti]);

  useEffect(() => {
    fineListaRef.current?.scrollIntoView({ block: "end" });
  }, [messaggi]);

  // ★ un messaggio nuovo arriva qui via Realtime — sia per chi lo manda
  // che per chi lo riceve, invece di gestire due percorsi diversi. Se il
  // thread resta aperto, il nuovo messaggio si segna subito come letto.
  useEffect(() => {
    if (!thread) return;
    const supabase = createClient();
    const canale = supabase
      .channel(`chat-${thread.conversazioneId}-${istanzaId.replace(/\W/g, "")}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messaggi_chat", filter: `conversazione_id=eq.${thread.conversazioneId}` },
        (payload) => {
          setMessaggi((prev) => [...prev, payload.new as MessaggioChat]);
          segnaConversazioneLetta(thread.conversazioneId);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversazioni_letture", filter: `conversazione_id=eq.${thread.conversazioneId}` },
        (payload) => {
          const riga = payload.new as { persona_id: string; ultimo_letto_il: string };
          if (thread.altraPersonaId && riga.persona_id === thread.altraPersonaId) setLetturaAltro(riga.ultimo_letto_il);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canale);
    };
  }, [thread, istanzaId]);

  async function apriThread(t: Thread) {
    setLetturaAltro(null);
    setMessaggi(await getMessaggi(t.conversazioneId));
    setThread(t);
    segnaConversazioneLetta(t.conversazioneId);
    if (t.altraPersonaId) setLetturaAltro(await getUltimaLetturaAltro(t.conversazioneId, t.altraPersonaId));
  }

  async function apriDiretta(persona: ContattoChat) {
    const risultato = await getOrCreaConversazioneDiretta(persona.id);
    if (risultato.errore || !risultato.id) {
      alert(risultato.errore || "Errore imprevisto.");
      return;
    }
    await apriThread({ conversazioneId: risultato.id, titolo: persona.nome, isGruppo: false, altraPersonaId: persona.id });
  }

  async function apriGruppo(gruppo: GruppoChat) {
    await apriThread({ conversazioneId: gruppo.id, titolo: gruppo.reparto, isGruppo: true, altraPersonaId: null });
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

  const dimensioni = variant === "popup" ? "h-[480px] w-80" : "h-[420px] w-full";

  return (
    <div className={`flex ${dimensioni} flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl`}>
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2.5">
        {thread && (
          <button onClick={() => setThread(null)} className="rounded-md p-1 hover:bg-muted" aria-label="Indietro">
            <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )}
        <span className="flex flex-1 items-center gap-1.5 truncate text-sm font-bold">
          <MessageCircle className="h-3.5 w-3.5 text-primary" strokeWidth={2.25} />
          {thread ? thread.titolo : "Chat"}
          {thread && !thread.isGruppo && thread.altraPersonaId && (
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${online.has(thread.altraPersonaId) ? "bg-success" : "bg-muted-foreground/40"}`}
              title={online.has(thread.altraPersonaId) ? "Online" : "Offline"}
            />
          )}
        </span>
        {onChiudi && (
          <button onClick={() => { onChiudi(); setThread(null); }} className="rounded-md p-1 hover:bg-muted" aria-label="Chiudi">
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )}
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
                  <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                    {p.nome.slice(0, 2).toUpperCase()}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${online.has(p.id) ? "bg-success" : "bg-muted-foreground/40"}`}
                    />
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
              {messaggi.map((m, i) => {
                const mio = m.mittente_id === personaCorrenteId;
                const ultimoMio = mio && !messaggi.slice(i + 1).some((x) => x.mittente_id === personaCorrenteId);
                const letto = ultimoMio && !thread.isGruppo && !!letturaAltro && new Date(letturaAltro) >= new Date(m.creato_il);
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
                    {ultimoMio && (
                      <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">{letto ? "Letto" : "Consegnato"}</span>
                    )}
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
  );
}
