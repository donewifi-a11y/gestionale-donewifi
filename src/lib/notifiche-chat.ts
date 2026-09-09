"use client";

// ★ NUOVA (2026-09-09, richiesta esplicita: "vorrei che le notifiche delle
// chat siano molto più visibili") — prima l'unico avviso era un piccolo
// numero rosso sul pulsante "Chat" della sidebar, facile da non notare su
// un'altra scheda del browser o concentrati su un'altra pagina. Qui tre
// canali indipendenti, orchestrati da components/chat/notifiche-chat.tsx:
// un suono, una notifica desktop del sistema operativo (solo quando la
// scheda non è in primo piano — altrimenti sarebbe un popup sopra quello
// che si sta già guardando) e un badge sul titolo/favicon della scheda,
// sempre visibile anche tra tante altre schede aperte.

let contestoAudio: AudioContext | null = null;

/** Un breve "ping" sintetizzato con Web Audio API — nessun file audio da
 * scaricare o mantenere, funziona ovunque. I browser sospendono l'audio
 * finché l'utente non ha interagito almeno una volta con la pagina: dato
 * che serve già un login/click per arrivare qui, in pratica non è mai un
 * problema — se lo fosse, fallisce in silenzio senza bloccare il resto. */
export function suonaAvvisoChat() {
  try {
    if (!contestoAudio) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      contestoAudio = new Ctor();
    }
    const ctx = contestoAudio;
    if (ctx.state === "suspended") ctx.resume();
    const oscillatore = ctx.createOscillator();
    const guadagno = ctx.createGain();
    oscillatore.connect(guadagno);
    guadagno.connect(ctx.destination);
    oscillatore.type = "sine";
    oscillatore.frequency.setValueAtTime(880, ctx.currentTime);
    oscillatore.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
    guadagno.gain.setValueAtTime(0.0001, ctx.currentTime);
    guadagno.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.01);
    guadagno.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    oscillatore.start(ctx.currentTime);
    oscillatore.stop(ctx.currentTime + 0.3);
  } catch {
    // ambiente senza Web Audio (raro) — niente suono, non blocca il resto.
  }
}

/** Il permesso va richiesto da un vero click dell'utente, non in automatico
 * al caricamento — i browser moderni ignorano/silenziano le richieste non
 * legate a un'interazione. Vedi il banner in chat-panel.tsx. */
export function richiediPermessoNotificheChat(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return Promise.resolve("denied");
  return Notification.requestPermission();
}

export function permessoNotificheChat(): NotificationPermission | "non-supportato" {
  if (typeof window === "undefined" || !("Notification" in window)) return "non-supportato";
  return Notification.permission;
}

export function mostraNotificaDesktopChat(titolo: string, corpo: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  try {
    // ★ `tag` fisso: un secondo messaggio mentre il primo popup è ancora
    // visibile lo sostituisce invece di impilarsi — meno rumore, sempre
    // l'ultimo testo arrivato.
    const notifica = new Notification(titolo, { body: corpo, icon: "/icon.png", tag: "chat-donewifi" });
    notifica.onclick = () => {
      window.focus();
      notifica.close();
    };
  } catch {
    // ambienti senza supporto pieno (es. iOS Safari) — nessun crash.
  }
}

/** Toglie un eventuale badge "(N) " già presente prima di aggiungerne uno
 * nuovo — così funziona a prescindere dal titolo che ogni pagina imposta
 * per sé (es. "Ticket #83 · Gestionale Done Wifi"), senza doverlo
 * conoscere qui. */
export function aggiornaTitoloNonLetti(count: number) {
  if (typeof document === "undefined") return;
  const base = document.title.replace(/^\(\d+\+?\)\s*/, "") || "Gestionale Done Wifi";
  document.title = count > 0 ? `(${count > 99 ? "99+" : count}) ${base}` : base;
}

let hrefFaviconOriginali: string[] | null = null;
let immagineFaviconBase: HTMLImageElement | null = null;

function caricaImmagineFaviconBase(): Promise<HTMLImageElement> {
  if (immagineFaviconBase) return Promise.resolve(immagineFaviconBase);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      immagineFaviconBase = img;
      resolve(img);
    };
    img.onerror = reject;
    img.src = "/icon.png";
  });
}

async function disegnaFaviconConBadge(count: number): Promise<string> {
  const img = await caricaImmagineFaviconBase();
  const lato = 64;
  const canvas = document.createElement("canvas");
  canvas.width = lato;
  canvas.height = lato;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas non disponibile");
  ctx.drawImage(img, 0, 0, lato, lato);

  const raggio = lato * 0.32;
  const cx = lato - raggio * 0.85;
  const cy = raggio * 0.85;
  ctx.beginPath();
  ctx.arc(cx, cy, raggio, 0, Math.PI * 2);
  ctx.fillStyle = "#CF000A";
  ctx.fill();
  ctx.lineWidth = lato * 0.05;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${raggio * 1.1}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(count > 9 ? "9+" : String(count), cx, cy + raggio * 0.05);

  return canvas.toDataURL("image/png");
}

/** Sovrascrive l'href dei `<link rel="icon">` già in pagina (generati da
 * Next.js dalla convenzione file `src/app/icon.png`) con una versione
 * disegnata al volo con un pallino rosso e il numero — e la ripristina
 * quando i non letti tornano a zero. Un solo tentativo per volta: se il
 * disegno fallisce (raro, es. canvas bloccato da un'estensione) resta la
 * favicon originale invece di restare senza nulla. */
export async function aggiornaFaviconNonLetti(count: number) {
  if (typeof document === "undefined") return;
  const link = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
  if (link.length === 0) return;
  if (!hrefFaviconOriginali) hrefFaviconOriginali = Array.from(link).map((l) => l.href);

  if (count <= 0) {
    link.forEach((l, i) => (l.href = hrefFaviconOriginali![i]));
    return;
  }
  try {
    const dataUrl = await disegnaFaviconConBadge(count);
    link.forEach((l) => (l.href = dataUrl));
  } catch {
    // vedi commento sopra — meglio l'icona originale che nessuna icona.
  }
}
