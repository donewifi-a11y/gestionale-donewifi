import type { RapportinoIntervento, SchedaLavoro, MaterialeUsato } from "@/lib/types";

// ★ NUOVA (2026-08-26) — richiesta esplicita: "i rapporti di lavoro
// generassero un testo completo, partendo dai dati inseriti". Funzioni
// pure (nessun accesso al DB): dai campi già salvati compongono un
// paragrafo leggibile in italiano, invece dei soli campi elencati uno per
// uno (come mostrano oggi RapportinoVista/SchedaVista). Usate in due punti
// (entrambi confermati dall'utente): la scheda vista dallo staff nel
// gestionale interno, e l'email di chiusura al cliente — ricalcolato al
// volo da chi legge, non salvato una volta sola: se un giorno si volesse
// affinare la formulazione, cambia per tutte le schede già scritte, non
// solo per quelle future.
function elencoMateriali(materiali: MaterialeUsato[]): string {
  if (!materiali || materiali.length === 0) return "";
  return materiali.map((m) => `${m.nome}${m.quantita > 1 ? ` (×${m.quantita})` : ""}`).join(", ");
}

function frase(condizione: unknown, testo: string): string {
  return condizione ? `${testo} ` : "";
}

/** Rapportino di chiusura Ticket (assistenza generica, non legato a un appuntamento). */
export function generaTestoRapportino(r: Pick<RapportinoIntervento, "esito" | "lavori_svolti" | "materiali">): string {
  let testo = `Esito dell'intervento: ${r.esito}. `;
  testo += frase(r.lavori_svolti, `Lavori svolti: ${r.lavori_svolti}.`);
  testo += frase(r.materiali, `Materiali utilizzati: ${r.materiali}.`);
  return testo.trim();
}

/** Scheda di Installazione o Lavorazione tecnica (legata a un appuntamento). */
export function generaTestoScheda(
  s: Pick<
    SchedaLavoro,
    | "tipo"
    | "esito"
    | "note"
    | "supporto"
    | "posizione"
    | "tipo_cavo"
    | "metri_cavo"
    | "bts"
    | "modello_cpe"
    | "mac"
    | "vlan"
    | "rssi"
    | "snr"
    | "router"
    | "ping_ms"
    | "download_mbps"
    | "upload_mbps"
    | "materiali"
    | "metodo_pagamento_posa"
    | "interventi_eseguiti"
  >
): string {
  const materiali = elencoMateriali(s.materiali);

  if (s.tipo === "Nuova installazione") {
    let testo = "Installazione certificata";
    testo += s.supporto ? ` su ${s.supporto.toLowerCase()}` : "";
    testo += s.posizione ? ` (${s.posizione})` : "";
    testo += ". ";

    const cablaggio: string[] = [];
    if (s.metri_cavo) cablaggio.push(`${s.metri_cavo} metri di cavo${s.tipo_cavo ? ` ${s.tipo_cavo}` : ""}`);
    if (s.bts) cablaggio.push(`agganciato alla BTS ${s.bts}`);
    if (cablaggio.length) testo += `Cablaggio: ${cablaggio.join(", ")}. `;

    const radio: string[] = [];
    if (s.modello_cpe) radio.push(`CPE ${s.modello_cpe}${s.mac ? ` (MAC ${s.mac})` : ""}`);
    if (s.router) radio.push(`router ${s.router}`);
    if (s.vlan) radio.push(`VLAN ${s.vlan}`);
    if (radio.length) testo += `Apparati: ${radio.join(", ")}. `;

    const collaudo: string[] = [];
    if (s.rssi != null) collaudo.push(`RSSI ${s.rssi} dBm`);
    if (s.snr != null) collaudo.push(`SNR ${s.snr} dB`);
    if (s.ping_ms != null) collaudo.push(`ping ${s.ping_ms} ms`);
    if (s.download_mbps != null) collaudo.push(`download ${s.download_mbps} Mbps`);
    if (s.upload_mbps != null) collaudo.push(`upload ${s.upload_mbps} Mbps`);
    if (collaudo.length) testo += `Collaudo: ${collaudo.join(", ")}. `;

    testo += frase(materiali, `Materiali utilizzati: ${materiali}.`);
    testo += frase(s.metodo_pagamento_posa, `Pagamento della posa: ${s.metodo_pagamento_posa}.`);
    testo += frase(s.note, `Note: ${s.note}.`);
    return testo.trim();
  }

  // "Lavorazione tecnica"
  let testo = "";
  testo += frase(s.interventi_eseguiti?.length, `Interventi eseguiti: ${(s.interventi_eseguiti ?? []).join(", ")}.`);
  testo += `Esito: ${s.esito ?? "—"}. `;
  testo += frase(materiali, `Materiali/consumi utilizzati: ${materiali}.`);
  testo += frase(s.metodo_pagamento_posa, `Pagamento della posa: ${s.metodo_pagamento_posa}.`);
  testo += frase(s.note, `Note per la sede centrale: ${s.note}.`);
  return testo.trim();
}
