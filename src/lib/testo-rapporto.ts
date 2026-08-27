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
// Apparati: Y. Collaudo: Z.": un elenco etichettato travestito da prosa.
//
// ★ RIFINITA (2026-08-27, richiesta esplicita: "va bene ma è troppo
// robotico") — il giro precedente aveva risolto l'elenco etichettato ma
// aveva introdotto un problema diverso: ogni frase iniziava con lo stesso
// stampo passivo ("È stata montata...", "Sono stati installati...", "In
// fase di collaudo sono stati rilevati...", "Sono stati impiegati...") —
// grammaticalmente prosa, ma nella forma un modulo compilato, non un
// tecnico che scrive. Qui i gruppi di campi imparentati (struttura +
// cablaggio, apparati + collaudo, materiali + pagamento) si fondono in
// un'unica frase con connettivi naturali ("e", "mentre", "; ") invece di
// restare frasi separate tutte con lo stesso soggetto sottinteso — meno
// ripetizione di forma, più il ritmo di una nota scritta a mano.

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

/** Prima lettera minuscola — per inserire un valore già scritto altrove
 * (es. un'etichetta di menu come "Riallineamento Antenna") a metà di una
 * frase, senza una maiuscola fuori posto. */
function minuscolaIniziale(testo: string): string {
  return testo.charAt(0).toLowerCase() + testo.slice(1);
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
  if (r.materiali) frasi.push(frase(`Materiali utilizzati: ${r.materiali}`));
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

    // Struttura + cablaggio: un'unica frase ("montata su... e cablata
    // con...") invece di due frasi separate con lo stesso soggetto muto.
    {
      const parti: string[] = [];
      if (s.supporto) {
        const posizione = s.posizione ? ` (${s.posizione.toLowerCase()})` : "";
        parti.push(`montata su ${s.supporto.toLowerCase()}${posizione}`);
      }
      if (s.metri_cavo) {
        const bts = s.bts ? ` fino alla BTS di ${s.bts}` : "";
        parti.push(`cablata con ${s.metri_cavo} metri di cavo${s.tipo_cavo ? ` ${s.tipo_cavo}` : ""}${bts}`);
      } else if (s.bts) {
        parti.push(`agganciata alla BTS di ${s.bts}`);
      }
      if (parti.length) frasi.push(frase(`Antenna ${parti.join(" e ")}`));
    }

    // Apparati + collaudo: stesso principio, uniti con "mentre" quando
    // sono presenti entrambi, altrimenti quello che c'è resta da solo.
    {
      const apparati: string[] = [];
      if (s.modello_cpe) apparati.push(`un CPE ${s.modello_cpe}${s.mac ? ` (MAC ${s.mac})` : ""}`);
      if (s.router) apparati.push(`un router ${s.router}`);
      if (s.vlan) apparati.push(`la VLAN ${s.vlan}`);

      const collaudo: string[] = [];
      if (s.rssi != null) collaudo.push(`un RSSI di ${s.rssi} dBm`);
      if (s.snr != null) collaudo.push(`un rapporto segnale/rumore di ${s.snr} dB`);
      if (s.ping_ms != null) collaudo.push(`un ping di ${s.ping_ms} ms`);
      if (s.download_mbps != null) collaudo.push(`${s.download_mbps} Mbps in download`);
      if (s.upload_mbps != null) collaudo.push(`${s.upload_mbps} Mbps in upload`);

      const partiApparati = apparati.length ? `Come apparati sono stati usati ${elencoItaliano(apparati)}` : "";
      const partiCollaudo = collaudo.length ? `il collaudo ha dato ${elencoItaliano(collaudo)}` : "";
      if (partiApparati && partiCollaudo) frasi.push(frase(`${partiApparati}, mentre ${partiCollaudo}`));
      else if (partiApparati) frasi.push(frase(partiApparati));
      else if (partiCollaudo) frasi.push(frase(`Il collaudo ha dato ${collaudo.join(", ")}`));
    }

    // Materiali + pagamento: uniti con ";" — due fatti diversi ma corti,
    // non vale la pena due frasi separate per uno ciascuno.
    {
      const partiMateriali = materiali ? `Tra i materiali impiegati figurano ${materiali}` : "";
      const partiPagamento = s.metodo_pagamento_posa ? `la posa verrà pagata ${testoMetodoPagamento(s.metodo_pagamento_posa)}` : "";
      if (partiMateriali && partiPagamento) frasi.push(frase(`${partiMateriali}; ${partiPagamento}`));
      else if (partiMateriali) frasi.push(frase(partiMateriali));
      else if (partiPagamento) frasi.push(frase(`Il pagamento della posa è previsto ${testoMetodoPagamento(s.metodo_pagamento_posa!)}`));
    }

    if (s.note) frasi.push(frase(s.note));

    return frasi.filter(Boolean).join(" ");
  }

  // "Lavorazione tecnica"
  const frasi: string[] = [];
  {
    const esito = `esito ${(s.esito ?? "non specificato").toLowerCase()}`;
    if (s.interventi_eseguiti?.length) {
      const interventi = elencoItaliano(s.interventi_eseguiti.map(minuscolaIniziale));
      frasi.push(frase(`Intervento concluso con ${esito}: sul posto sono stati effettuati ${interventi}`));
    } else {
      frasi.push(frase(`Intervento concluso con ${esito}`));
    }
  }

  {
    const partiMateriali = materiali ? `Materiali/consumi impiegati: ${materiali}` : "";
    const partiPagamento = s.metodo_pagamento_posa ? `pagamento della posa ${testoMetodoPagamento(s.metodo_pagamento_posa)}` : "";
    if (partiMateriali && partiPagamento) frasi.push(frase(`${partiMateriali}; ${partiPagamento}`));
    else if (partiMateriali) frasi.push(frase(partiMateriali));
    else if (partiPagamento) frasi.push(frase(`Il pagamento della posa è avvenuto ${testoMetodoPagamento(s.metodo_pagamento_posa!)}`));
  }

  if (s.note) frasi.push(frase(s.note));
  return frasi.filter(Boolean).join(" ");
}
