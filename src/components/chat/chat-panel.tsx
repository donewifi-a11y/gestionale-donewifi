"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MessageCircle, X, ChevronLeft, Send, Paperclip, Users, FileText, Bell, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOnline } from "@/components/chat/online-context";
import { useChatData } from "@/components/chat/chat-data-context";
import { useToast } from "@/components/ui/toast";
import {
  getOrCreaConversazioneDiretta,
  getMessaggi,
  inviaMessaggio,
  inviaAllegatoChat,
  urlAllegatoChat,
  segnaConversazioneLetta,
  getUltimaLetturaAltro,
  cercaMessaggiChat,
  type ContattoChat,
  type GruppoChat,
  type RisultatoRicercaChat,
} from "@/app/(app)/chat/actions";
import type { MessaggioChat } from "@/lib/types";

// ★ NUOVA — richiesta esplicita: le notifiche di sistema (Preventivo
// inviato, moduli cliente ricevuti, ecc.) ora includono un link diretto
// al Ticket/pratica interessata — prima restava testo semplice, non
// cliccabile, l'operatore doveva comunque uscire dalla Chat e cercarlo a
// mano. `testo` arriva sempre da fonti interne (notifiche automatiche),
// mai da input diretto del cliente, quindi non serve sanitizzare oltre
// l'escaping già automatico di React sulle parti di testo normale.
const REGEX_URL = /(https?:\/\/[^\s]+)/g;
function TestoMessaggio({ testo }: { testo: string }) {
  // ★ split() con un gruppo catturante intercala testo normale e URL
  // trovati: gli indici dispari sono sempre gli URL catturati, quelli
  // pari il testo attorno — niente bisogno di un secondo .test() (che con
  // il flag /g avrebbe comunque dato risultati sbagliati, avanzando
  // `lastIndex` ad ogni chiamata).
  const parti = testo.split(REGEX_URL);
  return (
    <>
      {parti.map((parte, i) =>
        i % 2 === 1 ? (
          <a key={i} href={parte} className="underline underline-offset-2 hover:opacity-80" onClick={(e) => e.stopPropagation()}>
            apri →
          </a>
        ) : (
          <span key={i}>{parte}</span>
        )
      )}
    </>
  );
}

interface Thread {
  conversazioneId: string;
  titolo: string;
  isGruppo: boolean;
  altraPersonaId: string | null;
}

function anteprimaTesto(testo: string | null, allegatoNome: string | null): string {
  if (testo) return testo;
  if (allegatoNome) return `📎 ${allegatoNome}`;
  return "Nessun messaggio ancora";
}

function oraBreve(iso: string): string {
  const d = new Date(iso);
  const oggi = new Date();
  const stessoGiorno = d.toDateString() === oggi.toDateString();
  return stessoGiorno
    ? d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

// ★ NUOVA (2026-09-04, richiesta esplicita: "nelle chat devi mettere data e
// ora se cambia il giorno, perché altrimenti non capisco se si legge") —
// prima un messaggio normale non mostrava nessun orario (solo "Letto"/
// "Consegnato" sotto l'ultimo mio): scorrendo una conversazione di più
// giorni non c'era alcun modo di capire quando fosse stato scritto cosa.
// Stesso principio di WhatsApp/Telegram: un separatore "Oggi"/"Ieri"/data
// solo quando il giorno cambia rispetto al messaggio precedente, più
// l'ora su ogni singolo messaggio (quella basta, il giorno lo dice già il
// separatore sopra).
function etichettaGiorno(iso: string): string {
  const d = new Date(iso);
  const oggi = new Date();
  const ieri = new Date(oggi);
  ieri.setDate(ieri.getDate() - 1);
  if (d.toDateString() === oggi.toDateString()) return "Oggi";
  if (d.toDateString() === ieri.toDateString()) return "Ieri";
  const testo = d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: d.getFullYear() === oggi.getFullYear() ? undefined : "numeric" });
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}

function oraSola(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

/** ★ ESTRATTO — contenuto della chat, separato dal "come" viene mostrato
 * (prima solo un pulsante flottante sempre in vista, "troppi pulsanti in
 * giro" secondo l'utente). Lo stesso contenuto ora serve sia il pop-up
 * richiamabile dalla sidebar (`ChatPopup`) sia il riquadro fisso nella
 * home (`variant="riquadro"`, dimensioni piene invece che a finestra).
 *
 * ★ NUOVA (2026-08-27, "facciamo la B" — Opzione B dell'artifact "Layout
 * Comunicazioni") — `variant="rail"`: stesso contenuto, ma alto quanto il
 * genitore invece di un'altezza fissa in pixel, per la colonna fissa a
 * destra sempre in vista (vedi app-shell.tsx) su schermi ≥ xl. */
export function ChatPanel({
  personaCorrenteId,
  onChiudi,
  variant = "popup",
}: {
  personaCorrenteId: string | null;
  onChiudi?: () => void;
  variant?: "popup" | "riquadro" | "rail";
}) {
  const { persone, gruppi, pronto, ricarica, sistemaId } = useChatData();
  const toast = useToast();
  const [thread, setThread] = useState<Thread | null>(null);
  const [messaggi, setMessaggi] = useState<MessaggioChat[]>([]);
  const [letturaAltro, setLetturaAltro] = useState<string | null>(null);
  const [testo, setTesto] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const fineListaRef = useRef<HTMLDivElement>(null);
  const testoRef = useRef<HTMLTextAreaElement>(null);
  const online = useOnline();
  // ★ NUOVA (2026-08-27, richiesta esplicita: "ricerca nei messaggi") —
  // un'unica casella filtra sia l'elenco locale (nome persona/reparto,
  // istantaneo) sia, da 2 caratteri in su, cerca nel testo dei messaggi
  // passati (server, con un piccolo debounce per non interrogare ad ogni
  // tasto premuto).
  const [ricerca, setRicerca] = useState("");
  const [risultatiRicerca, setRisultatiRicerca] = useState<RisultatoRicercaChat[]>([]);
  const [cercando, setCercando] = useState(false);
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
    fineListaRef.current?.scrollIntoView({ block: "end" });
  }, [messaggi]);

  // ★ NUOVA — la textarea del messaggio cresce da sola col testo (fino al
  // `max-h-32` in CSS, poi scorre): altezza ricalcolata ad ogni carattere
  // digitato, azzerata prima per lasciare che il browser ricalcoli
  // `scrollHeight` per davvero (altrimenti, restringendo il testo, resta
  // "gonfia" alla dimensione massima raggiunta in precedenza).
  useEffect(() => {
    const el = testoRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [testo]);

  // ★ FIX — chiudere il pop-up a metà messaggio (per sbaglio, o per
  // aprire il pop-up To-Do dallo stesso pulsante sidebar) smontava
  // ChatPanel del tutto e perdeva il testo scritto senza nessun avviso.
  // Bozza salvata per conversazione in sessionStorage invece di un
  // conferma-prima-di-chiudere invasivo — stesso principio di WhatsApp
  // Web, non un popup in più da dover gestire.
  useEffect(() => {
    if (!thread) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizza con `thread` (si chiude/cambia dall'esterno), non derivabile durante il render.
      setTesto("");
      return;
    }
    try {
      setTesto(sessionStorage.getItem(`chat-bozza-${thread.conversazioneId}`) || "");
    } catch {}
  }, [thread]);

  useEffect(() => {
    if (!thread) return;
    try {
      if (testo) sessionStorage.setItem(`chat-bozza-${thread.conversazioneId}`, testo);
      else sessionStorage.removeItem(`chat-bozza-${thread.conversazioneId}`);
    } catch {}
  }, [testo, thread]);

  useEffect(() => {
    const query = ricerca.trim();
    if (query.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronizza con `ricerca` (cambia dall'esterno, l'utente scrive/cancella), non derivabile durante il render.
      setRisultatiRicerca([]);
      setCercando(false);
      return;
    }
    setCercando(true);
    const timer = setTimeout(() => {
      cercaMessaggiChat(query).then((righe) => {
        setRisultatiRicerca(righe);
        setCercando(false);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [ricerca]);

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
    setRicerca("");
    await segnaConversazioneLetta(t.conversazioneId);
    // ★ FIX — senza questa chiamata esplicita, il badge "non letti"
    // sull'altra istanza (o sul pulsante in sidebar) restava indietro
    // finché non arrivava l'evento Realtime della lettura — un attimo di
    // ritardo evitabile, visto che qui sappiamo già che è cambiato.
    ricarica();
    if (t.altraPersonaId) setLetturaAltro(await getUltimaLetturaAltro(t.conversazioneId, t.altraPersonaId));
  }

  /** Apre il thread di un risultato di ricerca — stessa `apriThread()` di
   * gruppi/dirette, non serve saltare al messaggio esatto: trovarlo dentro
   * un thread di poche decine di messaggi è comunque immediato. */
  function apriDaRicerca(risultato: RisultatoRicercaChat) {
    apriThread({
      conversazioneId: risultato.conversazioneId,
      titolo: risultato.titolo,
      isGruppo: risultato.isGruppo,
      altraPersonaId: risultato.altraPersonaId,
    });
  }

  async function apriDiretta(persona: ContattoChat) {
    let conversazioneId = persona.conversazioneId;
    if (!conversazioneId) {
      const risultato = await getOrCreaConversazioneDiretta(persona.id);
      if (risultato.errore || !risultato.id) {
        toast(risultato.errore || "Errore imprevisto.");
        return;
      }
      conversazioneId = risultato.id;
    }
    await apriThread({ conversazioneId, titolo: persona.nome, isGruppo: false, altraPersonaId: persona.id });
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
      toast(risultato.errore);
      return;
    }
    setTesto("");
  }

  async function inviaFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !thread) return;
    // ★ FIX (2026-09-04) — il limite (10MB, invariato) era controllato
    // lato server, dove ormai non arriva più il contenuto del file: va
    // ricontrollato qui, prima di tentare l'upload.
    if (file.size > 10 * 1024 * 1024) {
      toast("Il file supera i 10 MB.");
      return;
    }
    setInCorso(true);
    try {
      // ★ FIX (2026-09-04, bug reale: stesso limite di 1MB sul corpo di una
      // Server Action già trovato altrove nel gestionale) — il file vero si
      // carica qui, direttamente allo storage, prima di registrare il
      // messaggio: vedi api/chat/upload-url/route.ts e il commento gemello
      // su inviaAllegatoChat (chat/actions.ts).
      const rispostaUrl = await fetch("/api/chat/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversazioneId: thread.conversazioneId, nomeFile: file.name }),
      });
      const risultatoUrl = await rispostaUrl.json();
      if (!rispostaUrl.ok) throw new Error(risultatoUrl.errore || "Errore preparazione upload.");

      const supabase = createClient();
      const { error: erroreUpload } = await supabase.storage.from("documenti").uploadToSignedUrl(risultatoUrl.percorso, risultatoUrl.token, file);
      if (erroreUpload) throw new Error(erroreUpload.message);

      const risultato = await inviaAllegatoChat(thread.conversazioneId, risultatoUrl.percorso, file.name);
      if (risultato.errore) toast(risultato.errore);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Errore imprevisto durante l'invio dell'allegato.");
    } finally {
      setInCorso(false);
    }
  }

  async function apriAllegato(percorso: string) {
    const risultato = await urlAllegatoChat(percorso);
    if (risultato.errore || !risultato.url) {
      toast(risultato.errore || "Errore imprevisto.");
      return;
    }
    window.open(risultato.url, "_blank", "noopener,noreferrer");
  }

  function nomeMittente(mittenteId: string): string {
    if (mittenteId === personaCorrenteId) return "Tu";
    return persone.find((p) => p.id === mittenteId)?.nome ?? "—";
  }

  if (!personaCorrenteId) return null;

  // ★ FIX — altezza fissa in pixel (480px/460px): su un telefono con
  // schermo basso o in orizzontale poteva tagliare la lista messaggi o
  // spingere il campo di scrittura fuori dallo schermo. `min(…, Nvh)`
  // resta all'altezza piena su schermi normali ma si adatta a quelli
  // bassi invece di sforare.
  // ★ "riquadro" alzato a 460px (2026-08-27, spostata in cima alla home,
  // a tutta larghezza) — la casella di ricerca aggiunta sopra l'elenco
  // altrimenti avrebbe rosicchiato spazio ai messaggi visibili.
  const dimensioni = variant === "popup" ? "h-[min(480px,85vh)] w-80" : variant === "rail" ? "h-full w-full" : "h-[min(460px,70vh)] w-full";

  // ★ FIX — prima l'elenco era sempre "a chi scrivo" in ordine alfabetico,
  // senza distinguere conversazioni in corso da contatti mai sentiti.
  // Ordine: prima chi ha messaggi non letti, poi le conversazioni più
  // recenti, infine chi non ha ancora una conversazione (alfabetico, come
  // prima) — così le chat attive emergono subito invece di dover
  // ricordare a memoria con chi si stava parlando.
  function ordina<T extends { nonLetti: number; ultimoCreatoIl: string | null }>(righe: T[]): T[] {
    return [...righe].sort((a, b) => {
      if (a.nonLetti !== b.nonLetti) return b.nonLetti - a.nonLetti;
      if (a.ultimoCreatoIl && b.ultimoCreatoIl) return new Date(b.ultimoCreatoIl).getTime() - new Date(a.ultimoCreatoIl).getTime();
      if (a.ultimoCreatoIl) return -1;
      if (b.ultimoCreatoIl) return 1;
      return 0;
    });
  }
  const gruppiOrdinati = ordina(gruppi);
  const personeOrdinate = ordina(persone);

  // ★ NUOVA — filtro locale immediato per nome/reparto (nessuna chiamata
  // server, agisce sull'elenco già in memoria) — la ricerca nel testo dei
  // messaggi passati (server, con debounce) è un elenco separato sotto.
  const filtro = ricerca.trim().toLowerCase();
  const gruppiFiltrati = filtro ? gruppiOrdinati.filter((g) => g.reparto.toLowerCase().includes(filtro)) : gruppiOrdinati;
  const personeFiltrate = filtro ? personeOrdinate.filter((p) => p.nome.toLowerCase().includes(filtro)) : personeOrdinate;

  return (
    <div className={`flex ${dimensioni} flex-col overflow-hidden bg-card ${variant === "rail" ? "" : "rounded-2xl border shadow-2xl"}`}>

      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2.5">
        {thread && (
          <button onClick={() => setThread(null)} className="rounded-md p-1 hover:bg-muted" aria-label="Indietro">
            <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )}
        <span className="flex flex-1 items-center gap-1.5 truncate text-sm font-bold">
          <MessageCircle className="h-3.5 w-3.5 text-primary" strokeWidth={2.25} />
          {thread ? thread.titolo : "Chat"}
          {/* ★ FIX — solo un pallino colorato con `title` non basta: i
          tooltip `title` non compaiono sui dispositivi touch, quindi su
          telefono lo stato online/offline era di fatto solo colore, senza
          alternativa accessibile. Etichetta testuale sempre visibile,
          non solo al passaggio del mouse. */}
          {thread && !thread.isGruppo && thread.altraPersonaId && (
            <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium normal-case text-muted-foreground">
              <span className={`h-2 w-2 shrink-0 rounded-full ${online.has(thread.altraPersonaId) ? "bg-success" : "bg-muted-foreground/40"}`} />
              {online.has(thread.altraPersonaId) ? "Online" : "Offline"}
            </span>
          )}
        </span>
        {onChiudi && (
          <button onClick={() => { onChiudi(); setThread(null); }} className="rounded-md p-1 hover:bg-muted" aria-label="Chiudi">
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )}
      </div>

      {!thread && (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-1.5 border-b px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.25} />
            <input
              value={ricerca}
              onChange={(e) => setRicerca(e.target.value)}
              placeholder="Cerca persona, reparto o un vecchio messaggio..."
              className="h-6 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {ricerca && (
              <button onClick={() => setRicerca("")} className="rounded-md p-0.5 text-muted-foreground hover:bg-muted" aria-label="Cancella ricerca">
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {gruppiFiltrati.length > 0 && (
              <>
                <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Gruppi reparto</p>
                {gruppiFiltrati.map((g) => (
                  <button key={g.id} onClick={() => apriGruppo(g)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-muted/60">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                      <Users className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate ${g.nonLetti > 0 ? "font-bold" : ""}`}>{g.reparto}</span>
                      <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        {g.ultimoDaSistema && <Bell className="h-3 w-3 shrink-0 text-primary/70" strokeWidth={2.25} />}
                        <span className="truncate">{anteprimaTesto(g.ultimoTesto, g.ultimoAllegatoNome)}</span>
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {g.ultimoCreatoIl && <span className="text-[10px] text-muted-foreground">{oraBreve(g.ultimoCreatoIl)}</span>}
                      {g.nonLetti > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                          {g.nonLetti}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </>
            )}
            {personeFiltrate.length > 0 && (
              <>
                <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Persone</p>
                {personeFiltrate.map((p) => (
                  <button key={p.id} onClick={() => apriDiretta(p)} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-muted/60">
                    <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
                      {p.nome.slice(0, 2).toUpperCase()}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card ${online.has(p.id) ? "bg-success" : "bg-muted-foreground/40"}`}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate ${p.nonLetti > 0 ? "font-bold" : ""}`}>{p.nome}</span>
                      {p.conversazioneId && (
                        <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                          {p.ultimoDaSistema && <Bell className="h-3 w-3 shrink-0 text-primary/70" strokeWidth={2.25} />}
                          <span className="truncate">{anteprimaTesto(p.ultimoTesto, p.ultimoAllegatoNome)}</span>
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {p.ultimoCreatoIl && <span className="text-[10px] text-muted-foreground">{oraBreve(p.ultimoCreatoIl)}</span>}
                      {p.nonLetti > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                          {p.nonLetti}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </>
            )}

            {filtro.length >= 2 && (
              <>
                <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Messaggi {cercando && "· cercando..."}
                </p>
                {risultatiRicerca.length === 0 && !cercando && (
                  <p className="px-2.5 pb-2 text-xs text-muted-foreground">Nessun messaggio trovato.</p>
                )}
                {risultatiRicerca.map((r) => (
                  <button
                    key={r.messaggioId}
                    onClick={() => apriDaRicerca(r)}
                    className="flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left text-sm transition hover:bg-muted/60"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      {r.isGruppo ? <Users className="h-3 w-3 shrink-0" strokeWidth={2.25} /> : null}
                      {r.titolo}
                      <span className="font-normal">· {r.mittenteNome}</span>
                      <span className="ml-auto shrink-0 font-normal">{oraBreve(r.creatoIl)}</span>
                    </span>
                    <span className="truncate">{r.testo}</span>
                  </button>
                ))}
              </>
            )}

            {gruppiFiltrati.length === 0 && personeFiltrate.length === 0 && filtro.length > 0 && filtro.length < 2 && (
              <p className="p-3 text-center text-xs text-muted-foreground">Nessuna corrispondenza.</p>
            )}
            {!pronto && <p className="p-3 text-center text-xs text-muted-foreground">Caricamento...</p>}
          </div>
        </div>
      )}

      {thread && (
        <>
          <div className="flex-1 overflow-y-auto p-3">
            {messaggi.length === 0 && <p className="text-center text-xs text-muted-foreground">Nessun messaggio ancora.</p>}
            <div className="flex flex-col gap-2">
              {messaggi.map((m, i) => {
                // ★ NUOVA — vedi etichettaGiorno() sopra: confronta col
                // messaggio precedente (non con "adesso"), così il
                // separatore compare esattamente dove il giorno cambia
                // dentro la conversazione, non in base a quando la si sta
                // leggendo.
                const giornoCambiato = i === 0 || new Date(messaggi[i - 1].creato_il).toDateString() !== new Date(m.creato_il).toDateString();
                const separatore = giornoCambiato && (
                  <div key={`giorno-${m.id}`} className="my-1 flex justify-center">
                    <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {etichettaGiorno(m.creato_il)}
                    </span>
                  </div>
                );
                const daSistema = !!sistemaId && m.mittente_id === sistemaId;
                // ★ NUOVA (2026-08-27, richiesta esplicita: "distinguere i
                // messaggi automatici dai messaggi delle persone") — un
                // avviso di sistema (es. quello delle antenne, vedi
                // lib/notifiche-antenne.ts) non è una risposta di nessuno:
                // niente bolla a sinistra/destra come in una conversazione,
                // un cartellino centrato con un'icona campanella, subito
                // riconoscibile come "fatto avvenuto" invece che "qualcuno
                // ti ha scritto e aspetta una risposta".
                if (daSistema) {
                  return (
                    <div key={m.id}>
                      {separatore}
                      <div className="mx-auto flex max-w-[92%] items-start gap-1.5 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground/80">
                        <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" strokeWidth={2.25} />
                        <span className="min-w-0 flex-1 whitespace-pre-wrap">{m.testo && <TestoMessaggio testo={m.testo} />}</span>
                        {/* ★ ESTESA — vedi etichettaGiorno()/separatore
                        sopra: il giorno lo dice già il separatore, qui
                        basta l'ora, non più "oraBreve" (che da sola, senza
                        separatore, doveva anche dire il giorno). */}
                        <span className="shrink-0 text-[10px] text-muted-foreground">{oraSola(m.creato_il)}</span>
                      </div>
                    </div>
                  );
                }

                const mio = m.mittente_id === personaCorrenteId;
                const ultimoMio = mio && !messaggi.slice(i + 1).some((x) => x.mittente_id === personaCorrenteId);
                const letto = ultimoMio && !thread.isGruppo && !!letturaAltro && new Date(letturaAltro) >= new Date(m.creato_il);
                return (
                  <div key={m.id}>
                    {separatore}
                    <div className={`flex flex-col ${mio ? "items-end" : "items-start"}`}>
                      {thread.isGruppo && !mio && (
                        <span className="mb-0.5 px-1 text-[10px] font-semibold text-muted-foreground">{nomeMittente(m.mittente_id)}</span>
                      )}
                      <div className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm ${mio ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {m.testo && <TestoMessaggio testo={m.testo} />}
                        {m.allegato_url && (
                          <button onClick={() => apriAllegato(m.allegato_url!)} className={`flex items-center gap-1.5 text-xs underline-offset-2 hover:underline ${m.testo ? "mt-1" : ""}`}>
                            <FileText className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                            {m.allegato_nome || "Allegato"}
                          </button>
                        )}
                      </div>
                      {/* ★ ESTESA (2026-09-04, richiesta esplicita: "nelle
                      chat devi mettere data e ora se cambia il giorno,
                      perché altrimenti non capisco se si legge") — prima
                      solo l'ultimo messaggio mio aveva una didascalia
                      ("Letto"/"Consegnato"), tutti gli altri nessun orario:
                      ora c'è sempre, "Letto"/"Consegnato" si aggiunge solo
                      dov'era già (non ha senso su un messaggio che non è
                      né l'uno né l'altro). */}
                      <span className="mt-0.5 px-1 text-[10px] text-muted-foreground">
                        {oraSola(m.creato_il)}
                        {ultimoMio && ` · ${letto ? "Letto" : "Consegnato"}`}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={fineListaRef} />
            </div>
          </div>
          <div className="flex items-end gap-1.5 border-t p-2">
            <label className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted">
              <Paperclip className="h-4 w-4" strokeWidth={2.25} />
              <input type="file" className="hidden" onChange={inviaFile} disabled={inCorso} />
            </label>
            {/* ★ FIX (2026-09-04, "come possiamo migliorare la chat") — era
            un `<input>` a una riga sola: non si poteva mai scrivere un
            messaggio su più righe, mentre il testo dei messaggi già
            arrivati (TestoMessaggio, `whitespace-pre-wrap`) è pronto a
            mostrarle. `<textarea>` che cresce da sola fino a un massimo,
            Invio manda, Maiusc+Invio va a capo — stesso comportamento di
            WhatsApp Web/Slack. */}
            <textarea
              ref={testoRef}
              rows={1}
              value={testo}
              onChange={(e) => setTesto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  inviaTesto();
                }
              }}
              placeholder="Scrivi un messaggio..."
              disabled={inCorso}
              className="max-h-32 flex-1 resize-none rounded-2xl border bg-background px-3 py-1.5 text-sm leading-snug"
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
