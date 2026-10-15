/**
 * ★ NUOVA (2026-10-15, richiesta esplicita: "verifica nei preventivi che ci
 * siano tutti i dati che devono esserci per legge") — prima questi dati
 * esistevano SOLO come stringa scritta a mano dentro email.ts (footer di
 * ogni email transazionale), nessun'altra fonte nel progetto. Risultato:
 * il preventivo che il cliente apre e approva (/approva/[token]) non
 * mostrava MAI la ragione sociale/P.IVA/indirizzo dell'azienda — solo
 * l'email che ci linkava, mai la pagina del preventivo stessa. Un'unica
 * fonte qui, riusata sia dal footer email sia dalla pagina del preventivo,
 * invece di due stringhe che potrebbero disallinearsi nel tempo.
 */
export const NOME_COMMERCIALE = "Done Wifi";
export const RAGIONE_SOCIALE = "Studio Armonia Srl";
export const INDIRIZZO_AZIENDA = "Via Tourneuve 6, 11100 Aosta (AO)";
export const PIVA_AZIENDA = "05690180012";
export const TELEFONO_AZIENDA = "0165 1825169";

export const DATI_AZIENDA_TESTO = `${NOME_COMMERCIALE} — ${RAGIONE_SOCIALE}, ${INDIRIZZO_AZIENDA} — P.IVA ${PIVA_AZIENDA} — Tel. ${TELEFONO_AZIENDA}`;

/**
 * ★ NUOVA (2026-10-15, richiesta esplicita: "verifica nei preventivi che
 * ci siano tutti i dati che devono esserci per legge" → confermato
 * dall'utente: Studio Armonia è una Srl, quindi necessariamente in regime
 * IVA ordinario — il regime forfettario è riservato a ditte individuali/
 * professionisti, escluso per le società di capitali — aliquota 22%,
 * prezzi inseriti nei preventivi già IVA inclusa) — prima il preventivo
 * mostrava solo un "Totale" secco, senza scomposizione IVA. `prezzoUnitario`
 * nelle righe resta IVA inclusa come già salvato: questa funzione scorpora
 * solo per la VISUALIZZAZIONE, nessun valore salvato cambia significato.
 */
export const ALIQUOTA_IVA = 0.22;

export function scorporaIva(totaleConIva: number): { imponibile: number; iva: number } {
  const imponibile = totaleConIva / (1 + ALIQUOTA_IVA);
  return { imponibile, iva: totaleConIva - imponibile };
}
