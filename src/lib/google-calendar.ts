import { google } from "googleapis";

// ★ un solo calendario Google condiviso (account di servizio, non un
// login per persona): ogni Appuntamento creato qui diventa un evento
// visibile a tutti su Google Calendar/telefono. Non blocca mai il
// flusso principale — se Google non è configurato o la chiamata fallisce,
// l'appuntamento resta comunque salvato nel gestionale.
function client() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const chiavePrivata = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!email || !chiavePrivata || !calendarId) {
    console.error("Google Calendar: variabili d'ambiente mancanti", {
      haEmail: !!email,
      haChiave: !!chiavePrivata,
      haCalendarId: !!calendarId,
    });
    return null;
  }

  const chiave = normalizzaChiavePrivata(chiavePrivata);
  const auth = new google.auth.JWT({
    email,
    key: chiave,
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return { calendar: google.calendar({ version: "v3", auth }), calendarId };
}

// ★ la chiave privata passa attraverso più copia-incolla (file JSON → chat
// → form di Vercel) prima di arrivare qui: normalizza le forme più comuni
// in cui può arrivare rovinata — compreso il caso, facile da sbagliare, in
// cui è finito l'intero file JSON del service account invece del solo
// campo "private_key" — invece di richiedere un formato esatto.
function normalizzaChiavePrivata(chiave: string): string {
  let k = chiave.trim();

  if (k.startsWith("{")) {
    try {
      const json = JSON.parse(k);
      if (typeof json.private_key === "string") k = json.private_key;
    } catch {
      // non era JSON valido, si prosegue con il valore così com'è.
    }
  }

  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  if (k.includes("\\n")) {
    k = k.replace(/\\n/g, "\n");
  }
  return k.trim() + "\n";
}

export async function creaEventoCalendario(dati: {
  titolo: string;
  indirizzo: string | null;
  note: string | null;
  dataOraInizio: string;
  durataMinuti: number;
}): Promise<string | null> {
  const c = client();
  if (!c) return null;

  try {
    const inizio = new Date(dati.dataOraInizio);
    const fine = new Date(inizio.getTime() + dati.durataMinuti * 60_000);
    const { data } = await c.calendar.events.insert({
      calendarId: c.calendarId,
      requestBody: {
        summary: dati.titolo,
        location: dati.indirizzo || undefined,
        description: dati.note || undefined,
        start: { dateTime: inizio.toISOString(), timeZone: "Europe/Rome" },
        end: { dateTime: fine.toISOString(), timeZone: "Europe/Rome" },
      },
    });
    return data.id ?? null;
  } catch (err) {
    console.error("Google Calendar: creazione evento fallita", err);
    return null;
  }
}

export async function aggiornaEventoCalendario(
  eventoId: string,
  campi: {
    summary?: string;
    status?: "confirmed" | "cancelled";
    location?: string | null;
    note?: string | null;
    dataOraInizio?: string;
    durataMinuti?: number;
  }
) {
  const c = client();
  if (!c) return;
  try {
    if (campi.status === "cancelled") {
      await c.calendar.events.delete({ calendarId: c.calendarId, eventId: eventoId });
      return;
    }
    const requestBody: Record<string, unknown> = {};
    if (campi.summary !== undefined) requestBody.summary = campi.summary;
    if (campi.location !== undefined) requestBody.location = campi.location || undefined;
    if (campi.note !== undefined) requestBody.description = campi.note || undefined;
    if (campi.dataOraInizio && campi.durataMinuti) {
      const inizio = new Date(campi.dataOraInizio);
      const fine = new Date(inizio.getTime() + campi.durataMinuti * 60_000);
      requestBody.start = { dateTime: inizio.toISOString(), timeZone: "Europe/Rome" };
      requestBody.end = { dateTime: fine.toISOString(), timeZone: "Europe/Rome" };
    }
    await c.calendar.events.patch({
      calendarId: c.calendarId,
      eventId: eventoId,
      requestBody,
    });
  } catch (err) {
    console.error("Google Calendar: aggiornamento evento fallito", err);
  }
}
