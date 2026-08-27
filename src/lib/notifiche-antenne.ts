import { notificaSuTuttiICanali } from "@/lib/notifiche-interne";
import type { TipoServizioAppuntamento } from "@/lib/types";

// ★ NUOVA (2026-08-27, richiesta esplicita: "il rapporto di lavoro deve
// andare sul gestionale principale nella scheda del cliente in modo che
// poi venga inserito dall'operatore nel gestionale esterno delle
// antenne") — il gestionale esterno (dove vive la mappa/topologia della
// rete) non è integrato con questo sistema: l'unico modo di "farci
// arrivare" i dati è che un operatore li trascriva a mano. Qui si
// automatizza la parte che si può automatizzare — l'avviso, non serve
// controllare attivamente il gestionale per accorgersi che c'è lavoro da
// fare — e si lascia una coda di riserva (vedi
// getSchedeDaTrasferireAntenne() in materiali/actions.ts) per chi perde
// l'avviso in Chat o per un intervento fatto quando il sistema era giù.

/** Una Scheda "riguarda" il gestionale esterno delle antenne se installa
 * un'antenna nuova (sempre, per definizione, in una Nuova installazione)
 * o se una Lavorazione tecnica ha comunque toccato/sostituito il MAC
 * (altrimenti la stragrande maggioranza delle Lavorazioni — riavvii,
 * configurazioni — genererebbe avvisi inutili). */
export function schedaRiguardaGestionaleAntenne(tipo: TipoServizioAppuntamento, mac: string | null | undefined): boolean {
  return tipo === "Nuova installazione" || (tipo === "Lavorazione tecnica" && !!mac?.trim());
}

export interface DatiNotificaAntenna {
  cliente: string | null;
  ticketNumero: number | null;
  tipo: TipoServizioAppuntamento;
  mac: string | null;
  bts: string | null;
  modelloCpe: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
}

/** Avviso su tutti e 3 i canali (reparto Analisi Rete, già il gruppo che
 * gestisce l'inventario Antenne) con tutti i dati pronti per la
 * trascrizione — niente da riscrivere a mano dal resto della scheda, solo
 * copiare da qui.
 *
 * ★ ESTESA (2026-08-27, "fai la A" — Proposta A dell'artifact "Estensione
 * Notifiche") — prima solo Chat interna, ora anche Telegram ed email
 * verso attivazioni@donewifi.it, stesso trattamento di ogni altro evento. */
export async function notificaGestionaleAntenne(dati: DatiNotificaAntenna): Promise<void> {
  const titolo = `Dati per il gestionale antenne — ${dati.tipo === "Nuova installazione" ? "nuova installazione" : "sostituzione in una Lavorazione"} completata`;
  const righe: string[] = [];
  if (dati.cliente) righe.push(`Cliente: ${dati.cliente}${dati.ticketNumero ? ` (Ticket #${dati.ticketNumero})` : ""}`);
  if (dati.mac) righe.push(`MAC: ${dati.mac}`);
  if (dati.modelloCpe) righe.push(`Apparato: ${dati.modelloCpe}`);
  if (dati.bts) righe.push(`BTS: ${dati.bts}`);
  if (dati.gpsLat != null && dati.gpsLng != null) righe.push(`GPS: ${dati.gpsLat}, ${dati.gpsLng}`);
  const nota = `Trovi la scheda anche nella coda "Da trasferire" in Materiali → Antenne se serve rivederla dopo.`;

  await notificaSuTuttiICanali({
    reparto: "Analisi Rete",
    telegramHtml: `📡 <b>${titolo}</b>\n\n${righe.join("\n")}\n\n${nota}`,
    chatTesto: `📡 ${titolo}.\n${righe.join("\n")}\n${nota}`,
    emailTitolo: titolo,
    emailCorpoHtml: `<p style="font-size:15px;color:#141414;line-height:1.6;margin:0 0 6px;">${righe.join("<br>")}</p>`,
    emailCorpoTesto: righe.join("\n"),
    emailLink: "https://gestione.donewifi.it/materiali",
  });
}
