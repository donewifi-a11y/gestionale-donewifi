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
  if (!email || !chiavePrivata || !calendarId) return null;

  const auth = new google.auth.JWT({
    email,
    key: chiavePrivata.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return { calendar: google.calendar({ version: "v3", auth }), calendarId };
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
  } catch {
    return null;
  }
}

export async function aggiornaEventoCalendario(eventoId: string, campi: { summary?: string; status?: "confirmed" | "cancelled" }) {
  const c = client();
  if (!c) return;
  try {
    if (campi.status === "cancelled") {
      await c.calendar.events.delete({ calendarId: c.calendarId, eventId: eventoId });
      return;
    }
    await c.calendar.events.patch({
      calendarId: c.calendarId,
      eventId: eventoId,
      requestBody: { summary: campi.summary },
    });
  } catch {
    // evento perso su Google, non bloccante — resta comunque nel gestionale.
  }
}
