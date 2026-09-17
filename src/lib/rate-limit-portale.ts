// ★ ESTRATTO (2026-09-17, "controllo d'oro" — continuazione: trovato che
// api/portale/verifica-stato aveva già un rate limit per IP ("cerca per
// numero ticket + telefono: senza limite, conoscendo il telefono si
// potrebbe iterare il numero per trovare il ticket"), ma la rotta gemella
// api/portale/trova-cliente — che rivela il NOME REALE di un cliente se
// telefono+CF corrispondono, un rischio di correlazione dati anche più
// concreto — non aveva la stessa protezione. Stessa logica, estratta qui
// invece di duplicarla, cosicché un domani un terzo endpoint pubblico la
// riusi senza reinventarla.
//
// Rate limit in memoria per IP — non perfetto su serverless (si azzera ad
// ogni cold start / istanza diversa), ma alza comunque di molto il costo
// di un tentativo automatizzato senza bisogno di un servizio esterno
// (Redis/Upstash) non ancora presente nel progetto.
export function creaLimitatoreTentativi(massimoTentativi: number, finestraMs: number) {
  const tentativiPerIp = new Map<string, number[]>();

  return function troppiTentativi(ip: string): boolean {
    const ora = Date.now();
    const storico = (tentativiPerIp.get(ip) ?? []).filter((t) => ora - t < finestraMs);
    storico.push(ora);
    tentativiPerIp.set(ip, storico);
    // ★ pulizia opportunistica per non far crescere la Map all'infinito
    // nel lungo periodo di vita di un'istanza serverless.
    if (tentativiPerIp.size > 5000) tentativiPerIp.clear();
    return storico.length > massimoTentativi;
  };
}

/** IP del chiamante da una NextRequest.
 *
 * ★ FIX (2026-09-17, code review approfondita — bug reale nel mio stesso
 * codice di questa sessione) — prendevo il PRIMO indirizzo di
 * X-Forwarded-For, ma è il client stesso a poter impostare questo header
 * in partenza; Vercel non lo sostituisce, lo APPEND in coda con il vero IP
 * di chi si è connesso. Un chiamante poteva quindi mandare
 * "1.2.3.4, 5.6.7.8, ..." e far leggere sempre un IP falso diverso ad ogni
 * tentativo, azzerando di fatto il rate limit appena introdotto. L'ultimo
 * valore della lista è invece quello scritto dall'edge di Vercel, non
 * falsificabile dal client.
 */
export function ipRichiesta(request: Request): string {
  const valori = request.headers.get("x-forwarded-for")?.split(",") ?? [];
  return valori[valori.length - 1]?.trim() || "sconosciuto";
}
