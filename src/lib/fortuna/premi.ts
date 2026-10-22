export const BUCKET_PREMI = "fortuna-premi";

// NEXT_PUBLIC_*: viene sostituita a build-time, quindi vale sia nel server sia nel browser.
const BASE_PUBBLICA = `${process.env.NEXT_PUBLIC_FORTUNA_SUPABASE_URL}/storage/v1/object/public/${BUCKET_PREMI}/`;

/** Le 10 immagini storiche del vecchio sistema, caricate una volta nel bucket (cartella "predefiniti"). */
export const IMMAGINI_PREDEFINITE = Array.from({ length: 10 }, (_, i) => `${BASE_PUBBLICA}predefiniti/premio${i + 1}.png`);

/** Un'immagine è valida solo se sta nel nostro bucket (niente URL arbitrari nelle email ai clienti). */
export const immagineValida = (url: string) => url.startsWith(BASE_PUBBLICA);

export type RigaPremio = {
  chiave: string; // identificativo locale dell'editor
  id?: string; // presente se il premio esiste già nel database
  nome: string;
  immagine: string;
  percentuale: number;
  quantita: number | null; // null = illimitata
  rimanenti: number | null;
  emessi: number;
  firmati: number;
};

export type StatoCoupon = "emesso" | "contrattualizzato";

// ── date: il server gira in UTC, la campagna ragiona in ora italiana ──
const DATA_ROMA = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" });
export const formattaData = (iso: string | null) => (iso ? DATA_ROMA.format(new Date(iso)) : "—");

function offsetRomaMinuti(d: Date): number {
  const nome =
    new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", timeZoneName: "longOffset" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(nome);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** "2026-10-22T14:30" (ora di Roma, da input datetime-local) -> ISO UTC. */
export function daOraRoma(locale: string): string {
  const [d, t] = locale.split("T");
  const [y, mo, g] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  const ipotesi = Date.UTC(y, mo - 1, g, h, mi);
  return new Date(ipotesi - offsetRomaMinuti(new Date(ipotesi)) * 60_000).toISOString();
}

/** ISO UTC -> valore per input datetime-local in ora di Roma. */
export function versoOraRoma(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() + offsetRomaMinuti(d) * 60_000).toISOString().slice(0, 16);
}
