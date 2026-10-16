import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { NOME_COMMERCIALE, RAGIONE_SOCIALE, INDIRIZZO_AZIENDA, PIVA_AZIENDA, TELEFONO_AZIENDA, ALIQUOTA_IVA, scorporaIva } from "@/lib/dati-azienda";
import { formattaValuta } from "@/lib/types";
import type { RigaPreventivo } from "@/lib/types";

/**
 * ★ NUOVA (2026-10-16, richiesta esplicita: "preventivo devono essere
 * scaricabili in pdf") — prima nel progetto non esisteva alcuna
 * generazione PDF reale (i contratti sono PDF caricati a mano, il
 * Rapportino usa "Stampa" del browser → "Salva come PDF", mai un file
 * generato lato server). Questo documento riusa esattamente gli stessi
 * dati e la stessa scomposizione IVA già mostrati su /approva/[token] e
 * nel pannello interno Preventivi (dati-azienda.ts, scorporaIva) — stesso
 * contenuto, solo un secondo formato di output.
 */

interface DatiPreventivoPdf {
  numero: number;
  cliente_nome: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  righe: RigaPreventivo[];
  totale: number;
  note: string | null;
  valido_fino_il: string | null;
  creato_il: string;
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#15181e" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  nomeAzienda: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  datiAzienda: { fontSize: 8.5, color: "#6b7280", lineHeight: 1.5 },
  titoloDoc: { fontSize: 14, fontWeight: 700, textAlign: "right" },
  metaDoc: { fontSize: 8.5, color: "#6b7280", textAlign: "right", marginTop: 2 },
  sezioneCliente: { marginBottom: 20, padding: 10, backgroundColor: "#f4f5f7", borderRadius: 4 },
  etichettaSezione: { fontSize: 8, fontWeight: 700, textTransform: "uppercase", color: "#6b7280", marginBottom: 4, letterSpacing: 0.5 },
  righeCliente: { fontSize: 10.5, fontWeight: 700 },
  righeClienteDettaglio: { fontSize: 9, color: "#6b7280", marginTop: 1 },
  tabella: { marginBottom: 4 },
  tabellaHeader: { flexDirection: "row", borderBottom: "1 solid #d1d5db", paddingBottom: 4, marginBottom: 4 },
  tabellaRiga: { flexDirection: "row", paddingVertical: 4, borderBottom: "0.5 solid #e5e7eb" },
  colDescrizione: { flex: 1 },
  colQuantita: { width: 50, textAlign: "center" },
  colPrezzo: { width: 80, textAlign: "right" },
  colTotaleRiga: { width: 80, textAlign: "right" },
  tabellaHeaderTesto: { fontSize: 8, fontWeight: 700, textTransform: "uppercase", color: "#6b7280" },
  riepilogo: { marginTop: 14, alignSelf: "flex-end", width: 220 },
  riepilogoRiga: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  riepilogoLabel: { color: "#6b7280" },
  riepilogoTotale: { flexDirection: "row", justifyContent: "space-between", paddingTop: 6, marginTop: 4, borderTop: "1 solid #15181e" },
  riepilogoTotaleTesto: { fontSize: 12, fontWeight: 700 },
  note: { marginTop: 24, fontSize: 9, color: "#374151" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 7.5, color: "#9ca3af", textAlign: "center", borderTop: "0.5 solid #e5e7eb", paddingTop: 8 },
});

export function PreventivoDocument({ preventivo }: { preventivo: DatiPreventivoPdf }) {
  const { imponibile, iva } = scorporaIva(preventivo.totale);
  const dataEmissione = new Date(preventivo.creato_il).toLocaleDateString("it-IT");
  const dataValidita = preventivo.valido_fino_il ? new Date(preventivo.valido_fino_il).toLocaleDateString("it-IT") : null;

  return (
    <Document title={`Preventivo #${preventivo.numero} — ${NOME_COMMERCIALE}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.nomeAzienda}>{NOME_COMMERCIALE}</Text>
            <Text style={styles.datiAzienda}>{RAGIONE_SOCIALE}</Text>
            <Text style={styles.datiAzienda}>{INDIRIZZO_AZIENDA}</Text>
            <Text style={styles.datiAzienda}>P.IVA {PIVA_AZIENDA} — Tel. {TELEFONO_AZIENDA}</Text>
          </View>
          <View>
            <Text style={styles.titoloDoc}>Preventivo #{preventivo.numero}</Text>
            <Text style={styles.metaDoc}>Emesso il {dataEmissione}</Text>
            {dataValidita && <Text style={styles.metaDoc}>Valido fino al {dataValidita}</Text>}
          </View>
        </View>

        <View style={styles.sezioneCliente}>
          <Text style={styles.etichettaSezione}>Cliente</Text>
          <Text style={styles.righeCliente}>{preventivo.cliente_nome}</Text>
          {preventivo.cliente_telefono && <Text style={styles.righeClienteDettaglio}>Tel. {preventivo.cliente_telefono}</Text>}
          {preventivo.cliente_email && <Text style={styles.righeClienteDettaglio}>{preventivo.cliente_email}</Text>}
        </View>

        <View style={styles.tabella}>
          <View style={styles.tabellaHeader}>
            <Text style={[styles.colDescrizione, styles.tabellaHeaderTesto]}>Descrizione</Text>
            <Text style={[styles.colQuantita, styles.tabellaHeaderTesto]}>Qt.</Text>
            <Text style={[styles.colPrezzo, styles.tabellaHeaderTesto]}>Prezzo</Text>
            <Text style={[styles.colTotaleRiga, styles.tabellaHeaderTesto]}>Totale</Text>
          </View>
          {preventivo.righe.map((r, i) => (
            <View key={i} style={styles.tabellaRiga}>
              <Text style={styles.colDescrizione}>{r.descrizione}</Text>
              <Text style={styles.colQuantita}>{r.quantita}</Text>
              <Text style={styles.colPrezzo}>{formattaValuta(r.prezzoUnitario)}</Text>
              <Text style={styles.colTotaleRiga}>{formattaValuta(r.quantita * r.prezzoUnitario)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.riepilogo}>
          <View style={styles.riepilogoRiga}>
            <Text style={styles.riepilogoLabel}>Imponibile</Text>
            <Text>{formattaValuta(imponibile)}</Text>
          </View>
          <View style={styles.riepilogoRiga}>
            <Text style={styles.riepilogoLabel}>IVA ({Math.round(ALIQUOTA_IVA * 100)}%)</Text>
            <Text>{formattaValuta(iva)}</Text>
          </View>
          <View style={styles.riepilogoTotale}>
            <Text style={styles.riepilogoTotaleTesto}>Totale (IVA inclusa)</Text>
            <Text style={styles.riepilogoTotaleTesto}>{formattaValuta(preventivo.totale)}</Text>
          </View>
        </View>

        {preventivo.note && (
          <View style={styles.note}>
            <Text style={styles.etichettaSezione}>Note</Text>
            <Text>{preventivo.note}</Text>
          </View>
        )}

        <Text style={styles.footer}>
          {RAGIONE_SOCIALE} — {INDIRIZZO_AZIENDA} — P.IVA {PIVA_AZIENDA} — Tel. {TELEFONO_AZIENDA}
        </Text>
      </Page>
    </Document>
  );
}
