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
//
// ★ REDESIGN (2026-08-27, richiesta esplicita: "vorrei che il rapporto
// fosse un testo scritto e non un semplice elenco di dati ma un testo
// completo") — la prima versione componeva frasi del tipo "Cablaggio: X.
// Apparati: Y. Collaudo: Z.": un elenco etichettato travestito da prosa,
// non un vero testo. Qui ogni gruppo di campi diventa una frase con verbo
// e soggetto ("È stata montata...", "Il collegamento è stato realizzato
// con...", "In fase di collaudo sono stati rilevati..."), collegate in un
// paragrafo — le etichette (Cablaggio/Apparati/...) sparissero del tutto.

function elencoMateriali(materiali: MaterialeUsato[]): string {
  if (!materiali || materiali.length === 0) return "";
  return materiali.map((m) => `${m.nome}${m.quantita > 1 ? ` (×${m.quantita})` : ""}`).join(", ");
}

/** "a, b e c" — elenco all'italiana, mai con la virgola prima dell'ultimo. */
function elencoItaliano(elementi: string[]): string {
  const validi = elementi.filter(Boolean);
  if (validi.length === 0) return "";
  if (validi.length === 1) return validi[0];
  return `${validi.slice(0, -1).join(", ")} e ${validi[validi.length - 1]}`;
}

/** Chiude una frase con la maiuscola iniziale e un punto finale, senza
 * raddoppiarlo se il testo (es. un campo libero scritto dal tecnico) lo ha già. */
function frase(testo: string): string {
  const pulito = testo.trim();
  if (!pulito) return "";
  const conMaiuscola = pulito.charAt(0).toUpperCase() + pulito.slice(1);
  return /[.!?]$/.test(conMaiuscola) ? conMaiuscola : `${conMaiuscola}.`;
}

function testoMetodoPagamento(metodo: string): string {
  switch (metodo) {
    case "Contanti":
      return "in contanti";
    case "POS":
      return "tramite POS";
    case "In Fattura":
      return "in fattura";
    default:
      return metodo.toLowerCase();
  }
}

/** Rapportino di chiusura Ticket (assistenza generica, non legato a un appuntamento). */
export function generaTestoRapportino(r: Pick<RapportinoIntervento, "esito" | "lavori_svolti" | "materiali">): string {
  const frasi: string[] = [frase(r.esito)];
  if (r.lavori_svolti) frasi.push(frase(r.lavori_svolti));
  if (r.materiali) frasi.push(frase(`Sono stati utilizzati i seguenti materiali: ${r.materiali}`));
  return frasi.filter(Boolean).join(" ");
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
    const frasi: string[] = [frase(s.esito || "Installazione completata")];

    if (s.supporto) {
      const posizione = s.posizione ? `, in posizione ${s.posizione.toLowerCase()}` : "";
      frasi.push(frase(`È stata montata una ${s.supporto.toLowerCase()}${posizione}`));
    }

    {
      const cablaggio = s.metri_cavo ? `${s.metri_cavo} metri di cavo${s.tipo_cavo ? ` ${s.tipo_cavo}` : ""}` : "";
      if (cablaggio && s.bts) {
        frasi.push(frase(`Il collegamento è stato realizzato con ${cablaggio}, agganciato alla BTS di ${s.bts}`));
      } else if (cablaggio) {
        frasi.push(frase(`Il collegamento è stato realizzato con ${cablaggio}`));
      } else if (s.bts) {
        frasi.push(frase(`Il collegamento è agganciato alla BTS di ${s.bts}`));
      }
    }

    {
      const apparati: string[] = [];
      if (s.modello_cpe) apparati.push(`un CPE ${s.modello_cpe}${s.mac ? ` (MAC ${s.mac})` : ""}`);
      if (s.router) apparati.push(`un router ${s.router}`);
      if (s.vlan) apparati.push(`la VLAN ${s.vlan}`);
      if (apparati.length) frasi.push(frase(`Sono stati installati e configurati ${elencoItaliano(apparati)}`));
    }

    {
      const collaudo: string[] = [];
      if (s.rssi != null) collaudo.push(`un RSSI di ${s.rssi} dBm`);
      if (s.snr != null) collaudo.push(`un rapporto segnale/rumore di ${s.snr} dB`);
      if (s.ping_ms != null) collaudo.push(`un ping di ${s.ping_ms} ms`);
      if (s.download_mbps != null) collaudo.push(`${s.download_mbps} Mbps in download`);
      if (s.upload_mbps != null) collaudo.push(`${s.upload_mbps} Mbps in upload`);
      if (collaudo.length) frasi.push(frase(`In fase di collaudo sono stati rilevati ${elencoItaliano(collaudo)}`));
    }

    if (materiali) frasi.push(frase(`Sono stati impiegati i seguenti materiali: ${materiali}`));
    if (s.metodo_pagamento_posa) frasi.push(frase(`Il pagamento della posa è previsto ${testoMetodoPagamento(s.metodo_pagamento_posa)}`));
    if (s.note) frasi.push(frase(s.note));

    return frasi.filter(Boolean).join(" ");
  }

  // "Lavorazione tecnica"
  const frasi: string[] = [frase(`Intervento concluso con esito ${(s.esito ?? "non specificato").toLowerCase()}`)];
  if (s.interventi_eseguiti?.length) frasi.push(frase(`Sono stati effettuati i seguenti interventi: ${elencoItaliano(s.interventi_eseguiti)}`));
  if (materiali) frasi.push(frase(`Sono stati utilizzati i seguenti materiali/consumi: ${materiali}`));
  if (s.metodo_pagamento_posa) frasi.push(frase(`Il pagamento della posa è avvenuto ${testoMetodoPagamento(s.metodo_pagamento_posa)}`));
  if (s.note) frasi.push(frase(s.note));
  return frasi.filter(Boolean).join(" ");
}
